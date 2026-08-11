"""
routers/billing.py
──────────────────
Billing tizimi — rejalar, obunalar, invoiselar.

  GET/POST/PATCH/DELETE /admin/billing/plans
  GET/POST              /admin/billing/subscriptions
  PATCH                 /admin/billing/subscriptions/{merchant_id}
  GET/POST              /admin/billing/invoices
  PATCH                 /admin/billing/invoices/{id}  (mark paid / void)
  GET                   /merchants/me/billing — joriy merchant plan holati
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_merchant, require_admin_role
from core.subscription import days_remaining, sub_expired
from database import get_db
from models import BillingPlan, Invoice, Merchant, MerchantSubscription, PaymeTransaction, Tariff

admin_router = APIRouter(prefix="/admin/billing", tags=["💰 Billing"])
merchant_router = APIRouter(prefix="/merchants/me/billing", tags=["💰 Billing"])


# ── Plan schemas ─────────────────────────────────────────────────────────────
class _PlanIn(BaseModel):
    key: str = Field(min_length=1, max_length=30, pattern="^[a-z0-9_]+$")
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    price_monthly: float = 0.0
    price_yearly: float = 0.0
    max_cards: int = -1
    max_rewards: int = -1
    max_branches: int = 1
    features: dict = Field(default_factory=dict)
    sort_order: int = 100
    is_active: bool = True


class _SubIn(BaseModel):
    merchant_id: int
    plan_id: int
    status: str = Field("active", pattern="^(active|paused|cancelled|trial)$")
    expires_at: Optional[datetime] = None


class _InvoiceIn(BaseModel):
    merchant_id: int
    plan_id: Optional[int] = None
    amount: float = 0.0
    currency: str = "UZS"
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    note: str = ""


# ── PLANS ────────────────────────────────────────────────────────────────────
@admin_router.get("/plans", summary="Rejalar ro'yxati")
async def list_plans(
    admin=Depends(require_admin_role("super_admin", "analyst")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(select(BillingPlan).order_by(BillingPlan.sort_order, BillingPlan.id))).scalars().all()
    return [_plan_dict(p) for p in rows]


@admin_router.post("/plans", status_code=201, summary="Rejani yaratish")
async def create_plan(
    body: _PlanIn,
    admin=Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(select(BillingPlan).where(BillingPlan.key == body.key))).scalar_one_or_none()
    if existing:
        raise HTTPException(400, f"Key '{body.key}' allaqachon mavjud")
    p = BillingPlan(**body.model_dump())
    db.add(p)
    await db.commit()
    await db.refresh(p)
    logger.success(f"Plan yaratildi: {p.key}")
    return {"id": p.id}


@admin_router.patch("/plans/{plan_id}", summary="Rejani yangilash")
async def update_plan(
    plan_id: int,
    body: dict,
    admin=Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    p = (await db.execute(select(BillingPlan).where(BillingPlan.id == plan_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Reja topilmadi")
    allowed = {"name", "description", "price_monthly", "price_yearly", "max_cards",
               "max_rewards", "max_branches", "features", "sort_order", "is_active"}
    for k, v in (body or {}).items():
        if k in allowed:
            setattr(p, k, v)
    await db.commit()
    return {"ok": True}


@admin_router.delete("/plans/{plan_id}", summary="Rejani o'chirish")
async def delete_plan(
    plan_id: int,
    admin=Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    p = (await db.execute(select(BillingPlan).where(BillingPlan.id == plan_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Reja topilmadi")
    # Faol obunalar bog'langan bo'lsa — o'chirishni rad etamiz (orphan oldini olish)
    in_use = (await db.execute(
        select(sa_func.count(MerchantSubscription.id))
        .where(MerchantSubscription.plan_id == plan_id)
    )).scalar_one()
    if in_use:
        raise HTTPException(
            400,
            f"Bu rejada {in_use} ta obuna bor — avval ularni boshqa rejaga o'tkazing",
        )
    await db.delete(p)
    await db.commit()
    return {"ok": True}


# ── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
@admin_router.get("/subscriptions", summary="Barcha obunalar")
async def list_subs(
    admin=Depends(require_admin_role("super_admin", "analyst", "support")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MerchantSubscription, Merchant, BillingPlan, Tariff)
        .join(Merchant, Merchant.id == MerchantSubscription.merchant_id)
        .outerjoin(BillingPlan, BillingPlan.id == MerchantSubscription.plan_id)
        .outerjoin(Tariff, Tariff.id == MerchantSubscription.tariff_id)
        .order_by(MerchantSubscription.id.desc())
    )).all()
    return [
        {
            "id": s.id,
            "merchant_id": s.merchant_id,
            "merchant_name": m.business_name,
            "plan_id": s.plan_id,
            "plan_key": p.key if p else None,
            "plan_name": p.name if p else None,
            "tariff_id": s.tariff_id,
            # Yagona manba — Tariff nomi (yo'q bo'lsa legacy plan nomiga fallback)
            "tariff_name": (t.title_uz if t else None) or (p.name if p else None),
            "status": s.status,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
        }
        for s, m, p, t in rows
    ]


@admin_router.post("/subscriptions", summary="Merchantga reja biriktirish")
async def assign_sub(
    body: _SubIn,
    admin=Depends(require_admin_role("super_admin", "support")),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == body.merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")
    p = (await db.execute(select(BillingPlan).where(BillingPlan.id == body.plan_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Reja topilmadi")

    sub = (await db.execute(
        select(MerchantSubscription).where(MerchantSubscription.merchant_id == body.merchant_id)
    )).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if sub:
        sub.plan_id = body.plan_id
        sub.status = body.status
        sub.expires_at = body.expires_at
        sub.renewed_at = now
    else:
        sub = MerchantSubscription(
            merchant_id=body.merchant_id,
            plan_id=body.plan_id,
            tariff_id=getattr(m, "tariff_id", None),
            status=body.status,
            expires_at=body.expires_at,
        )
        db.add(sub)
    # Merchant bilan sinxron — tariff_id va expires_at (divergensiya bo'lmasin)
    sub.tariff_id = getattr(m, "tariff_id", None)
    m.tariff_expires_at = body.expires_at
    await db.commit()
    return {"ok": True}


@admin_router.patch("/subscriptions/{merchant_id}", summary="Obuna holati")
async def patch_sub(
    merchant_id: int,
    body: dict,
    admin=Depends(require_admin_role("super_admin", "support")),
    db: AsyncSession = Depends(get_db),
):
    sub = (await db.execute(
        select(MerchantSubscription).where(MerchantSubscription.merchant_id == merchant_id)
    )).scalar_one_or_none()
    if not sub:
        raise HTTPException(404, "Obuna topilmadi")
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    now = datetime.now(timezone.utc)

    if "status" in body and body["status"] in ("active", "paused", "cancelled", "trial"):
        sub.status = body["status"]
        # cancelled/paused → funksiyalarni darhol qulflash (tariff_gate muddatdan o'qiydi)
        if body["status"] in ("cancelled", "paused") and m:
            m.tariff_expires_at = now
    if "plan_id" in body:
        sub.plan_id = body["plan_id"]
    if "expires_at" in body:
        v = body["expires_at"]
        sub.expires_at = datetime.fromisoformat(str(v).replace("Z", "+00:00")) if v else None
        # Merchant.tariff_expires_at bilan sinxron saqlash
        if m:
            m.tariff_expires_at = sub.expires_at
    await db.commit()
    return {"ok": True}


# ── INVOICES ─────────────────────────────────────────────────────────────────
@admin_router.get("/invoices", summary="Invoiselar ro'yxati")
async def list_invoices(
    status: str = "",
    limit: int = Query(100, le=500),
    admin=Depends(require_admin_role("super_admin", "analyst", "support")),
    db: AsyncSession = Depends(get_db),
):
    q = select(Invoice, Merchant).join(Merchant, Merchant.id == Invoice.merchant_id)
    if status:
        q = q.where(Invoice.status == status)
    q = q.order_by(Invoice.id.desc()).limit(limit)
    rows = (await db.execute(q)).all()
    return [
        {
            "id": inv.id,
            "merchant_id": inv.merchant_id,
            "merchant_name": m.business_name,
            "plan_id": inv.plan_id,
            "invoice_number": inv.invoice_number,
            "amount": float(inv.amount or 0),
            "currency": inv.currency,
            "status": inv.status,
            "period_start": inv.period_start.isoformat() if inv.period_start else None,
            "period_end": inv.period_end.isoformat() if inv.period_end else None,
            "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
            "note": inv.note,
            "created_at": inv.created_at.isoformat() if inv.created_at else None,
        }
        for inv, m in rows
    ]


@admin_router.post("/invoices", status_code=201, summary="Qo'lda invoice yaratish")
async def create_invoice(
    body: _InvoiceIn,
    admin=Depends(require_admin_role("super_admin", "support")),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == body.merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")

    # Invoice raqamini generatsiya qilamiz
    count = (await db.execute(select(sa_func.count(Invoice.id)))).scalar() or 0
    inv_no = f"INV-{datetime.now(timezone.utc).strftime('%Y%m')}-{count + 1:04d}"

    inv = Invoice(
        merchant_id=body.merchant_id,
        plan_id=body.plan_id,
        invoice_number=inv_no,
        amount=body.amount,
        currency=body.currency,
        period_start=body.period_start,
        period_end=body.period_end,
        note=body.note,
        status="pending",
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    return {"id": inv.id, "invoice_number": inv.invoice_number}


@admin_router.patch("/invoices/{invoice_id}", summary="Invoice holati (paid/void)")
async def patch_invoice(
    invoice_id: int,
    body: dict,
    admin=Depends(require_admin_role("super_admin", "support")),
    db: AsyncSession = Depends(get_db),
):
    inv = (await db.execute(select(Invoice).where(Invoice.id == invoice_id))).scalar_one_or_none()
    if not inv:
        raise HTTPException(404, "Invoice topilmadi")
    status = body.get("status")
    if status not in ("pending", "paid", "failed", "refunded", "void"):
        raise HTTPException(400, "Noto'g'ri status")
    inv.status = status
    if status == "paid":
        inv.paid_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# ── Admin: real to'lovlar tarixi (Payme tranzaksiyalari) ────────────────────
_PAYME_STATE_LABEL = {
    1: "Kutilmoqda",
    2: "To'langan",
    -1: "Bekor qilingan",
    -2: "Qaytarilgan",
}


def _ms_to_iso(ms: int | None) -> str | None:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


@admin_router.get("/payments", summary="Merchant to'lovlari tarixi (Payme)")
async def list_payments(
    merchant_id: int = 0,
    state: Optional[int] = None,   # 1 | 2 | -1 | -2; bo'sh = barchasi
    limit: int = Query(100, le=500),
    admin=Depends(require_admin_role("super_admin", "analyst", "support")),
    db: AsyncSession = Depends(get_db),
):
    """Merchantlar platformadan foydalanish uchun qilgan real to'lovlari.

    Payme (Paycom) tranzaksiyalari — har biri merchant + invoice bilan
    bog'langan. `state=2` — muvaffaqiyatli to'langan.
    """
    q = (
        select(PaymeTransaction, Merchant, Invoice)
        .join(Merchant, Merchant.id == PaymeTransaction.merchant_id, isouter=True)
        .join(Invoice, Invoice.id == PaymeTransaction.invoice_id, isouter=True)
    )
    if merchant_id:
        q = q.where(PaymeTransaction.merchant_id == merchant_id)
    if state is not None:
        q = q.where(PaymeTransaction.state == state)
    q = q.order_by(PaymeTransaction.id.desc()).limit(limit)
    rows = (await db.execute(q)).all()

    return [
        {
            "id": tx.id,
            "merchant_id": tx.merchant_id,
            "merchant_name": m.business_name if m else "—",
            "amount": round((tx.amount_tiyin or 0) / 100, 2),  # tiyin → so'm
            "currency": "UZS",
            "method": "Payme",
            "state": tx.state,
            "status": _PAYME_STATE_LABEL.get(tx.state, str(tx.state)),
            "paid": tx.state == 2,
            "invoice_id": tx.invoice_id,
            "invoice_number": inv.invoice_number if inv else None,
            "paycom_id": tx.paycom_id,
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
            "performed_at": _ms_to_iso(tx.perform_time_ms),
            "cancelled_at": _ms_to_iso(tx.cancel_time_ms),
        }
        for tx, m, inv in rows
    ]


@admin_router.get("/payments/summary", summary="To'lovlar bo'yicha jami statistika")
async def payments_summary(
    admin=Depends(require_admin_role("super_admin", "analyst", "support")),
    db: AsyncSession = Depends(get_db),
):
    """Jami to'langan summa, to'lovlar soni va to'lagan merchantlar soni."""
    paid_amount = (await db.execute(
        select(sa_func.coalesce(sa_func.sum(PaymeTransaction.amount_tiyin), 0))
        .where(PaymeTransaction.state == 2)
    )).scalar() or 0
    paid_count = (await db.execute(
        select(sa_func.count(PaymeTransaction.id)).where(PaymeTransaction.state == 2)
    )).scalar() or 0
    paying_merchants = (await db.execute(
        select(sa_func.count(sa_func.distinct(PaymeTransaction.merchant_id)))
        .where(PaymeTransaction.state == 2)
    )).scalar() or 0
    return {
        "total_paid": round(paid_amount / 100, 2),
        "currency": "UZS",
        "paid_count": int(paid_count),
        "paying_merchants": int(paying_merchants),
    }


# ── Admin: per-merchant billing (history + manual extend) ───────────────────
@admin_router.get("/merchants/{merchant_id}", summary="Bir merchant billing tarixi")
async def admin_merchant_billing(
    merchant_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")

    sub_row = (await db.execute(
        select(MerchantSubscription, BillingPlan)
        .outerjoin(BillingPlan, BillingPlan.id == MerchantSubscription.plan_id)
        .where(MerchantSubscription.merchant_id == merchant_id)
    )).first()
    sub, plan = (sub_row[0], sub_row[1]) if sub_row else (None, None)

    invoices = (await db.execute(
        select(Invoice, BillingPlan)
        .outerjoin(BillingPlan, BillingPlan.id == Invoice.plan_id)
        .where(Invoice.merchant_id == merchant_id)
        .order_by(Invoice.id.desc())
    )).all()

    days_left = days_remaining(sub.expires_at if sub else None)

    return {
        "merchant": {
            "id": m.id,
            "business_name": m.business_name,
            "is_active": m.is_active,
        },
        "subscription": {
            "id": sub.id if sub else None,
            # muddat o'tgan bo'lsa "expired" hisoblanadi (status maydoni eskirgan bo'lishi mumkin)
            "status": "expired" if (sub and sub_expired(sub.expires_at)) else sub.status,
            "started_at": sub.started_at.isoformat() if sub and sub.started_at else None,
            "renewed_at": sub.renewed_at.isoformat() if sub and sub.renewed_at else None,
            "expires_at": sub.expires_at.isoformat() if sub and sub.expires_at else None,
            "days_left": days_left,
        } if sub else None,
        "plan": _plan_dict(plan) if plan else None,
        "invoices": [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "plan_name": bp.name if bp else None,
                "amount": float(inv.amount or 0),
                "currency": inv.currency,
                "status": inv.status,
                "period_start": inv.period_start.isoformat() if inv.period_start else None,
                "period_end": inv.period_end.isoformat() if inv.period_end else None,
                "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
                "note": inv.note,
                "created_at": inv.created_at.isoformat() if inv.created_at else None,
            }
            for inv, bp in invoices
        ],
        "totals": {
            "paid": float(sum((inv.amount or 0) for inv, _ in invoices if inv.status == "paid")),
            "pending": float(sum((inv.amount or 0) for inv, _ in invoices if inv.status == "pending")),
            "invoice_count": len(invoices),
        },
    }


class _ExtendIn(BaseModel):
    days: int = Field(..., ge=1, le=3650, description="Kun miqdori (1..3650)")
    plan_id: Optional[int] = None    # BillingPlan id — sub billing tarixi uchun
    tariff_id: Optional[int] = None  # Tariff id — merchant funksiya cheklovi uchun
    status: Optional[str] = Field(None, pattern="^(active|paused|cancelled|trial)$")
    mark_paid: bool = False
    amount: Optional[float] = None
    note: str = ""


@admin_router.post("/merchants/{merchant_id}/extend",
                   summary="Qo'lda obuna muddatini uzaytirish")
async def admin_extend_subscription(
    merchant_id: int,
    body: _ExtendIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Extend merchant's subscription by N days. Creates subscription row
    if none exists. Optionally creates a paid invoice for the record."""
    from datetime import timedelta
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")

    now = datetime.now(timezone.utc)
    sub = (await db.execute(
        select(MerchantSubscription).where(MerchantSubscription.merchant_id == merchant_id)
    )).scalar_one_or_none()
    if not sub:
        sub = MerchantSubscription(
            merchant_id=merchant_id,
            plan_id=body.plan_id,
            tariff_id=body.tariff_id or getattr(m, "tariff_id", None),
            status=body.status or "active",
            started_at=now,
            expires_at=now + timedelta(days=body.days),
        )
        db.add(sub)
    else:
        base = sub.expires_at if (sub.expires_at and sub.expires_at > now) else now
        sub.expires_at = base + timedelta(days=body.days)
        sub.renewed_at = now
        if body.plan_id:
            sub.plan_id = body.plan_id
        if body.status:
            sub.status = body.status
        elif sub.status in ("cancelled", "paused"):
            sub.status = "active"

    # Optional: bookkeeping invoice so tarix'da ko'rinadi.
    if body.mark_paid or body.amount:
        inv = Invoice(
            merchant_id=merchant_id,
            plan_id=body.plan_id or sub.plan_id,
            invoice_number=f"MAN-{merchant_id}-{int(now.timestamp())}",
            amount=body.amount or 0,
            currency="UZS",
            status="paid" if body.mark_paid else "pending",
            period_start=now,
            period_end=sub.expires_at,
            paid_at=now if body.mark_paid else None,
            note=body.note or f"Qo'lda kengaytirildi +{body.days} kun",
        )
        db.add(inv)

    # Yagona manba: merchant.tariff_* — /merchants/me/tariff va tariff_gate shu yerdan o'qiydi.
    # MerchantSubscription faqat billing tarixi (invoice/plan) uchun saqlanadi.
    if sub.expires_at:
        m.tariff_expires_at = sub.expires_at
    # MUHIM: plan_id (BillingPlan) ni tariff_id (Tariff) ga yozish MUMKIN EMAS —
    # ular alohida jadvallar. Faqat haqiqiy tariff_id yozamiz.
    if body.tariff_id:
        m.tariff_id = body.tariff_id
        if not m.tariff_started_at:
            m.tariff_started_at = now
    # Sub'ni merchant tarifi bilan sinxronlash (yagona manba)
    sub.tariff_id = getattr(m, "tariff_id", None)

    await db.commit()
    await db.refresh(sub)

    from core.admin_audit import log_admin_action
    log_admin_action(
        admin,
        f"extend_subscription merchant_id={merchant_id} days={body.days} "
        f"new_expires={sub.expires_at.isoformat() if sub.expires_at else '?'}",
    )

    return {
        "ok": True,
        "subscription": {
            "status": sub.status,
            "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
            "days_left": days_remaining(sub.expires_at),
        },
    }


# ── Merchant o'zining billing holati ─────────────────────────────────────────
@merchant_router.get("", summary="Joriy obuna holati")
async def my_billing(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    sub_row = (await db.execute(
        select(MerchantSubscription, BillingPlan)
        .outerjoin(BillingPlan, BillingPlan.id == MerchantSubscription.plan_id)
        .where(MerchantSubscription.merchant_id == merchant.id)
    )).first()

    sub, plan = (sub_row[0], sub_row[1]) if sub_row else (None, None)

    invoices = (await db.execute(
        select(Invoice).where(Invoice.merchant_id == merchant.id)
        .order_by(Invoice.id.desc()).limit(20)
    )).scalars().all()

    return {
        "subscription": {
            "status": "expired" if (sub and sub_expired(sub.expires_at)) else sub.status,
            "started_at": sub.started_at.isoformat() if sub and sub.started_at else None,
            "expires_at": sub.expires_at.isoformat() if sub and sub.expires_at else None,
        } if sub else None,
        "plan": _plan_dict(plan) if plan else None,
        "invoices": [
            {
                "id": i.id,
                "invoice_number": i.invoice_number,
                "amount": float(i.amount or 0),
                "currency": i.currency,
                "status": i.status,
                "created_at": i.created_at.isoformat() if i.created_at else None,
                "paid_at": i.paid_at.isoformat() if i.paid_at else None,
            }
            for i in invoices
        ],
    }


# ── Payme checkout (merchant Monvo'ga obuna to'lash uchun) ────────────────
class _CheckoutIn(BaseModel):
    tariff_id: Optional[int] = None
    plan_id: Optional[int] = None
    cycle: str = Field("monthly", pattern="^(monthly|yearly)$")
    return_url: Optional[str] = None
    lang: str = Field("uz", pattern="^(uz|ru|en)$")


@merchant_router.post("/checkout/payme", summary="Payme orqali to'lov uchun invoice + URL")
async def merchant_checkout_payme(
    body: _CheckoutIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Payme to'lov sahifasi uchun yangi pending invoice yaratadi va checkout
    URL'ini qaytaradi.

    Frontend foydalanuvchini shu URL'ga yo'naltiradi → Payme to'lovni qabul
    qilgach `/payme/merchant` JSON-RPC orqali bizga PerformTransaction yuboradi
    → invoice paid bo'ladi va obuna avtomatik uzaytiriladi.
    """
    from datetime import timedelta
    from config import settings as _s
    from core.payme import build_checkout_url
    from models import AppSettings

    # DB settings override env vars — allows admin panel config without redeploy
    _app = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
    _mid = (getattr(_app, "payme_merchant_id", "") or "").strip() or _s.PAYME_MERCHANT_ID
    _key = (getattr(_app, "payme_key", "") or "").strip() or _s.PAYME_KEY
    _tkey = (getattr(_app, "payme_test_key", "") or "").strip() or _s.PAYME_TEST_KEY
    _checkout_url = (getattr(_app, "payme_checkout_url", "") or "").strip() or _s.PAYME_CHECKOUT_URL

    if not _mid or not (_key or _tkey):
        raise HTTPException(503, "Payme integratsiyasi sozlanmagan")

    if not body.tariff_id and not body.plan_id:
        raise HTTPException(400, "tariff_id yoki plan_id majburiy")

    amount: float
    plan_id_for_invoice: Optional[int] = None
    tariff_id_for_invoice: Optional[int] = None

    if body.tariff_id:
        tariff = (await db.execute(
            select(Tariff).where(Tariff.id == body.tariff_id, Tariff.is_active.is_(True))
        )).scalar_one_or_none()
        if tariff is None:
            raise HTTPException(404, "Tarif topilmadi yoki faol emas")
        # yillik = 12 oy narxi (alohida yillik narx maydoni yo'q)
        base_price = float(tariff.monthly_price or 0)
        amount = base_price * 12 if body.cycle == "yearly" else base_price
        tariff_id_for_invoice = tariff.id
    else:
        plan = (await db.execute(
            select(BillingPlan).where(BillingPlan.id == body.plan_id, BillingPlan.is_active.is_(True))
        )).scalar_one_or_none()
        if plan is None:
            raise HTTPException(404, "Tarif topilmadi yoki faol emas")
        raw = plan.price_yearly if body.cycle == "yearly" else plan.price_monthly
        amount = float(raw or 0)
        plan_id_for_invoice = plan.id
        # Yagona manba — Tariff. Legacy plan_id orqali to'lov bo'lsa ham,
        # invoice'ga ekvivalent tariff_id'ni (narx bo'yicha) yozamiz — to'lov
        # paid bo'lgach merchant.tariff_id to'g'ri o'rnatiladi.
        from core.subscription import match_tariff_by_monthly_price
        matched_t = await match_tariff_by_monthly_price(db, plan.price_monthly)
        if matched_t is not None:
            tariff_id_for_invoice = matched_t.id
    if amount <= 0:
        raise HTTPException(400, "Bu tarif Payme orqali to'lash uchun mavjud emas")
    if amount * 100 < _s.PAYME_MIN_AMOUNT or amount * 100 > _s.PAYME_MAX_AMOUNT:
        raise HTTPException(
            400,
            f"Summa chegaradan tashqarida ({_s.PAYME_MIN_AMOUNT // 100}–"
            f"{_s.PAYME_MAX_AMOUNT // 100} so'm)",
        )

    now = datetime.now(timezone.utc)
    period_days = 365 if body.cycle == "yearly" else 30

    inv = Invoice(
        merchant_id=merchant.id,
        plan_id=plan_id_for_invoice,
        tariff_id=tariff_id_for_invoice,
        invoice_number=f"PAYME-{merchant.id}-{int(now.timestamp())}",
        amount=amount,
        currency="UZS",
        status="pending",
        period_start=now,
        period_end=now + timedelta(days=period_days),
        note=f"Payme checkout · {body.cycle}",
    )
    db.add(inv)
    await db.flush()

    url = build_checkout_url(
        merchant_id=_mid,
        invoice_id=inv.id,
        amount_sum=amount,
        base_url=_checkout_url,
        lang=body.lang,
        return_url=body.return_url,
    )
    await db.commit()
    await db.refresh(inv)

    return {
        "ok": True,
        "invoice": {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "amount": float(inv.amount),
            "currency": inv.currency,
            "status": inv.status,
            "expires_at": inv.period_end.isoformat() if inv.period_end else None,
        },
        "checkout_url": url,
    }


def _plan_dict(p: Optional[BillingPlan]) -> Optional[dict]:
    if not p:
        return None
    return {
        "id": p.id,
        "key": p.key,
        "name": p.name,
        "description": p.description,
        "price_monthly": float(p.price_monthly or 0),
        "price_yearly": float(p.price_yearly or 0),
        "max_cards": p.max_cards,
        "max_rewards": p.max_rewards,
        "max_branches": p.max_branches,
        "features": p.features or {},
        "sort_order": p.sort_order,
        "is_active": p.is_active,
    }


# ── Backfill: tariff_expires_at bor lekin MerchantSubscription yo'q merchantlar ─
@admin_router.post("/backfill-subscriptions", summary="Eski merchantlar uchun MerchantSubscription yaratish")
async def backfill_subscriptions(
    admin=Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    tariff_id va tariff_expires_at bor, lekin MerchantSubscription yo'q
    merchantlar uchun bir martalik migratsiya.
    """
    merchants_with_tariff = (await db.execute(
        select(Merchant).where(
            Merchant.tariff_id.is_not(None),
            Merchant.tariff_expires_at.is_not(None),
        )
    )).scalars().all()

    existing_ids = {
        row[0] for row in (await db.execute(
            select(MerchantSubscription.merchant_id)
        )).all()
    }

    created = 0
    for m in merchants_with_tariff:
        if m.id in existing_ids:
            continue
        status = "expired" if sub_expired(m.tariff_expires_at) else "active"
        db.add(MerchantSubscription(
            merchant_id=m.id,
            tariff_id=getattr(m, "tariff_id", None),
            status=status,
            started_at=getattr(m, "tariff_started_at", None) or m.created_at,
            expires_at=m.tariff_expires_at,
        ))
        created += 1

    if created:
        await db.commit()

    return {"created": created, "total_checked": len(merchants_with_tariff)}
