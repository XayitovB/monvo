"""Payme (Paycom) JSON-RPC business logikasi.

Merchantlar Monvo'ga obuna to'lashlari uchun Payme integratsiyasi.

Protokol: https://developer.help.paycom.uz/protokol-merchant-api/

Oqim:
  1. Merchant `/merchants/me/billing/checkout` chaqiradi → Invoice yaratiladi va
     Payme checkout URL qaytariladi.
  2. Merchant URL ga o'tib to'laydi.
  3. Payme bizning `/payme/merchant` JSON-RPC endpointimizga qo'ng'iroq qiladi:
       CheckPerformTransaction → CreateTransaction → PerformTransaction
  4. PerformTransaction muvaffaqiyatli bo'lsa Invoice "paid" bo'ladi va
     MerchantSubscription kerakli kunga uzaytiriladi.

State machine:
   1: created (Payme reserved)
   2: performed (paid, subscription yangilanadi)
  -1: cancelled before perform
  -2: cancelled after perform (refund)
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import BillingPlan, Invoice, Merchant, MerchantSubscription, PaymeTransaction


# ── Payme protocol error codes ──────────────────────────────────────────────
class PaymeError(Exception):
    """Payme JSON-RPC xatosi — JSON ichida `error` obyekti sifatida qaytariladi."""
    def __init__(self, code: int, message: dict[str, str], data: Optional[str] = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(f"PaymeError({code}): {message}")

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.data is not None:
            out["data"] = self.data
        return out


def _msg(uz: str, ru: str = "", en: str = "") -> dict[str, str]:
    """Trilingual xato xabari (Payme spec-i shu shakldagi obyektni kutadi)."""
    return {"uz": uz, "ru": ru or uz, "en": en or uz}


# Standart xatolar (Payme protokoli)
ERR_INVALID_AMOUNT = PaymeError(-31001, _msg(
    "Noto'g'ri summa", "Неверная сумма", "Invalid amount",
), data="amount")
ERR_TX_NOT_FOUND = PaymeError(-31003, _msg(
    "Tranzaksiya topilmadi", "Транзакция не найдена", "Transaction not found",
))
ERR_CANT_CANCEL = PaymeError(-31007, _msg(
    "Tranzaksiyani bekor qilib bo'lmaydi",
    "Невозможно отменить транзакцию",
    "Cannot cancel transaction",
))
ERR_CANT_PERFORM = PaymeError(-31008, _msg(
    "Tranzaksiyani amalga oshirib bo'lmaydi",
    "Невозможно выполнить транзакцию",
    "Cannot perform transaction",
))
ERR_AUTH = PaymeError(-32504, _msg("Avtorizatsiya xatosi", "Ошибка авторизации", "Auth failed"))

# Account-spetsifik xatolar (-31050..-31099 oralig'i bizniki)
ERR_ORDER_NOT_FOUND = PaymeError(-31050, _msg(
    "Buyurtma topilmadi", "Заказ не найден", "Order not found",
), data="order_id")
ERR_ORDER_PAID = PaymeError(-31051, _msg(
    "Buyurtma allaqachon to'langan",
    "Заказ уже оплачен",
    "Order already paid",
), data="order_id")
ERR_ORDER_VOID = PaymeError(-31052, _msg(
    "Buyurtma bekor qilingan",
    "Заказ отменён",
    "Order is void",
), data="order_id")
ERR_ORDER_AMOUNT_MISMATCH = PaymeError(-31001, _msg(
    "Buyurtma summasi mos kelmaydi",
    "Сумма не совпадает с заказом",
    "Amount mismatch",
), data="amount")
ERR_ACCOUNT_INVALID = PaymeError(-31050, _msg(
    "Hisob ma'lumoti noto'g'ri",
    "Неверный аккаунт",
    "Invalid account",
), data="order_id")


# Cancel reason kodlari (Payme protokoli)
CANCEL_REASON = {
    "user": 3,
    "perform_failed": 5,
    "refund": 5,
    "expired": 4,
    "fraud": 1,
}

# Perform muddatining limiti — 12 soat (Payme spec)
TX_TIMEOUT_HOURS = 12

# Standart obuna uzaytirish kunlari (custom plan'lar buni override qilishi mumkin)
DEFAULT_SUBSCRIPTION_DAYS = 30


def _now_ms() -> int:
    return int(time.time() * 1000)


# ── Account validation ─────────────────────────────────────────────────────
def _resolve_invoice(account: dict[str, Any], db_invoice: Optional[Invoice]) -> Invoice:
    """`account.order_id` orqali Invoice'ni olib, holatini tekshiradi."""
    if db_invoice is None:
        raise ERR_ORDER_NOT_FOUND
    status = (db_invoice.status or "").lower()
    if status == "paid":
        raise ERR_ORDER_PAID
    if status in ("void", "cancelled", "refunded", "failed"):
        raise ERR_ORDER_VOID
    return db_invoice


def _amount_matches(amount_tiyin: int, invoice: Invoice) -> bool:
    """Payme tiyin'da yuboradi (1 so'm = 100 tiyin). Invoice amount — so'm."""
    expected_tiyin = int(round(float(invoice.amount or 0) * 100))
    return amount_tiyin == expected_tiyin


async def _get_invoice_by_order_id(db: AsyncSession, account: dict[str, Any]) -> Optional[Invoice]:
    raw = account.get("order_id") or account.get("invoice_id")
    if raw is None:
        return None
    try:
        order_id = int(raw)
    except (TypeError, ValueError):
        return None
    return (await db.execute(
        select(Invoice).where(Invoice.id == order_id)
    )).scalar_one_or_none()


# ── Subscription extension ──────────────────────────────────────────────────
async def _apply_subscription(db: AsyncSession, invoice: Invoice) -> None:
    """Invoice paid bo'lganida obunani uzaytirish.

    Yagona manba — Merchant.tariff_*. MerchantSubscription billing tarixi uchun
    sinxron saqlanadi. Ikkalasi ham yangilanadi, aks holda merchant to'lov qilsa
    ham funksiyalar ochilmaydi (tariff_gate Merchant.tariff_id'ni o'qiydi).
    """
    if not invoice.merchant_id:
        return

    now = datetime.now(timezone.utc)

    days = DEFAULT_SUBSCRIPTION_DAYS
    if invoice.period_start and invoice.period_end:
        delta = invoice.period_end - invoice.period_start
        if delta.days > 0:
            days = delta.days

    # Yagona manba — Tariff. Invoice tariff_id'siz (legacy plan_id) kelsa,
    # plan narxidan ekvivalent Tariff'ni topib, tariff_id'ni har joyda yozamiz.
    # Aks holda to'lov qilgan merchant'da merchant.tariff_id null qolib,
    # funksiyalar ochilmaydi (tariff_gate Merchant.tariff_id'ni o'qiydi).
    eff_tariff_id = invoice.tariff_id
    if not eff_tariff_id and invoice.plan_id:
        from core.subscription import match_tariff_by_monthly_price
        plan = (await db.execute(
            select(BillingPlan).where(BillingPlan.id == invoice.plan_id)
        )).scalar_one_or_none()
        if plan is not None:
            matched = await match_tariff_by_monthly_price(db, plan.price_monthly)
            if matched is not None:
                eff_tariff_id = matched.id

    # ── MerchantSubscription (billing tarixi) ──
    sub = (await db.execute(
        select(MerchantSubscription).where(
            MerchantSubscription.merchant_id == invoice.merchant_id
        )
    )).scalar_one_or_none()

    if sub is None:
        sub = MerchantSubscription(
            merchant_id=invoice.merchant_id,
            plan_id=invoice.plan_id,
            tariff_id=eff_tariff_id,
            status="active",
            started_at=now,
            expires_at=now + timedelta(days=days),
        )
        db.add(sub)
        base = now
    else:
        base = sub.expires_at if (sub.expires_at and sub.expires_at > now) else now
        sub.expires_at = base + timedelta(days=days)
        sub.renewed_at = now
        if invoice.plan_id:
            sub.plan_id = invoice.plan_id
        if eff_tariff_id:
            sub.tariff_id = eff_tariff_id
        if sub.status in ("cancelled", "paused"):
            sub.status = "active"

    new_expires = base + timedelta(days=days)

    # ── Merchant.tariff_* (yagona manba — funksiya cheklovi shu yerdan o'qiydi) ──
    merchant = (await db.execute(
        select(Merchant).where(Merchant.id == invoice.merchant_id)
    )).scalar_one_or_none()
    if merchant is not None:
        if eff_tariff_id:
            merchant.tariff_id = eff_tariff_id
            if not merchant.tariff_started_at:
                merchant.tariff_started_at = now
        merchant.tariff_expires_at = new_expires


# ════════════════════════════════════════════════════════════════════════════
# JSON-RPC METHODS
# ════════════════════════════════════════════════════════════════════════════

async def check_perform_transaction(db: AsyncSession, params: dict) -> dict:
    """Payme so'raydi: ushbu summa va account uchun to'lov mumkinmi?"""
    account = params.get("account") or {}
    amount = int(params.get("amount") or 0)
    if amount <= 0:
        raise ERR_INVALID_AMOUNT

    invoice = await _get_invoice_by_order_id(db, account)
    invoice = _resolve_invoice(account, invoice)
    if not _amount_matches(amount, invoice):
        raise ERR_ORDER_AMOUNT_MISMATCH

    # detail (Payme fiscal hujjat uchun) — ixtiyoriy. Standart javob.
    return {"allow": True}


async def create_transaction(db: AsyncSession, params: dict) -> dict:
    """Tranzaksiya rezervatsiyasi (idempotent)."""
    paycom_id = str(params.get("id") or "").strip()
    paycom_time = int(params.get("time") or 0)
    amount = int(params.get("amount") or 0)
    account = params.get("account") or {}

    if not paycom_id or paycom_time <= 0 or amount <= 0:
        raise ERR_INVALID_AMOUNT

    # Mavjud tranzaksiya — idempotent javob
    existing = (await db.execute(
        select(PaymeTransaction).where(PaymeTransaction.paycom_id == paycom_id)
    )).scalar_one_or_none()

    if existing is not None:
        if existing.state != 1:
            raise ERR_CANT_PERFORM
        return {
            "create_time": existing.create_time_ms,
            "transaction": str(existing.id),
            "state": existing.state,
        }

    # Yangi tranzaksiya — order tekshiruvi
    invoice = await _get_invoice_by_order_id(db, account)
    invoice = _resolve_invoice(account, invoice)
    if not _amount_matches(amount, invoice):
        raise ERR_ORDER_AMOUNT_MISMATCH

    # Boshqa aktiv tranzaksiya bor-yo'qligini tekshirish (bitta order — bitta aktiv tx)
    other = (await db.execute(
        select(PaymeTransaction).where(
            PaymeTransaction.invoice_id == invoice.id,
            PaymeTransaction.state == 1,
        )
    )).scalar_one_or_none()
    if other is not None:
        raise ERR_CANT_PERFORM

    now_ms = _now_ms()
    tx = PaymeTransaction(
        paycom_id=paycom_id,
        paycom_time_ms=paycom_time,
        invoice_id=invoice.id,
        merchant_id=invoice.merchant_id,
        amount_tiyin=amount,
        state=1,
        create_time_ms=now_ms,
        raw_account=account,
    )
    db.add(tx)
    await db.flush()
    await db.commit()
    await db.refresh(tx)

    return {
        "create_time": tx.create_time_ms,
        "transaction": str(tx.id),
        "state": tx.state,
    }


async def perform_transaction(db: AsyncSession, params: dict) -> dict:
    """Tranzaksiyani amalga oshirish — Invoice paid + obuna uzaytirish."""
    paycom_id = str(params.get("id") or "").strip()
    if not paycom_id:
        raise ERR_TX_NOT_FOUND

    tx = (await db.execute(
        select(PaymeTransaction).where(PaymeTransaction.paycom_id == paycom_id)
    )).scalar_one_or_none()
    if tx is None:
        raise ERR_TX_NOT_FOUND

    # Idempotent: agar perform qilingan bo'lsa, mavjud holatni qaytar
    if tx.state == 2:
        return {
            "transaction": str(tx.id),
            "perform_time": tx.perform_time_ms,
            "state": tx.state,
        }
    if tx.state != 1:
        raise ERR_CANT_PERFORM

    # 12 soat ichida perform qilinishi kerak
    if tx.create_time_ms and (_now_ms() - tx.create_time_ms) > TX_TIMEOUT_HOURS * 3600 * 1000:
        # Avto-bekor qilish
        tx.state = -1
        tx.cancel_time_ms = _now_ms()
        tx.reason = CANCEL_REASON["expired"]
        await db.commit()
        raise ERR_CANT_PERFORM

    # Invoice'ni paid qilish
    if tx.invoice_id is not None:
        invoice = await db.get(Invoice, tx.invoice_id)
        if invoice is None:
            raise ERR_TX_NOT_FOUND
        invoice.status = "paid"
        invoice.paid_at = datetime.now(timezone.utc)
        await _apply_subscription(db, invoice)

    tx.state = 2
    tx.perform_time_ms = _now_ms()
    await db.commit()

    logger.info(f"payme: PerformTransaction OK id={tx.id} invoice={tx.invoice_id} amount={tx.amount_tiyin}")

    return {
        "transaction": str(tx.id),
        "perform_time": tx.perform_time_ms,
        "state": tx.state,
    }


async def cancel_transaction(db: AsyncSession, params: dict) -> dict:
    """Tranzaksiyani bekor qilish.

    State 1 → -1 (oddiy bekor)
    State 2 → -2 (perform qilingandan keyin refund)
    """
    paycom_id = str(params.get("id") or "").strip()
    reason = params.get("reason")
    if not paycom_id:
        raise ERR_TX_NOT_FOUND

    tx = (await db.execute(
        select(PaymeTransaction).where(PaymeTransaction.paycom_id == paycom_id)
    )).scalar_one_or_none()
    if tx is None:
        raise ERR_TX_NOT_FOUND

    # Idempotent
    if tx.state in (-1, -2):
        return {
            "transaction": str(tx.id),
            "cancel_time": tx.cancel_time_ms,
            "state": tx.state,
        }

    if tx.state == 1:
        tx.state = -1
    elif tx.state == 2:
        # Refund: invoice'ni qaytarib void qilish + obunani teskari korrektirovka qilmaymiz
        # (admin qo'lda hal qiladi — `routers/billing.py` orqali)
        tx.state = -2
        if tx.invoice_id is not None:
            invoice = await db.get(Invoice, tx.invoice_id)
            if invoice is not None:
                invoice.status = "refunded"
    else:
        raise ERR_CANT_CANCEL

    tx.cancel_time_ms = _now_ms()
    if isinstance(reason, int):
        tx.reason = reason
    await db.commit()

    logger.info(f"payme: CancelTransaction id={tx.id} → state={tx.state} reason={tx.reason}")

    return {
        "transaction": str(tx.id),
        "cancel_time": tx.cancel_time_ms,
        "state": tx.state,
    }


async def check_transaction(db: AsyncSession, params: dict) -> dict:
    """Tranzaksiya holatini qaytarish (Payme reconciliation uchun)."""
    paycom_id = str(params.get("id") or "").strip()
    if not paycom_id:
        raise ERR_TX_NOT_FOUND

    tx = (await db.execute(
        select(PaymeTransaction).where(PaymeTransaction.paycom_id == paycom_id)
    )).scalar_one_or_none()
    if tx is None:
        raise ERR_TX_NOT_FOUND

    return {
        "create_time": tx.create_time_ms or 0,
        "perform_time": tx.perform_time_ms or 0,
        "cancel_time": tx.cancel_time_ms or 0,
        "transaction": str(tx.id),
        "state": tx.state,
        "reason": tx.reason,
    }


async def get_statement(db: AsyncSession, params: dict) -> dict:
    """Berilgan oraliqdagi tranzaksiyalar ro'yxati (reconciliation)."""
    from_ms = int(params.get("from") or 0)
    to_ms = int(params.get("to") or 0)
    if from_ms <= 0 or to_ms <= 0 or to_ms < from_ms:
        raise ERR_INVALID_AMOUNT

    rows = (await db.execute(
        select(PaymeTransaction).where(
            PaymeTransaction.paycom_time_ms >= from_ms,
            PaymeTransaction.paycom_time_ms <= to_ms,
        ).order_by(PaymeTransaction.paycom_time_ms)
    )).scalars().all()

    return {
        "transactions": [
            {
                "id": tx.paycom_id,
                "time": tx.paycom_time_ms,
                "amount": tx.amount_tiyin,
                "account": tx.raw_account or {},
                "create_time": tx.create_time_ms or 0,
                "perform_time": tx.perform_time_ms or 0,
                "cancel_time": tx.cancel_time_ms or 0,
                "transaction": str(tx.id),
                "state": tx.state,
                "reason": tx.reason,
            }
            for tx in rows
        ]
    }


# ── Method dispatcher ──────────────────────────────────────────────────────
METHOD_HANDLERS = {
    "CheckPerformTransaction": check_perform_transaction,
    "CreateTransaction":        create_transaction,
    "PerformTransaction":       perform_transaction,
    "CancelTransaction":        cancel_transaction,
    "CheckTransaction":         check_transaction,
    "GetStatement":             get_statement,
}


# ── Checkout URL builder ───────────────────────────────────────────────────
def build_checkout_url(
    *,
    merchant_id: str,
    invoice_id: int,
    amount_sum: float,
    base_url: str,
    lang: str = "uz",
    return_url: Optional[str] = None,
) -> str:
    """Payme checkout URL yaratadi.

    Format:  <base_url>/<base64("m=<id>;ac.order_id=<inv>;a=<tiyin>;l=uz;c=<ret>")>
    """
    import base64

    parts = [
        f"m={merchant_id}",
        f"ac.order_id={invoice_id}",
        f"a={int(round(amount_sum * 100))}",
        f"l={lang}",
    ]
    if return_url:
        parts.append(f"c={return_url}")
    payload = ";".join(parts)
    encoded = base64.b64encode(payload.encode("utf-8")).decode("ascii")
    return f"{base_url.rstrip('/')}/{encoded}"
