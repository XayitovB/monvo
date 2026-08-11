"""POS provayder webhook dispatcher.

Bitta universal endpoint:
  POST /pos/webhooks/{provider}/{merchant_id}?token=<webhook_token>

Auth qatlami:
  1. `?token=` query parametri — har bir merchant ulanishida generatsiya qilingan
     unique webhook_token credentials JSONB'da saqlanadi.
  2. HMAC SHA-256 signature — `webhook_secret` credentials ichida bo'lsa,
     `X-Iiko-Signature` (yoki `X-Signature`) headeri tekshiriladi.
     Sekret bo'lmasa, signature tekshiruvi o'tkazib yuboriladi (legacy).

Body to'liq raw bytes sifatida o'qiladi (HMAC tekshiruvi uchun majburiy),
keyin JSON.parse qilinadi va parser'ga uzatiladi.

Sentry tag: provider=<slug>, merchant_id=<id>, external_ref=<id>.
"""
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.pos_engine import commit_pos_sale
from database import get_db
from integrations import get_parser
from integrations._signatures import verify as verify_signature
from models import PosIntegration

router = APIRouter(prefix="/pos/webhooks", tags=["🔌 POS Webhooks"])


def _set_sentry_tags(**tags: Any) -> None:
    """Sentry tag'larini xavfsiz o'rnatish (modul yo'q bo'lsa silent)."""
    try:
        import sentry_sdk
        for k, v in tags.items():
            sentry_sdk.set_tag(k, str(v))
    except Exception:
        pass


@router.post(
    "/{provider}/{merchant_id}",
    summary="POS provayder sotuv hodisasini qabul qilish",
)
async def receive_webhook(
    provider: str,
    merchant_id: int,
    request: Request,
    token: str = Query(..., min_length=10),
    db: AsyncSession = Depends(get_db),
):
    _set_sentry_tags(pos_provider=provider, pos_merchant_id=merchant_id)

    parser = get_parser(provider)
    if parser is None:
        raise HTTPException(404, f"Provayder qo'llab-quvvatlanmaydi: {provider}")

    integration = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant_id,
            PosIntegration.provider == provider,
        )
    )).scalar_one_or_none()
    if integration is None or not integration.is_active:
        raise HTTPException(404, "Integratsiya topilmadi yoki o'chirilgan")

    creds = integration.credentials or {}
    expected = creds.get("webhook_token")
    if not expected or expected != token:
        # Aniq sabab bermaslik — brute-force'ga qarshi
        raise HTTPException(401, "Token noto'g'ri")

    # ── Raw body — HMAC tekshiruvi uchun majburiy ──
    raw = await request.body()

    # ── HMAC signature ──
    headers_lower = {k.lower(): v for k, v in request.headers.items()}
    if not verify_signature(provider, raw, headers_lower, creds):
        logger.warning(
            f"pos_webhooks: {provider} merchant={merchant_id} signature noto'g'ri"
        )
        raise HTTPException(401, "Signature noto'g'ri")

    # ── JSON parse ──
    try:
        body = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        logger.warning(f"pos_webhooks: {provider} non-JSON body: {raw[:200]!r} ({e})")
        raise HTTPException(400, "JSON kutilgan edi") from e
    if not isinstance(body, dict):
        raise HTTPException(400, "Object kutilgan edi")

    headers = dict(request.headers)
    try:
        sale = parser(body, headers, creds)
    except Exception as e:
        logger.exception(f"pos_webhooks: {provider} parser xatolik: {e}")
        integration.last_error = f"parse_error: {type(e).__name__}: {str(e)[:180]}"
        await db.commit()
        _set_sentry_tags(pos_parse_error="true")
        raise HTTPException(400, "Hodisa formati noto'g'ri") from e

    if sale is None:
        # Qo'llab-quvvatlanmaydigan event turi (refund'siz cancel, partial, ...)
        # 200 qaytaramiz — provayder qayta yuborishdan to'xtaydi.
        # Diagnostika uchun integration.last_error ga yozib qo'yamiz —
        # merchant admin panelda nima sababdan tranzaksiya yaratilmaganini ko'rsin.
        try:
            from datetime import datetime, timezone
            ts = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
            preview_status = body.get("status") or body.get("event") or "?"
            integration.last_error = (
                f"info @{ts}: webhook keldi, status={preview_status!r} — "
                f"hali ball berilmadi (NEW/IN_PROGRESS yoki noma'lum status)"
            )
            await db.commit()
        except Exception:  # noqa: BLE001
            pass
        return {"ok": True, "skipped": "event_ignored"}

    _set_sentry_tags(
        pos_external_ref=sale.external_ref,
        pos_sale_kind=sale.kind,
    )

    try:
        result = await commit_pos_sale(integration=integration, sale=sale, db=db)
    except Exception as e:
        logger.exception(f"pos_webhooks: {provider} commit xatolik: {e}")
        integration.last_error = f"commit_error: {type(e).__name__}: {str(e)[:180]}"
        await db.commit()
        raise HTTPException(500, "Ishlash xatosi") from e

    if result is None:
        try:
            from datetime import datetime, timezone
            ts = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
            integration.last_error = (
                f"info @{ts}: webhook keldi (status={sale.kind}, ref={sale.external_ref}) — "
                f"telefon yo'q yoki ball=0 (mijoz Monvo'da topilmadi yoki anonim chek)"
            )
            await db.commit()
        except Exception:  # noqa: BLE001
            pass
        return {"ok": True, "skipped": "anonymous_or_zero_points"}

    # Muvaffaqiyatli yaratildi — eski xatolarni tozalaymiz
    try:
        from datetime import datetime, timezone
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
        integration.last_error = (
            f"ok @{ts}: tx={result.transaction_id} +{result.points} ball "
            f"(card={result.card_uid[:8] if result.card_uid else '—'})"
        )
        await db.commit()
    except Exception:  # noqa: BLE001
        pass

    return {
        "ok": True,
        "duplicate": result.duplicate,
        "refunded": result.refunded,
        "transaction_id": result.transaction_id,
        "card_uid": result.card_uid,
        "points": result.points,
    }
