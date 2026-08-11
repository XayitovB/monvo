"""
routers/merchant_webhooks.py
─────────────────────────────
Merchant outbound webhook konfiguratsiyasi va delivery loglari.

Endpointlar:
  GET    /merchants/me/webhooks              — ro'yxat
  POST   /merchants/me/webhooks              — yangi webhook yaratish
  PATCH  /merchants/me/webhooks/{id}         — yangilash
  DELETE /merchants/me/webhooks/{id}         — o'chirish
  POST   /merchants/me/webhooks/{id}/test    — test ping yuborish
  GET    /merchants/me/webhooks/{id}/logs    — delivery loglari
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_merchant
from core.webhooks import _attempt
from database import get_db
from models import Merchant, MerchantWebhook, WebhookDelivery

router = APIRouter(prefix="/merchants/me/webhooks", tags=["🔔 Outbound Webhooks"])

SUPPORTED_EVENTS = [
    "transaction.earn",
    "transaction.redeem",
    "transaction.spend",
    "card.created",
    "card.tier_changed",
]


# ─── Schemas ─────────────────────────────────────────────────────────────────

class WebhookIn(BaseModel):
    url: str = Field(..., min_length=8, max_length=500, description="HTTPS URL")
    description: str = Field("", max_length=200)
    events: list[str] = Field(
        default_factory=lambda: ["*"],
        description="'*' = hammasi, yoki ['transaction.earn', 'card.created', ...]",
    )
    is_active: bool = True

    def validate_events(self):
        if self.events == ["*"]:
            return
        unknown = set(self.events) - set(SUPPORTED_EVENTS)
        if unknown:
            raise HTTPException(400, f"Noma'lum eventlar: {sorted(unknown)}. Ruxsat: {SUPPORTED_EVENTS}")


class WebhookUpdate(BaseModel):
    url: Optional[str] = Field(None, min_length=8, max_length=500)
    description: Optional[str] = Field(None, max_length=200)
    events: Optional[list[str]] = None
    is_active: Optional[bool] = None


def _out(hook: MerchantWebhook, *, show_secret: bool = False) -> dict:
    d = {
        "id": hook.id,
        "url": hook.url,
        "description": hook.description,
        "events": hook.events,
        "is_active": hook.is_active,
        "created_at": hook.created_at,
        "last_triggered_at": hook.last_triggered_at,
        "last_http_status": hook.last_http_status,
        "last_error": hook.last_error,
        "success_count": hook.success_count or 0,
        "fail_count": hook.fail_count or 0,
    }
    if show_secret:
        d["secret"] = hook.secret
    return d


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("", summary="Merchant webhooklari ro'yxati")
async def list_webhooks(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    hooks = (await db.execute(
        select(MerchantWebhook)
        .where(MerchantWebhook.merchant_id == merchant.id)
        .order_by(MerchantWebhook.id)
    )).scalars().all()
    return [_out(h) for h in hooks]


@router.post("", status_code=201, summary="Yangi webhook yaratish")
async def create_webhook(
    body: WebhookIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    body.validate_events()

    count = (await db.execute(
        select(MerchantWebhook).where(MerchantWebhook.merchant_id == merchant.id)
    )).scalars().all()
    if len(count) >= 10:
        raise HTTPException(400, "Maksimal 10 ta webhook yaratish mumkin")

    secret = secrets.token_hex(32)  # 64 hex char
    hook = MerchantWebhook(
        merchant_id=merchant.id,
        url=body.url,
        description=body.description,
        events=body.events,
        secret=secret,
        is_active=body.is_active,
    )
    db.add(hook)
    await db.commit()
    await db.refresh(hook)
    # Secret faqat yaratilganda bir marta ko'rsatiladi
    return _out(hook, show_secret=True)


@router.patch("/{webhook_id}", summary="Webhook yangilash")
async def update_webhook(
    webhook_id: int,
    body: WebhookUpdate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    hook = await _get_hook(webhook_id, merchant.id, db)
    if body.url is not None:
        hook.url = body.url
    if body.description is not None:
        hook.description = body.description
    if body.events is not None:
        events_obj = WebhookIn(url=hook.url, events=body.events)
        events_obj.validate_events()
        hook.events = body.events
    if body.is_active is not None:
        hook.is_active = body.is_active
    await db.commit()
    await db.refresh(hook)
    return _out(hook)


@router.delete("/{webhook_id}", status_code=204, summary="Webhook o'chirish")
async def delete_webhook(
    webhook_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    hook = await _get_hook(webhook_id, merchant.id, db)
    await db.delete(hook)
    await db.commit()


@router.post("/{webhook_id}/rotate-secret", summary="Secret yangilash (eski imzolar ishlamay qoladi)")
async def rotate_secret(
    webhook_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    hook = await _get_hook(webhook_id, merchant.id, db)
    hook.secret = secrets.token_hex(32)
    await db.commit()
    await db.refresh(hook)
    return {"secret": hook.secret}


@router.post("/{webhook_id}/test", summary="Test ping yuborish")
async def test_webhook(
    webhook_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook URL'ga test ping yuboradi.
    Haqiqiy delivery yaratilmaydi, ball yoki karta o'zgartirilmaydi.
    """
    hook = await _get_hook(webhook_id, merchant.id, db)

    import uuid as _uuid
    from models import WebhookDelivery as _WD
    fake = _WD(
        id=-1,
        webhook_id=hook.id,
        merchant_id=merchant.id,
        event="webhook.test",
        payload={
            "event": "webhook.test",
            "merchant_id": merchant.id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": {"message": "Bu test ping — haqiqiy tranzaksiya emas."},
        },
        delivery_id=str(_uuid.uuid4()),
        attempt=1,
        status="pending",
    )

    success, status_code, error = await _attempt(fake, hook)
    return {
        "success": success,
        "http_status": status_code,
        "error": error or None,
        "url": hook.url,
    }


@router.get("/{webhook_id}/logs", summary="Delivery loglari (oxirgi 100 ta)")
async def webhook_logs(
    webhook_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    await _get_hook(webhook_id, merchant.id, db)  # ownership check
    rows = (await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook_id)
        .order_by(desc(WebhookDelivery.id))
        .limit(100)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "event": r.event,
            "status": r.status,
            "attempt": r.attempt,
            "http_status": r.http_status,
            "error": r.error,
            "delivery_id": r.delivery_id,
            "created_at": r.created_at,
            "delivered_at": r.delivered_at,
            "next_retry_at": r.next_retry_at,
        }
        for r in rows
    ]


# ─── Helper ──────────────────────────────────────────────────────────────────

async def _get_hook(webhook_id: int, merchant_id: int, db: AsyncSession) -> MerchantWebhook:
    hook = (await db.execute(
        select(MerchantWebhook).where(
            MerchantWebhook.id == webhook_id,
            MerchantWebhook.merchant_id == merchant_id,
        )
    )).scalar_one_or_none()
    if hook is None:
        raise HTTPException(404, "Webhook topilmadi")
    return hook
