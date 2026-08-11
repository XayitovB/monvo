"""
routers/experiments.py
──────────────────────
A/B testing (eksperimentlar) — ikki yoki undan ortiq variantlarni sinash.

  POST   /admin/experiments              — yangi eksperiment yaratish
  GET    /admin/experiments              — ro'yxat
  GET    /admin/experiments/{id}         — tafsilot + natijalar (lift, CR)
  PATCH  /admin/experiments/{id}/status  — draft → running → paused → finished
  DELETE /admin/experiments/{id}
  POST   /admin/experiments/{id}/track   — event yozish (impression | conversion)
  GET    /experiments/{id}/assign        — foydalanuvchi variantini olish (public-ish)
"""
import hashlib
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from database import get_db
from models import Experiment, ExperimentEvent, ExperimentVariant

router = APIRouter(prefix="/admin/experiments", tags=["🧪 A/B Testing"])
public_router = APIRouter(prefix="/experiments", tags=["🧪 A/B Testing"])


# ── Schemas ──────────────────────────────────────────────────────────────────
class _VariantIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    weight: int = Field(50, ge=0, le=100)
    is_control: bool = False


class _ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str = ""
    hypothesis: str = ""
    primary_metric: str = Field("conversion", pattern="^(conversion|revenue|retention)$")
    merchant_id: Optional[int] = None
    variants: List[_VariantIn]


class _StatusUpdate(BaseModel):
    status: str = Field(pattern="^(draft|running|paused|finished)$")


class _TrackEvent(BaseModel):
    variant_id: int
    event_type: str = Field(pattern="^(impression|conversion)$")
    user_id: Optional[int] = None
    value: float = 0.0


# ── Create ───────────────────────────────────────────────────────────────────
@router.post("", summary="Yangi eksperiment yaratish")
async def create_experiment(
    body: _ExperimentCreate,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if len(body.variants) < 2:
        raise HTTPException(400, "Kamida 2 ta variant kerak")

    total_weight = sum(v.weight for v in body.variants)
    if total_weight != 100:
        raise HTTPException(400, f"Variant weight yig'indisi 100 bo'lishi kerak (hozir: {total_weight})")

    control_count = sum(1 for v in body.variants if v.is_control)
    if control_count != 1:
        raise HTTPException(400, "Bitta control variant bo'lishi shart")

    exp = Experiment(
        name=body.name.strip(),
        description=body.description,
        hypothesis=body.hypothesis,
        primary_metric=body.primary_metric,
        merchant_id=body.merchant_id,
        status="draft",
        created_by=admin.get("sub", "admin"),
    )
    db.add(exp)
    await db.flush()

    for v in body.variants:
        db.add(ExperimentVariant(
            experiment_id=exp.id,
            name=v.name.strip(),
            description=v.description,
            weight=v.weight,
            is_control=v.is_control,
        ))

    await db.commit()
    await db.refresh(exp)
    logger.success(f"Experiment yaratildi: id={exp.id} name={exp.name}")
    return {"id": exp.id, "name": exp.name, "status": exp.status}


# ── List ─────────────────────────────────────────────────────────────────────
@router.get("", summary="Eksperimentlar ro'yxati")
async def list_experiments(
    status: str = Query("", pattern="^(|draft|running|paused|finished)$"),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Experiment).order_by(Experiment.id.desc())
    if status:
        q = q.where(Experiment.status == status)
    rows = (await db.execute(q)).scalars().all()

    exp_ids = [e.id for e in rows] or [0]
    # Variant va event sonini hisoblab olamiz
    var_counts = dict((await db.execute(
        select(ExperimentVariant.experiment_id, sa_func.count(ExperimentVariant.id))
        .where(ExperimentVariant.experiment_id.in_(exp_ids))
        .group_by(ExperimentVariant.experiment_id)
    )).all())
    ev_counts = dict((await db.execute(
        select(ExperimentEvent.experiment_id, sa_func.count(ExperimentEvent.id))
        .where(ExperimentEvent.experiment_id.in_(exp_ids))
        .group_by(ExperimentEvent.experiment_id)
    )).all())

    return [
        {
            "id": e.id,
            "name": e.name,
            "description": e.description,
            "primary_metric": e.primary_metric,
            "status": e.status,
            "merchant_id": e.merchant_id,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "ended_at": e.ended_at.isoformat() if e.ended_at else None,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "variants_count": int(var_counts.get(e.id, 0)),
            "events_count": int(ev_counts.get(e.id, 0)),
        }
        for e in rows
    ]


# ── Detail + results ─────────────────────────────────────────────────────────
@router.get("/{exp_id}", summary="Eksperiment tafsiloti va natijalari")
async def get_experiment(
    exp_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    exp = (await db.execute(select(Experiment).where(Experiment.id == exp_id))).scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "Eksperiment topilmadi")

    variants = (await db.execute(
        select(ExperimentVariant).where(ExperimentVariant.experiment_id == exp_id)
        .order_by(ExperimentVariant.is_control.desc(), ExperimentVariant.id)
    )).scalars().all()

    # Har variant uchun impressions, conversions, revenue
    agg = (await db.execute(
        select(
            ExperimentEvent.variant_id,
            ExperimentEvent.event_type,
            sa_func.count(ExperimentEvent.id).label("cnt"),
            sa_func.coalesce(sa_func.sum(ExperimentEvent.value), 0).label("val_sum"),
        )
        .where(ExperimentEvent.experiment_id == exp_id)
        .group_by(ExperimentEvent.variant_id, ExperimentEvent.event_type)
    )).all()

    stats: dict = {v.id: {"impressions": 0, "conversions": 0, "revenue": 0.0} for v in variants}
    for r in agg:
        if r.variant_id not in stats:
            continue
        if r.event_type == "impression":
            stats[r.variant_id]["impressions"] = int(r.cnt or 0)
        elif r.event_type == "conversion":
            stats[r.variant_id]["conversions"] = int(r.cnt or 0)
            stats[r.variant_id]["revenue"] = float(r.val_sum or 0)

    # Control uchun CR
    control = next((v for v in variants if v.is_control), None)
    control_cr = 0.0
    if control:
        s = stats[control.id]
        control_cr = s["conversions"] / s["impressions"] if s["impressions"] > 0 else 0.0

    variants_out = []
    for v in variants:
        s = stats[v.id]
        cr = s["conversions"] / s["impressions"] if s["impressions"] > 0 else 0.0
        lift = (cr - control_cr) / control_cr * 100 if control_cr > 0 and not v.is_control else None
        variants_out.append({
            "id": v.id,
            "name": v.name,
            "description": v.description,
            "is_control": v.is_control,
            "weight": v.weight,
            "impressions": s["impressions"],
            "conversions": s["conversions"],
            "revenue": round(s["revenue"], 2),
            "conversion_rate": round(cr * 100, 2),
            "lift_vs_control": round(lift, 2) if lift is not None else None,
        })

    return {
        "id": exp.id,
        "name": exp.name,
        "description": exp.description,
        "hypothesis": exp.hypothesis,
        "primary_metric": exp.primary_metric,
        "status": exp.status,
        "merchant_id": exp.merchant_id,
        "started_at": exp.started_at.isoformat() if exp.started_at else None,
        "ended_at": exp.ended_at.isoformat() if exp.ended_at else None,
        "created_at": exp.created_at.isoformat() if exp.created_at else None,
        "variants": variants_out,
    }


# ── Status o'zgartirish ──────────────────────────────────────────────────────
@router.patch("/{exp_id}/status", summary="Eksperiment holati")
async def update_status(
    exp_id: int,
    body: _StatusUpdate,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    exp = (await db.execute(select(Experiment).where(Experiment.id == exp_id))).scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "Eksperiment topilmadi")

    now = datetime.now(timezone.utc)
    if body.status == "running" and not exp.started_at:
        exp.started_at = now
    if body.status == "finished" and not exp.ended_at:
        exp.ended_at = now

    exp.status = body.status
    await db.commit()
    logger.info(f"Experiment #{exp_id} status → {body.status}")
    return {"id": exp.id, "status": exp.status}


# ── Delete ───────────────────────────────────────────────────────────────────
@router.delete("/{exp_id}", summary="Eksperiment o'chirish")
async def delete_experiment(
    exp_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    exp = (await db.execute(select(Experiment).where(Experiment.id == exp_id))).scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "Eksperiment topilmadi")
    await db.delete(exp)
    await db.commit()
    return {"message": "O'chirildi"}


# ── Event tracking ───────────────────────────────────────────────────────────
@router.post("/{exp_id}/track", summary="Event yozish (impression/conversion)")
async def track_event(
    exp_id: int,
    body: _TrackEvent,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    exp = (await db.execute(select(Experiment).where(Experiment.id == exp_id))).scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "Eksperiment topilmadi")
    if exp.status != "running":
        raise HTTPException(400, f"Eksperiment '{exp.status}' holatida — event qabul qilinmaydi")

    variant = (await db.execute(
        select(ExperimentVariant).where(
            ExperimentVariant.id == body.variant_id,
            ExperimentVariant.experiment_id == exp_id,
        )
    )).scalar_one_or_none()
    if not variant:
        raise HTTPException(404, "Variant topilmadi")

    ev = ExperimentEvent(
        experiment_id=exp_id,
        variant_id=body.variant_id,
        user_id=body.user_id,
        event_type=body.event_type,
        value=body.value,
    )
    db.add(ev)
    await db.commit()
    return {"id": ev.id, "ok": True}


# ── Public: foydalanuvchi variant olish (deterministic bucketing) ────────────
@public_router.get("/{exp_id}/assign", summary="Variant olish (deterministic)")
async def assign_variant(
    exp_id: int,
    user_key: str = Query(..., min_length=1, max_length=200),
    db: AsyncSession = Depends(get_db),
):
    """
    user_key (user_id, card_uid, device_id, ...) asosida foydalanuvchini doim bir
    xil variantga biriktirish. Stateless: xesh → 0..99 → weight bo'yicha tanlash.
    """
    exp = (await db.execute(select(Experiment).where(Experiment.id == exp_id))).scalar_one_or_none()
    if not exp:
        raise HTTPException(404, "Eksperiment topilmadi")
    if exp.status != "running":
        raise HTTPException(400, "Eksperiment ishlamayapti")

    variants = (await db.execute(
        select(ExperimentVariant).where(ExperimentVariant.experiment_id == exp_id)
        .order_by(ExperimentVariant.id)
    )).scalars().all()
    if not variants:
        raise HTTPException(404, "Variantlar topilmadi")

    seed = f"{exp_id}:{user_key}".encode()
    bucket = int(hashlib.md5(seed).hexdigest(), 16) % 100

    cumulative = 0
    chosen = variants[-1]
    for v in variants:
        cumulative += v.weight
        if bucket < cumulative:
            chosen = v
            break

    return {
        "experiment_id": exp_id,
        "variant_id": chosen.id,
        "variant_name": chosen.name,
        "is_control": chosen.is_control,
    }
