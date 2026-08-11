"""POS polling worker.

Webhook tushib qolgan yoki kechikkan cheklar uchun fallback. Har 15 daqiqada
har bir aktiv POS integratsiyasi bo'yicha oxirgi 30 daqiqalik yopilgan
cheklarni mos POS Cloud API'dan tortib oladi va `commit_pos_sale` orqali
ishlaydi (idempotency mavjud — webhook yetkazgan bo'lsa qayta ish bermaydi).

Hozir qo'llab-quvvatlanadi: iiko, Billz.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from loguru import logger
from sqlalchemy import select

from core.pos_engine import NormalizedSale, commit_pos_sale
from database import AsyncSessionLocal
from models import PosIntegration

# Har polling iteratsiyada qancha vaqtga orqaga qarash.
# Scheduler 1 daqiqada bir marta ishga tushadi, lekin lookback'ni 10 daqiqada
# qoldiramiz — agar bir nechta run o'tkazib yuborilsa, keyingi run quvib oladi.
# Idempotency (unique provider+external_ref) takror yozishni oldini oladi.
POLL_LOOKBACK_MIN = 10
# Bir merchant bo'yicha bir iteratsiyada qabul qilinadigan maks. cheklar
PER_RUN_CAP = 200


async def _poll_iiko(integration: PosIntegration) -> int:
    creds = integration.credentials or {}
    api_login = creds.get("api_login")
    org_id = creds.get("organization_id")
    if not api_login or not org_id:
        return 0

    from integrations.iiko import IikoApiError, IikoClient

    now = datetime.now(timezone.utc)
    since = now - timedelta(minutes=POLL_LOOKBACK_MIN)

    try:
        async with IikoClient(api_login=api_login, organization_id=org_id) as client:
            orders = await client.fetch_orders_by_period(from_dt=since, to_dt=now)
    except IikoApiError as e:
        logger.warning(f"pos_polling: iiko API xato (merchant={integration.merchant_id}): {e}")
        return 0
    except Exception as e:  # noqa: BLE001
        logger.warning(f"pos_polling: iiko ulanish xatosi (merchant={integration.merchant_id}): {e}")
        return 0

    processed = 0
    skipped = 0

    async with AsyncSessionLocal() as db:
        # `integration` boshqa session'dan kelgan — qaytadan yuklaymiz
        fresh = (await db.execute(
            select(PosIntegration).where(PosIntegration.id == integration.id)
        )).scalar_one_or_none()
        if fresh is None:
            return 0

        for order in orders[:PER_RUN_CAP]:
            sale = NormalizedSale(
                external_ref=order.order_id,
                amount=order.sum,
                phone=order.customer_phone,
                external_customer_id=order.customer_id,
                external_terminal_id=order.terminal_id,
                kind="refund" if order.is_deleted else "earn",
                note="iiko-poll",
            )
            try:
                result = await commit_pos_sale(integration=fresh, sale=sale, db=db)
                if result is None:
                    skipped += 1
                else:
                    processed += 1
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    f"pos_polling: commit xatolik {order.order_id} "
                    f"merchant={integration.merchant_id}: {e}"
                )

    if processed or skipped:
        logger.info(
            f"pos_polling: iiko merchant={integration.merchant_id} "
            f"processed={processed} skipped={skipped} window={POLL_LOOKBACK_MIN}min"
        )
    return processed


async def _poll_billz(integration: PosIntegration) -> int:
    """BILLZ 2 polling — `secret_token` orqali REST API.

    Billz har bir sotuvga **avtomatik cashback hisoblaydi** va `cashback_amount`
    maydoni bilan qaytaradi. Monvo bu qiymatni o'zgartirmasdan mijozning
    `points` balansiga to'g'ridan-to'g'ri qo'shadi (1 ball = 1 so'm).
    """
    creds = integration.credentials or {}
    secret_token = creds.get("secret_token") or creds.get("api_secret")  # backward compat
    if not secret_token:
        return 0

    from integrations.billz import BillzApiError, BillzClient

    now = datetime.now(timezone.utc)
    since = now - timedelta(minutes=POLL_LOOKBACK_MIN)

    try:
        async with BillzClient(secret_token=secret_token) as client:
            sales = await client.list_sales(from_dt=since, to_dt=now)
    except BillzApiError as e:
        logger.warning(f"pos_polling: billz API xato (merchant={integration.merchant_id}): {e}")
        return 0
    except Exception as e:  # noqa: BLE001
        logger.warning(f"pos_polling: billz ulanish xatosi (merchant={integration.merchant_id}): {e}")
        return 0

    processed = 0
    skipped = 0

    async with AsyncSessionLocal() as db:
        fresh = (await db.execute(
            select(PosIntegration).where(PosIntegration.id == integration.id)
        )).scalar_one_or_none()
        if fresh is None:
            return 0

        for s in sales[:PER_RUN_CAP]:
            sale = NormalizedSale(
                external_ref=s.sale_id,
                amount=s.total,
                phone=s.customer_phone,
                external_customer_id=s.customer_id,
                external_terminal_id=s.shop_id,
                kind="refund" if s.is_refund else "earn",
                note="Billz-poll",
            )
            try:
                result = await commit_pos_sale(integration=fresh, sale=sale, db=db)
                if result is None:
                    skipped += 1
                else:
                    processed += 1
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    f"pos_polling: commit xatolik {s.sale_id} "
                    f"merchant={integration.merchant_id}: {e}"
                )

            # Mijoz ushbu chekda cashback sarflagan bo'lsa — Monvodan yechemiz
            if not s.is_refund and s.cashback_spent > 0:
                spend_sale = NormalizedSale(
                    external_ref=s.sale_id,
                    amount=s.total,
                    phone=s.customer_phone,
                    external_customer_id=s.customer_id,
                    external_terminal_id=s.shop_id,
                    kind="spend",
                    forced_points=int(round(s.cashback_spent)),
                    note="Billz-poll",
                )
                try:
                    await commit_pos_sale(integration=fresh, sale=spend_sale, db=db)
                except Exception as e:  # noqa: BLE001
                    logger.warning(
                        f"pos_polling: spend commit xatolik {s.sale_id} "
                        f"merchant={integration.merchant_id}: {e}"
                    )

    if processed or skipped:
        logger.info(
            f"pos_polling: billz merchant={integration.merchant_id} "
            f"processed={processed} skipped={skipped} window={POLL_LOOKBACK_MIN}min"
        )
    return processed


_PROVIDER_POLLERS = {
    "iiko": _poll_iiko,
    "billz": _poll_billz,
}


async def run_pos_polling() -> dict:
    """Scheduler tomonidan chaqiriladi."""
    summary: dict = {"iiko": 0, "billz": 0, "errors": 0}

    async with AsyncSessionLocal() as db:
        integrations = (await db.execute(
            select(PosIntegration).where(
                PosIntegration.is_active.is_(True),
                PosIntegration.provider.in_(list(_PROVIDER_POLLERS.keys())),
            )
        )).scalars().all()

    for integ in integrations:
        poller = _PROVIDER_POLLERS.get(integ.provider)
        if poller is None:
            continue
        try:
            n = await poller(integ)
            summary[integ.provider] = summary.get(integ.provider, 0) + n
        except Exception as e:  # noqa: BLE001
            summary["errors"] += 1
            logger.warning(f"pos_polling: integration {integ.id} ({integ.provider}) fail: {e}")

    return summary
