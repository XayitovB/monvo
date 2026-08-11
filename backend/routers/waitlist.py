import csv
import io
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from core.telegram import send_telegram_message, format_demo_lead
from database import get_db
from models import Waitlist, DemoLead

router = APIRouter(tags=["📧 Waitlist"])


class WaitlistIn(BaseModel):
    email: EmailStr


@router.post("/waitlist", summary="Waitlist ga qo'shilish")
async def join_waitlist(body: WaitlistIn, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Waitlist).where(Waitlist.email == body.email))
    if existing.scalar_one_or_none():
        return {"ok": True, "already": True}
    db.add(Waitlist(email=body.email))
    await db.commit()
    return {"ok": True, "already": False}


# ── Demo Lead (landing demo formasi) ─────────────────────────────────────────
class DemoLeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=4, max_length=40)
    business_name: str = Field(default="", max_length=200)
    business_type: str = Field(default="", max_length=80)
    source: str = Field(default="landing-demo-form", max_length=80)


@router.post("/demo-lead", summary="Landing demo zayafkasi (Telegramga yuboriladi)")
async def submit_demo_lead(body: DemoLeadIn, db: AsyncSession = Depends(get_db)):
    lead = DemoLead(
        name=body.name.strip(),
        phone=body.phone.strip(),
        business_name=body.business_name.strip(),
        business_type=body.business_type.strip(),
        source=body.source.strip() or "landing-demo-form",
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)

    sent, info = await send_telegram_message(db, format_demo_lead(lead))
    if sent:
        lead.telegram_sent = True
        await db.commit()
    else:
        # Telegram nosoz bo'lsa ham foydalanuvchi uchun OK qaytaramiz —
        # zayafka DB'da saqlangan, admin keyinroq ko'ra oladi.
        logger.info(f"demo lead {lead.id} saved but telegram not sent: {info}")

    return {"ok": True, "id": lead.id, "telegram_sent": sent}


@router.get("/admin/demo-leads", summary="Demo zayafkalar ro'yxati")
async def get_demo_leads(
    skip: int = 0, limit: int = 50,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(func.count()).select_from(DemoLead))).scalar() or 0
    rows = (await db.execute(
        select(DemoLead).order_by(DemoLead.created_at.desc()).offset(skip).limit(limit)
    )).scalars().all()
    return {
        "total": total,
        "items": [{
            "id": r.id, "name": r.name, "phone": r.phone,
            "business_name": r.business_name, "business_type": r.business_type,
            "source": r.source, "telegram_sent": r.telegram_sent,
            "created_at": r.created_at.isoformat(),
        } for r in rows],
    }


@router.get("/admin/waitlist", summary="Waitlist ro'yxati (admin)")
async def get_waitlist(
    skip: int = 0, limit: int = 50,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    total_q = await db.execute(select(func.count()).select_from(Waitlist))
    total = total_q.scalar() or 0
    rows_q = await db.execute(
        select(Waitlist).order_by(Waitlist.created_at.desc()).offset(skip).limit(limit)
    )
    items = rows_q.scalars().all()
    return {
        "total": total,
        "items": [{"id": w.id, "email": w.email, "created_at": w.created_at.isoformat()} for w in items],
    }


@router.get("/admin/waitlist/export", summary="Waitlist CSV export")
async def export_waitlist(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    rows_q = await db.execute(select(Waitlist).order_by(Waitlist.created_at.desc()))
    rows = rows_q.scalars().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "email", "created_at"])
    for w in rows:
        writer.writerow([w.id, w.email, w.created_at.isoformat()])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=waitlist.csv"},
    )
