"""
core/webhooks.py
────────────────
Outbound webhook tizimi.

Qanday ishlaydi:
  1. `enqueue(merchant_id, event, data, db)` — WebhookDelivery yozuvlar yaratadi
     (har bir faol webhook konfiguratsiyasi uchun alohida yozuv).
  2. BackgroundTask `dispatch(delivery_id, db)` — darhol HTTP POST yuboradi.
  3. Muvaffaqiyatsiz bo'lsa WebhookDelivery.next_retry_at o'rnatiladi.
  4. Scheduler har 30 soniyada `retry_pending(db)` chaqiradi — backoff jadvalga
     ko'ra qayta urinadi (5 urinish, so'ngra "dead" holatiga o'tadi).

Xavfsizlik:
  - HMAC-SHA256 imzosi: `X-Monvo-Signature: sha256=<hex>`
  - `X-Monvo-Event`, `X-Monvo-Delivery` (UUID), `X-Monvo-Timestamp` headerlari

Backoff jadvali (soniya):
  urinish 1 → darhol
  urinish 2 → 5 daqiqa
  urinish 3 → 30 daqiqa
  urinish 4 → 2 soat
  urinish 5 → 8 soat
  keyin → dead (boshqa urinish yo'q)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import MerchantWebhook, WebhookDelivery

# ─── Backoff jadvali ──────────────────────────────────────────────────────────
_BACKOFF: list[int] = [0, 300, 1800, 7200, 28800]  # seconds
MAX_ATTEMPTS = len(_BACKOFF)
DELIVERY_TIMEOUT = 10.0  # seconds per HTTP attempt


# ─── HMAC imzo ───────────────────────────────────────────────────────────────

def _sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()


# ─── Enqueue ─────────────────────────────────────────────────────────────────

async def enqueue(
    merchant_id: int,
    event: str,
    data: dict[str, Any],
    db: AsyncSession,
) -> list[int]:
    """
    Merchant uchun faol webhooklarni topib, har biriga WebhookDelivery yozadi.
    Qaytarilgan ro'yxat — yaratilgan delivery ID'lar (dispatcher uchun kerak).
    """
    hooks = (await db.execute(
        select(MerchantWebhook).where(
            MerchantWebhook.merchant_id == merchant_id,
            MerchantWebhook.is_active.is_(True),
        )
    )).scalars().all()

    ids: list[int] = []
    now = datetime.now(timezone.utc)

    payload = {
        "event": event,
        "merchant_id": merchant_id,
        "timestamp": now.isoformat(),
        "data": data,
    }

    for hook in hooks:
        subscribed: list[str] = hook.events or []
        if subscribed and "*" not in subscribed and event not in subscribed:
            continue

        delivery = WebhookDelivery(
            webhook_id=hook.id,
            merchant_id=merchant_id,
            event=event,
            payload=payload,
            delivery_id=str(uuid.uuid4()),
            status="pending",
            attempt=0,
            next_retry_at=now,
        )
        db.add(delivery)
        await db.flush()
        ids.append(delivery.id)

    return ids


# ─── Bitta urinish ────────────────────────────────────────────────────────────

async def _attempt(delivery: WebhookDelivery, hook: MerchantWebhook) -> tuple[bool, int | None, str]:
    """
    Bir marta HTTP POST yuboradi.
    Qaytaradi: (success, http_status, error_message)
    """
    body_bytes = json.dumps(delivery.payload, ensure_ascii=False).encode()
    headers = {
        "Content-Type": "application/json",
        "X-Monvo-Event": delivery.event,
        "X-Monvo-Delivery": delivery.delivery_id,
        "X-Monvo-Timestamp": str(int(datetime.now(timezone.utc).timestamp())),
        "X-Monvo-Signature": _sign(hook.secret, body_bytes),
        "User-Agent": "MonvoWebhook/1.0",
    }
    try:
        async with httpx.AsyncClient(timeout=DELIVERY_TIMEOUT, follow_redirects=False) as client:
            r = await client.post(hook.url, content=body_bytes, headers=headers)
            success = 200 <= r.status_code < 300
            return success, r.status_code, "" if success else r.text[:300]
    except httpx.TimeoutException:
        return False, None, "timeout"
    except Exception as e:
        return False, None, str(e)[:200]


# ─── Dispatch (BackgroundTask ichidan chaqiriladi) ───────────────────────────

async def dispatch(delivery_id: int, db: AsyncSession) -> None:
    """Bitta deliveryni darhol yuboradi. BackgroundTask sifatida chaqiriladi."""
    delivery = await db.get(WebhookDelivery, delivery_id)
    if delivery is None or delivery.status not in ("pending", "retrying"):
        return

    hook = await db.get(MerchantWebhook, delivery.webhook_id)
    if hook is None or not hook.is_active:
        delivery.status = "dead"
        delivery.error = "webhook o'chirilgan yoki o'chirib yuborilgan"
        await db.commit()
        return

    delivery.attempt += 1
    now = datetime.now(timezone.utc)
    success, status_code, error = await _attempt(delivery, hook)

    delivery.http_status = status_code
    hook.last_triggered_at = now
    hook.last_http_status = status_code

    if success:
        delivery.status = "delivered"
        delivery.delivered_at = now
        delivery.error = None
        hook.success_count = (hook.success_count or 0) + 1
        hook.last_error = None
        logger.info(f"webhook ok: delivery={delivery_id} event={delivery.event} status={status_code}")
    else:
        delivery.error = error
        hook.fail_count = (hook.fail_count or 0) + 1
        hook.last_error = f"{status_code or 'timeout'}: {error[:150]}"

        if delivery.attempt >= MAX_ATTEMPTS:
            delivery.status = "dead"
            delivery.next_retry_at = None
            logger.warning(f"webhook dead: delivery={delivery_id} event={delivery.event} attempts={delivery.attempt}")
        else:
            delay = _BACKOFF[delivery.attempt]  # attempt 1 → 300s, 2 → 1800s ...
            delivery.status = "retrying"
            delivery.next_retry_at = now + timedelta(seconds=delay)
            logger.info(f"webhook retry in {delay}s: delivery={delivery_id} event={delivery.event}")

    await db.commit()


# ─── Scheduler: muddati o'tgan retrylarni qayta yuborish ─────────────────────

async def retry_pending(db: AsyncSession) -> int:
    """
    next_retry_at vaqti kelgan 'retrying' deliverylarni qayta urinadi.
    Scheduler har 30 soniyada chaqiradi.
    """
    now = datetime.now(timezone.utc)
    rows = (await db.execute(
        select(WebhookDelivery).where(
            WebhookDelivery.status == "retrying",
            WebhookDelivery.next_retry_at <= now,
        ).limit(50)
    )).scalars().all()

    count = 0
    for delivery in rows:
        hook = await db.get(MerchantWebhook, delivery.webhook_id)
        if hook is None or not hook.is_active:
            delivery.status = "dead"
            delivery.error = "webhook o'chirilgan"
            await db.commit()
            continue

        delivery.attempt += 1
        success, status_code, error = await _attempt(delivery, hook)
        _now = datetime.now(timezone.utc)

        delivery.http_status = status_code
        hook.last_triggered_at = _now
        hook.last_http_status = status_code

        if success:
            delivery.status = "delivered"
            delivery.delivered_at = _now
            delivery.error = None
            hook.success_count = (hook.success_count or 0) + 1
            hook.last_error = None
        else:
            delivery.error = error
            hook.fail_count = (hook.fail_count or 0) + 1
            hook.last_error = f"{status_code or 'timeout'}: {error[:150]}"

            if delivery.attempt >= MAX_ATTEMPTS:
                delivery.status = "dead"
                delivery.next_retry_at = None
            else:
                delay = _BACKOFF[delivery.attempt]
                delivery.next_retry_at = _now + timedelta(seconds=delay)

        await db.commit()
        count += 1

    return count
