"""
core/subscription.py
────────────────────
Obuna holati bilan bog'liq yordamchi funksiyalar.
Barcha joylarda shu moduldan foydalaniladi — takrorlanishning oldi olinadi.
"""
from datetime import datetime, timezone


def as_aware(dt: datetime | None) -> datetime | None:
    """Naive datetime'ni UTC-aware qiladi. None bo'lsa None qaytaradi."""
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# Ichki qisqartma
_aware = as_aware


def sub_expired(expires_at: datetime | None) -> bool:
    """Obuna muddati tugaganmi?"""
    dt = _aware(expires_at)
    if not dt:
        return True
    return dt <= datetime.now(timezone.utc)


def days_remaining(expires_at: datetime | None) -> int | None:
    """Obuna tugagunga necha kun qoldi. None = muddatsiz yoki yo'q."""
    dt = _aware(expires_at)
    if not dt:
        return None
    delta = dt - datetime.now(timezone.utc)
    return max(0, delta.days)


def resolve_sub_status(is_active: bool, sub, expires_at=None) -> tuple[str, datetime | None]:
    """
    Merchantning obuna holatini hisoblaydi.

    Parametrlar:
        is_active   — Merchant.is_active
        sub         — MerchantSubscription yoki None
        expires_at  — Merchant.tariff_expires_at (fallback emas, faqat sub=None holat uchun)

    Qaytaradi: (status_str, expires_at_or_None)
        status_str: "blocked" | "no_sub" | "expired" | "active" | "trial" | "paused" | "cancelled"
    """
    now = datetime.now(timezone.utc)
    if not is_active:
        return "blocked", None

    if sub is not None:
        exp = _aware(sub.expires_at)
        if exp and exp <= now:
            return "expired", exp
        return sub.status or "active", exp

    # Sub yo'q — merchant.tariff_expires_at ga fallback (legacy tayinlash:
    # tarif bor, lekin MerchantSubscription yozuvi yo'q holat).
    exp = _aware(expires_at)
    if exp:
        return ("expired" if exp <= now else "active"), exp
    return "no_sub", None


async def match_tariff_by_monthly_price(db, price):
    """Berilgan oylik narxga teng FAOL Tariff'ni qaytaradi (yoki None).

    BillingPlan (legacy) → Tariff (yagona manba) ko'prigi. Narx mosligi orqali
    bog'laymiz: BillingPlan 'standard'/'pro'/'enterprise' (239k/490k/990k) ⇄
    Tariff 'start'/'business'/'enterprise' (239k/490k/990k).
    """
    from sqlalchemy import select
    from models import Tariff

    try:
        target = int(round(float(price or 0)))
    except (TypeError, ValueError):
        return None
    if not target:
        return None
    cands = (await db.execute(
        select(Tariff).where(Tariff.is_active.is_(True)).order_by(Tariff.sort_order)
    )).scalars().all()
    for c in cands:
        try:
            if int(round(float(c.monthly_price or 0))) == target:
                return c
        except (TypeError, ValueError):
            continue
    return None


async def resolve_merchant_tariff(merchant, db) -> dict:
    """
    Merchantning amaldagi TARIF va obuna holatini YAGONA manbadan hisoblaydi.

    Admin paneli (MerchantSubscription) va merchant tomoni (/me/tariff,
    feature-gating) bir xil natija olishi uchun — divergensiyaning oldini oladi.

    Manbalar (ustuvorlik bilan):
      - obuna holati/muddati: MerchantSubscription → merchant.tariff_expires_at
      - funksiya tarifi:      merchant.tariff_id   → MerchantSubscription.tariff_id

    Qaytaradi: {
        "tariff": Tariff|None, "tariff_id": int|None,
        "expires_at": datetime|None, "active": bool, "status": str,
    }  — `active` faqat obuna faol VA tarif mavjud bo'lganda True.
    """
    from sqlalchemy import select
    from models import BillingPlan, MerchantSubscription, Tariff

    sub = (await db.execute(
        select(MerchantSubscription).where(
            MerchantSubscription.merchant_id == merchant.id)
    )).scalar_one_or_none()

    m_expires = as_aware(getattr(merchant, "tariff_expires_at", None))
    status, sub_exp = resolve_sub_status(merchant.is_active, sub, m_expires)
    expires_at = sub_exp or m_expires

    tariff_id = getattr(merchant, "tariff_id", None) or (
        getattr(sub, "tariff_id", None) if sub else None)

    sub_active = status in ("active", "trial")

    tariff = None
    if tariff_id:
        tariff = (await db.execute(
            select(Tariff).where(Tariff.id == tariff_id))).scalar_one_or_none()

    # Fallback: Tariff yozuvi yo'q, lekin BillingPlan obunasi bor (yangi tarif
    # tizimi — Start/Business/Enterprise). To'lagan merchant Tariff topilmagani
    # uchun "Obuna faol emas / Muddati tugagan" bo'lib qolmasligi kerak.
    plan = None
    if tariff is None and sub is not None and getattr(sub, "plan_id", None):
        plan = (await db.execute(
            select(BillingPlan).where(BillingPlan.id == sub.plan_id))).scalar_one_or_none()
        # BillingPlan obunasini EKVIVALENT Tariff'ga (oylik narx bo'yicha)
        # bog'laymiz. Aks holda merchant panelida joriy tarif nomi BillingPlan
        # nomida ("Pro") ko'rinib, Tariff kartalari (Start/Pro/Business) bilan
        # mos kelmaydi va "Siz shu yerdasiz" noto'g'ri kartaga tushadi (id
        # fazolari har xil). Narx mosligi ⇒ to'g'ri Tariff.
        if plan is not None:
            matched = await match_tariff_by_monthly_price(
                db, getattr(plan, "price_monthly", None))
            if matched is not None:
                tariff = matched
                tariff_id = matched.id

    return {
        "tariff": tariff,
        "plan": plan,
        "tariff_id": tariff_id,
        "expires_at": expires_at,
        # Obuna faol VA (Tariff yoki BillingPlan) mavjud bo'lsa active.
        "active": bool(sub_active and (tariff is not None or plan is not None)),
        "status": status,
    }
