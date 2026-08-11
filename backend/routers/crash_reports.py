"""Mobil crash/xato hisoboti.

  POST /crash-report            — mobil ilova xatolarni yuboradi (public, rate-limited)
  GET  /admin/crashes           — admin: guruhlangan xatolar ro'yxati
  GET  /admin/crashes/{id}      — admin: bitta xato sababi BATAFSIL (stack + breadcrumbs)
  POST /admin/crashes/{id}/resolve  — hal qilingan deb belgilash (toggle)
  DELETE /admin/crashes/{id}    — o'chirish

Xatolar imzo (signature) bo'yicha guruhlanadi: bir xil xato qayta kelsa
`occurrences` oshadi, so'nggi namuna yangilanadi va (agar resolved bo'lsa)
qayta ochiladi.
"""
import hashlib
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from database import get_db
from models import CrashReport

router = APIRouter(tags=["💥 Crash reports"])

from main import limiter as _limiter


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _first_frame(stack: str) -> str:
    """Stack-trace'dan birinchi mazmunli (ilova) freymni topadi — imzo uchun."""
    for line in (stack or "").splitlines():
        s = line.strip()
        if s.startswith("#") or s.startswith("at ") or "package:" in s:
            return s[:200]
    return (stack or "").strip().splitlines()[0][:200] if stack else ""


def _signature(platform: str, error_type: str, message: str, stack: str) -> str:
    """Guruhlash uchun barqaror imzo. Xabardagi o'zgaruvchan qismlar
    (raqamlar, hex, manzillar) normallashtiriladi — bir xil bug bitta guruhga."""
    norm_msg = re.sub(r"0x[0-9a-fA-F]+|\d+", "#", (message or "")[:300])
    raw = f"{platform}|{error_type}|{norm_msg}|{_first_frame(stack)}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class CrashIn(BaseModel):
    platform: str = Field("", max_length=20)
    fatal: bool = True
    error_type: str = Field("", max_length=200)
    message: str = ""
    stack_trace: str = ""
    screen: str = Field("", max_length=120)
    app_version: str = Field("", max_length=40)
    os_version: str = Field("", max_length=60)
    device_model: str = Field("", max_length=120)
    breadcrumbs: list = Field(default_factory=list)


@router.post("/crash-report", status_code=202, summary="Mobil crash hisoboti yuborish")
@_limiter.limit("60/minute")
async def report_crash(
    request: Request,
    body: CrashIn,
    db: AsyncSession = Depends(get_db),
):
    sig = _signature(body.platform, body.error_type, body.message, body.stack_trace)
    now = _now()
    # JSON ustunlar juda katta bo'lib ketmasin
    stack = (body.stack_trace or "")[:20000]
    crumbs = (body.breadcrumbs or [])[-40:]

    row = (await db.execute(
        select(CrashReport).where(CrashReport.signature == sig)
    )).scalar_one_or_none()

    if row is None:
        row = CrashReport(
            signature=sig,
            platform=body.platform, fatal=body.fatal,
            error_type=body.error_type, message=(body.message or "")[:5000],
            stack_trace=stack, screen=body.screen,
            app_version=body.app_version, os_version=body.os_version,
            device_model=body.device_model,
            breadcrumbs=crumbs,
            affected_versions=[body.app_version] if body.app_version else [],
            occurrences=1, resolved=False,
            first_seen=now, last_seen=now,
        )
        db.add(row)
    else:
        row.occurrences = (row.occurrences or 0) + 1
        row.last_seen = now
        # so'nggi namunani yangilaymiz (eng yangi kontekst foydaliroq)
        row.message = (body.message or "")[:5000]
        row.stack_trace = stack
        row.screen = body.screen or row.screen
        row.os_version = body.os_version or row.os_version
        row.device_model = body.device_model or row.device_model
        row.breadcrumbs = crumbs
        if body.app_version:
            row.app_version = body.app_version
            vers = list(row.affected_versions or [])
            if body.app_version not in vers:
                vers.append(body.app_version)
                row.affected_versions = vers[-20:]
        row.resolved = False  # qayta yuz berdi — qayta ochamiz

    await db.commit()
    return {"ok": True}


def _serialize(r: CrashReport, *, full: bool = False) -> dict:
    base = {
        "id": r.id,
        "platform": r.platform,
        "fatal": r.fatal,
        "error_type": r.error_type,
        "message": r.message,
        "screen": r.screen,
        "app_version": r.app_version,
        "os_version": r.os_version,
        "device_model": r.device_model,
        "occurrences": r.occurrences,
        "affected_versions": r.affected_versions or [],
        "resolved": r.resolved,
        "first_seen": r.first_seen.isoformat() if r.first_seen else None,
        "last_seen": r.last_seen.isoformat() if r.last_seen else None,
    }
    if full:
        base["stack_trace"] = r.stack_trace
        base["breadcrumbs"] = r.breadcrumbs or []
        base["signature"] = r.signature
    return base


@router.get("/admin/crashes", summary="Crash hisobotlari ro'yxati (guruhlangan)")
async def list_crashes(
    resolved: Optional[bool] = Query(None, description="filtr: hal qilingan/qilinmagan"),
    platform: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(CrashReport)
    if resolved is not None:
        q = q.where(CrashReport.resolved == resolved)
    if platform:
        q = q.where(CrashReport.platform == platform)
    total = (await db.execute(
        select(sa_func.count()).select_from(q.subquery())
    )).scalar() or 0
    rows = (await db.execute(
        q.order_by(CrashReport.last_seen.desc()).limit(limit).offset(offset)
    )).scalars().all()
    # ochilmagan crashlar soni — badge uchun
    unresolved = (await db.execute(
        select(sa_func.count()).select_from(CrashReport).where(CrashReport.resolved == False)  # noqa: E712
    )).scalar() or 0
    return {
        "total": total,
        "unresolved": unresolved,
        "items": [_serialize(r) for r in rows],
    }


@router.get("/admin/crashes/{crash_id}", summary="Bitta crash — BATAFSIL (stack + breadcrumbs)")
async def get_crash(
    crash_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(CrashReport, crash_id)
    if row is None:
        raise HTTPException(404, "Crash topilmadi")
    return _serialize(row, full=True)


@router.post("/admin/crashes/{crash_id}/resolve", summary="Hal qilindi deb belgilash (toggle)")
async def resolve_crash(
    crash_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(CrashReport, crash_id)
    if row is None:
        raise HTTPException(404, "Crash topilmadi")
    row.resolved = not row.resolved
    await db.commit()
    return {"ok": True, "resolved": row.resolved}


@router.delete("/admin/crashes/{crash_id}", status_code=204, summary="Crash o'chirish")
async def delete_crash(
    crash_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(CrashReport, crash_id)
    if row is not None:
        await db.delete(row)
        await db.commit()
    return None
