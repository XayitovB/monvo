"""
routers/loyalty.py
──────────────────
Merchant uchun loyalty konstruktor: qoidalarni CRUD qilish.

  GET    /merchants/me/loyalty/rule-types  — mavjud rule turlari (UI schema)
  GET    /merchants/me/loyalty/rules       — merchantning qoidalari
  POST   /merchants/me/loyalty/rules       — yangi qoida qo'shish
  PATCH  /merchants/me/loyalty/rules/{id}  — qoida yangilash
  PATCH  /merchants/me/loyalty/rules/{id}/toggle — is_active o'zgartirish
  DELETE /merchants/me/loyalty/rules/{id}
  POST   /merchants/me/loyalty/preview     — tranzaksiya simulatsiyasi (ballarni hisoblab ko'rish)
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_merchant
from core.loyalty_engine import RULE_TYPES, evaluate
from database import get_db
from models import Card, LoyaltyRule, Merchant

router = APIRouter(prefix="/merchants/me/loyalty", tags=["🎁 Loyalty Constructor"])


# ── Schemas ──────────────────────────────────────────────────────────────────
class _RuleIn(BaseModel):
    rule_type: str = Field(min_length=1, max_length=40)
    name: str = Field("", max_length=150)
    description: str = ""
    is_active: bool = True
    priority: int = Field(100, ge=0, le=1000)
    config: dict = Field(default_factory=dict)


class _RuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None
    config: Optional[dict] = None


class _PreviewIn(BaseModel):
    card_uid: str
    amount: float = 0.0


# ── Rule type catalog ────────────────────────────────────────────────────────
@router.get("/rule-types", summary="Qo'shilishi mumkin bo'lgan qoida turlari")
async def rule_types(merchant: Merchant = Depends(get_current_merchant)):
    """
    UI konstruktor uchun — har rule_type uchun qaysi field'lar borligini qaytaradi.
    """
    return [
        {
            "key": key,
            "label": meta["label"],
            "description": meta["description"],
            "icon": meta.get("icon", "settings"),
            "fields": meta["fields"],
            "defaults": meta["defaults"],
        }
        for key, meta in RULE_TYPES.items()
    ]


# ── List ─────────────────────────────────────────────────────────────────────
@router.get("/rules", summary="Mening qoidalarim")
async def list_rules(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(LoyaltyRule)
        .where(LoyaltyRule.merchant_id == merchant.id)
        .order_by(LoyaltyRule.priority.asc(), LoyaltyRule.id.desc())
    )).scalars().all()

    return [
        {
            "id": r.id,
            "rule_type": r.rule_type,
            "name": r.name or RULE_TYPES.get(r.rule_type, {}).get("label", r.rule_type),
            "description": r.description,
            "is_active": r.is_active,
            "priority": r.priority,
            "config": r.config or {},
            "type_label": RULE_TYPES.get(r.rule_type, {}).get("label", r.rule_type),
            "type_icon": RULE_TYPES.get(r.rule_type, {}).get("icon", "settings"),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


# ── Create ───────────────────────────────────────────────────────────────────
@router.post("/rules", status_code=201, summary="Yangi qoida qo'shish")
async def create_rule(
    body: _RuleIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    if body.rule_type not in RULE_TYPES:
        raise HTTPException(400, f"Noma'lum rule_type: {body.rule_type}")

    meta = RULE_TYPES[body.rule_type]
    # Config'ni defaults bilan to'ldirish (yo'q maydonlarni ta'minlash)
    merged = {**meta["defaults"], **(body.config or {})}

    rule = LoyaltyRule(
        merchant_id=merchant.id,
        rule_type=body.rule_type,
        name=body.name.strip() or meta["label"],
        description=body.description,
        is_active=body.is_active,
        priority=body.priority,
        config=merged,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    logger.success(f"Loyalty rule yaratildi: merchant={merchant.id} type={body.rule_type}")
    return {"id": rule.id}


# ── Update ───────────────────────────────────────────────────────────────────
@router.patch("/rules/{rule_id}", summary="Qoidani yangilash")
async def update_rule(
    rule_id: int,
    body: _RuleUpdate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(LoyaltyRule).where(
            LoyaltyRule.id == rule_id,
            LoyaltyRule.merchant_id == merchant.id,
        )
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Qoida topilmadi")

    data = body.model_dump(exclude_unset=True)
    if "config" in data and data["config"] is not None:
        meta = RULE_TYPES.get(rule.rule_type, {})
        defaults = meta.get("defaults", {})
        rule.config = {**defaults, **data.pop("config")}
    for k, v in data.items():
        if v is not None:
            setattr(rule, k, v)

    await db.commit()
    await db.refresh(rule)
    return {"id": rule.id, "ok": True}


# ── Toggle ───────────────────────────────────────────────────────────────────
@router.patch("/rules/{rule_id}/toggle", summary="Yoqish/o'chirish")
async def toggle_rule(
    rule_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(LoyaltyRule).where(
            LoyaltyRule.id == rule_id,
            LoyaltyRule.merchant_id == merchant.id,
        )
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Qoida topilmadi")
    rule.is_active = not rule.is_active
    await db.commit()
    return {"id": rule.id, "is_active": rule.is_active}


# ── Delete ───────────────────────────────────────────────────────────────────
@router.delete("/rules/{rule_id}", summary="Qoidani o'chirish")
async def delete_rule(
    rule_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rule = (await db.execute(
        select(LoyaltyRule).where(
            LoyaltyRule.id == rule_id,
            LoyaltyRule.merchant_id == merchant.id,
        )
    )).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Qoida topilmadi")
    await db.delete(rule)
    await db.commit()
    return {"message": "O'chirildi"}


# ── Preview (simulyatsiya — DB'ga yozmaydi) ──────────────────────────────────
@router.post("/preview", summary="Ball hisobi simulyatsiyasi")
async def preview_scan(
    body: _PreviewIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """
    Konstruktorda qoidalarni qo'shgandan so'ng, merchant "agar shu karta shu
    summaga xarid qilsa nechta ball bo'ladi?" deya tekshirib ko'rishi mumkin.
    Natijada `applied` ro'yxatida qaysi qoidalar qanday hissa qo'shganini ko'radi.
    """
    card = (await db.execute(
        select(Card).where(
            Card.card_uid == body.card_uid,
            Card.merchant_id == merchant.id,
        )
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")

    # Savepoint — DB'ga yozib, so'ng rollback qilamiz
    sp = await db.begin_nested()
    try:
        result = await evaluate(merchant.id, card, body.amount, db)
    finally:
        await sp.rollback()

    return {
        "total_points": result.total_points,
        "reward_title": result.reward_title,
        "applied": [
            {
                "rule_id": a.rule_id,
                "rule_type": a.rule_type,
                "name": a.name,
                "points": a.points,
                "note": a.note,
            }
            for a in result.applied
        ],
    }
