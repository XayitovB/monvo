"""
routers/tariffs.py
───────────────────
Tariflar (subscription plans) tizimi.

  GET    /tariffs                          — Public: faol tariflar (website pricing)
  GET    /admin/tariffs                    — Admin: barcha tariflar
  POST   /admin/tariffs                    — Admin: tarif yaratish
  PATCH  /admin/tariffs/{id}               — Admin: tahrirlash
  DELETE /admin/tariffs/{id}               — Admin: o'chirish
  POST   /admin/merchants/{id}/tariff      — Admin: merchant'ga tarif belgilash
  GET    /merchants/me/tariff              — Merchant: o'z tarifi va qolgan kunlar
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select, text as _text
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, get_current_merchant
from core.subscription import days_remaining, resolve_merchant_tariff
from database import get_db
from models import Merchant, MerchantSubscription, PushNotificationLog, Tariff


router = APIRouter(tags=["💎 Tariffs"])


# ── Schemas ──────────────────────────────────────────────────────────────────
class TariffIn(BaseModel):
    name: str = ""
    title_uz: str = ""
    title_ru: str = ""
    description_uz: str = ""
    description_ru: str = ""
    monthly_price: int = 0
    duration_days: Optional[int] = None  # null = oylik; demo = 14
    is_active: bool = True
    is_recommended: bool = False
    sort_order: int = 0
    max_customers: Optional[int] = None
    max_branches: Optional[int] = None
    max_staff: Optional[int] = None
    max_rewards: Optional[int] = None
    max_push_per_month: Optional[int] = None
    max_announcements: Optional[int] = None
    has_tier: bool = False
    has_gamification: bool = False
    has_games: bool = False
    has_birthday_bonus: bool = False
    has_segments_advanced: bool = False
    has_card_design_custom: bool = False
    has_api_access: bool = False
    has_priority_support: bool = False
    has_scheduled_push: bool = False
    has_pos_integration: bool = False
    extra_features: list = []


class AssignTariffBody(BaseModel):
    tariff_id: int
    days: int = 30  # Necha kunga belgilash


# ── Migration helpers ────────────────────────────────────────────────────────
# Process davomida bir marta ishlaydi. Aks holda har bir /tariffs va
# /merchants/me/tariff so'rovi `ALTER TABLE merchants ...` (ACCESS EXCLUSIVE
# lock) ishga tushirib, lock navbatida butun merchants jadvalini bloklab,
# login va boshqa so'rovlarni osib qo'yardi.
_tariff_tables_ready = False


async def _ensure_tariff_tables(db: AsyncSession) -> None:
    """Tariff jadvali va merchants ustunlarini Postgres'da ta'minlash (bir marta)."""
    global _tariff_tables_ready
    if _tariff_tables_ready:
        return
    # DDL cheksiz bloklanmasin — lock 3s ichida olinmasa, xato berib o'tib ketadi
    # (keyingi urinishda yana sinab ko'riladi).
    try:
        await db.execute(_text("SET LOCAL lock_timeout = '3s'"))
    except Exception:
        pass
    statements = [
        # Tariffs jadvali (agar yo'q bo'lsa)
        """
        CREATE TABLE IF NOT EXISTS tariffs (
            id SERIAL PRIMARY KEY,
            name VARCHAR(80) NOT NULL DEFAULT '',
            title_uz VARCHAR(100) NOT NULL DEFAULT '',
            title_ru VARCHAR(100) NOT NULL DEFAULT '',
            description_uz TEXT DEFAULT '',
            description_ru TEXT DEFAULT '',
            monthly_price INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_recommended BOOLEAN NOT NULL DEFAULT false,
            max_customers INTEGER,
            max_branches INTEGER,
            max_staff INTEGER,
            max_rewards INTEGER,
            max_push_per_month INTEGER,
            max_announcements INTEGER,
            has_tier BOOLEAN NOT NULL DEFAULT false,
            has_gamification BOOLEAN NOT NULL DEFAULT false,
            has_games BOOLEAN NOT NULL DEFAULT false,
            has_birthday_bonus BOOLEAN NOT NULL DEFAULT false,
            has_segments_advanced BOOLEAN NOT NULL DEFAULT false,
            has_card_design_custom BOOLEAN NOT NULL DEFAULT false,
            has_api_access BOOLEAN NOT NULL DEFAULT false,
            has_priority_support BOOLEAN NOT NULL DEFAULT false,
            has_scheduled_push BOOLEAN NOT NULL DEFAULT false,
            extra_features JSON DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        # Merchants jadvaliga ustunlar qo'shish
        "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tariff_id INTEGER REFERENCES tariffs(id) ON DELETE SET NULL",
        "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tariff_started_at TIMESTAMPTZ",
        "ALTER TABLE merchants ADD COLUMN IF NOT EXISTS tariff_expires_at TIMESTAMPTZ",
        # Yangi xususiyatlar (idempotent migration)
        "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS has_pos_integration BOOLEAN NOT NULL DEFAULT false",
        # Tarif davomiyligi (null = oylik; demo = 14 kun)
        "ALTER TABLE tariffs ADD COLUMN IF NOT EXISTS duration_days INTEGER",
        # ── Demo tarif (14 kunlik bepul sinov) — idempotent seed ──
        """
        INSERT INTO tariffs (
            name, title_uz, title_ru, description_uz, description_ru,
            monthly_price, duration_days, sort_order, is_active, is_recommended,
            max_customers, max_branches, max_staff, max_rewards,
            max_push_per_month, max_announcements,
            has_tier, has_gamification, has_games, has_birthday_bonus,
            has_card_design_custom, has_scheduled_push
        )
        SELECT 'demo', 'Demo', 'Демо',
            '14 kunlik bepul sinov — barcha asosiy imkoniyatlar',
            '14-дневный бесплатный пробный период',
            0, 14, 0, true, false,
            200, 1, 2, 5, 4, 2,
            true, true, true, true, true, true
        WHERE NOT EXISTS (SELECT 1 FROM tariffs WHERE name = 'demo')
        """,
        # Invoice'ga tariff_id — Payme to'lovi qaysi tarifga ekanini saqlash
        "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tariff_id INTEGER REFERENCES tariffs(id) ON DELETE SET NULL",
        # MerchantSubscription'ga tariff_id — yagona obuna manbai (admin↔merchant)
        "ALTER TABLE merchant_subscriptions ADD COLUMN IF NOT EXISTS tariff_id INTEGER REFERENCES tariffs(id) ON DELETE SET NULL",
        # Data-heal: sub.tariff_id ← merchant.tariff_id (qaysi biri bo'sh bo'lsa)
        """
        UPDATE merchant_subscriptions s SET tariff_id = m.tariff_id
        FROM merchants m
        WHERE s.merchant_id = m.id AND s.tariff_id IS NULL AND m.tariff_id IS NOT NULL
        """,
        # Data-heal: merchant.tariff_id ← sub.tariff_id (teskari yo'nalish)
        """
        UPDATE merchants m SET tariff_id = s.tariff_id
        FROM merchant_subscriptions s
        WHERE m.id = s.merchant_id AND m.tariff_id IS NULL AND s.tariff_id IS NOT NULL
        """,
        # ── Tarif nomlari: Start / Pro / Business (narx bo'yicha, idempotent) ──
        "UPDATE tariffs SET title_uz='Start', title_ru='Start' WHERE monthly_price=239000",
        "UPDATE tariffs SET title_uz='Pro', title_ru='Pro' WHERE monthly_price=490000",
        "UPDATE tariffs SET title_uz='Business', title_ru='Business' WHERE monthly_price=990000",
        # ── Birlashtirish: legacy BillingPlan obunalarini Tariff'ga (narx bo'yicha) ──
        # sub.tariff_id ← plan narxidan ekvivalent Tariff
        """
        UPDATE merchant_subscriptions s SET tariff_id = t.id
        FROM billing_plans p, tariffs t
        WHERE s.plan_id = p.id AND s.tariff_id IS NULL
          AND ROUND(t.monthly_price) = ROUND(p.price_monthly)
        """,
        # merchant.tariff_id ← sub.tariff_id (yangi to'ldirilganidan keyin)
        """
        UPDATE merchants m SET tariff_id = s.tariff_id
        FROM merchant_subscriptions s
        WHERE m.id = s.merchant_id AND m.tariff_id IS NULL AND s.tariff_id IS NOT NULL
        """,
        # invoice.tariff_id ← plan narxidan ekvivalent Tariff (billing tarixi)
        """
        UPDATE invoices i SET tariff_id = t.id
        FROM billing_plans p, tariffs t
        WHERE i.plan_id = p.id AND i.tariff_id IS NULL
          AND ROUND(t.monthly_price) = ROUND(p.price_monthly)
        """,
    ]
    ok = True
    for stmt in statements:
        try:
            await db.execute(_text(stmt))
        except Exception as e:
            logger.warning(f"tariff migration skip: {type(e).__name__}: {e}")
            ok = False
            try:
                await db.rollback()
            except Exception:
                pass
            break  # rollback'dan keyin tranzaksiya buzilgan — qolganini keyingi safar
    try:
        await db.commit()
    except Exception:
        ok = False
        try:
            await db.rollback()
        except Exception:
            pass
    # Faqat to'liq muvaffaqiyatda bir martalik bayroqni yoqamiz; aks holda
    # keyingi so'rovda yana sinab ko'riladi (lekin endi bloklanmaydi).
    if ok:
        _tariff_tables_ready = True


# ── Serialization helper ─────────────────────────────────────────────────────
def _serialize(t: Tariff) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "title_uz": t.title_uz,
        "title_ru": t.title_ru,
        "description_uz": t.description_uz,
        "description_ru": t.description_ru,
        "monthly_price": t.monthly_price,
        "duration_days": t.duration_days,
        "is_active": t.is_active,
        "is_recommended": t.is_recommended,
        "sort_order": t.sort_order,
        "limits": {
            "customers": t.max_customers,
            "branches": t.max_branches,
            "staff": t.max_staff,
            "rewards": t.max_rewards,
            "push_per_month": t.max_push_per_month,
            "announcements": t.max_announcements,
        },
        "features": {
            "tier": t.has_tier,
            "gamification": t.has_gamification,
            "games": t.has_games,
            "birthday_bonus": t.has_birthday_bonus,
            "segments_advanced": t.has_segments_advanced,
            "card_design_custom": t.has_card_design_custom,
            "api_access": t.has_api_access,
            "priority_support": t.has_priority_support,
            "scheduled_push": t.has_scheduled_push,
            "pos_integration": t.has_pos_integration,
        },
        "extra_features": t.extra_features or [],
    }


# ── Public ───────────────────────────────────────────────────────────────────
@router.get("/tariffs", summary="Public: faol tariflar (website uchun)")
async def public_list_tariffs(db: AsyncSession = Depends(get_db)):
    await _ensure_tariff_tables(db)
    rows = (await db.execute(
        select(Tariff).where(Tariff.is_active.is_(True)).order_by(Tariff.sort_order, Tariff.monthly_price)
    )).scalars().all()
    return [_serialize(t) for t in rows]


# ── Admin CRUD ───────────────────────────────────────────────────────────────
@router.get("/admin/tariffs", summary="Admin: barcha tariflar")
async def admin_list_tariffs(
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tariff_tables(db)
    rows = (await db.execute(
        select(Tariff).order_by(Tariff.sort_order, Tariff.monthly_price)
    )).scalars().all()
    return [_serialize(t) for t in rows]


def _apply_input(t: Tariff, body: TariffIn) -> None:
    t.name = body.name.strip()
    t.title_uz = body.title_uz.strip()
    t.title_ru = body.title_ru.strip()
    t.description_uz = body.description_uz
    t.description_ru = body.description_ru
    t.monthly_price = max(0, int(body.monthly_price))
    t.duration_days = (int(body.duration_days) if body.duration_days and body.duration_days > 0 else None)
    t.is_active = body.is_active
    t.is_recommended = body.is_recommended
    t.sort_order = int(body.sort_order)
    t.max_customers = body.max_customers
    t.max_branches = body.max_branches
    t.max_staff = body.max_staff
    t.max_rewards = body.max_rewards
    t.max_push_per_month = body.max_push_per_month
    t.max_announcements = body.max_announcements
    t.has_tier = body.has_tier
    t.has_gamification = body.has_gamification
    t.has_games = body.has_games
    t.has_birthday_bonus = body.has_birthday_bonus
    t.has_segments_advanced = body.has_segments_advanced
    t.has_card_design_custom = body.has_card_design_custom
    t.has_api_access = body.has_api_access
    t.has_priority_support = body.has_priority_support
    t.has_scheduled_push = body.has_scheduled_push
    t.has_pos_integration = body.has_pos_integration
    t.extra_features = body.extra_features or []


@router.post("/admin/tariffs", status_code=201, summary="Admin: tarif yaratish")
async def admin_create_tariff(
    body: TariffIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tariff_tables(db)
    if not body.title_uz.strip():
        raise HTTPException(400, "title_uz majburiy")
    t = Tariff()
    _apply_input(t, body)
    db.add(t)
    try:
        await db.commit()
        await db.refresh(t)
    except Exception as e:
        await db.rollback()
        logger.error(f"tariff create failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Yaratish xatosi: {type(e).__name__}: {str(e)[:200]}")
    return _serialize(t)


@router.patch("/admin/tariffs/{tariff_id}", summary="Admin: tarifni tahrirlash")
async def admin_update_tariff(
    tariff_id: int,
    body: TariffIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tariff_tables(db)
    t = (await db.execute(select(Tariff).where(Tariff.id == tariff_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tarif topilmadi")
    _apply_input(t, body)
    try:
        await db.commit()
        await db.refresh(t)
    except Exception as e:
        await db.rollback()
        logger.error(f"tariff update failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Yangilash xatosi: {type(e).__name__}: {str(e)[:200]}")
    return _serialize(t)


@router.delete("/admin/tariffs/{tariff_id}", summary="Admin: tarifni o'chirish")
async def admin_delete_tariff(
    tariff_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tariff_tables(db)
    t = (await db.execute(select(Tariff).where(Tariff.id == tariff_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tarif topilmadi")
    in_use = (await db.execute(
        _text("SELECT COUNT(*) FROM merchants WHERE tariff_id = :tid"),
        {"tid": tariff_id},
    )).scalar() or 0
    if in_use > 0:
        raise HTTPException(400, f"Bu tarifda {in_use} ta merchant bor — avval ularni boshqa tarifga o'tkazing")
    try:
        await db.delete(t)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"tariff delete failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"O'chirish xatosi: {type(e).__name__}: {str(e)[:200]}")
    return {"message": "O'chirildi"}


# ── Merchant'ga tarif belgilash ──────────────────────────────────────────────
@router.post("/admin/merchants/{merchant_id}/tariff", summary="Admin: merchant tarifini belgilash")
async def admin_assign_tariff(
    merchant_id: int,
    body: AssignTariffBody,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tariff_tables(db)
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")
    t = (await db.execute(select(Tariff).where(Tariff.id == body.tariff_id))).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Tarif topilmadi")
    # Tarifning o'z davomiyligi bo'lsa (masalan demo = 14 kun) — o'shani
    # ishlatamiz; aks holda so'ralgan kunlar (oylik).
    days = int(t.duration_days) if t.duration_days else max(1, int(body.days))
    now = datetime.now(timezone.utc)
    m.tariff_id = t.id
    m.tariff_started_at = now
    m.tariff_expires_at = now + timedelta(days=days)

    # MerchantSubscription bilan sinxronlash — yagona manba
    sub = (await db.execute(
        select(MerchantSubscription).where(MerchantSubscription.merchant_id == merchant_id)
    )).scalar_one_or_none()
    if sub:
        sub.status = "active"
        sub.tariff_id = t.id
        sub.expires_at = m.tariff_expires_at
        sub.renewed_at = now
    else:
        db.add(MerchantSubscription(
            merchant_id=merchant_id,
            tariff_id=t.id,
            status="active",
            started_at=now,
            expires_at=m.tariff_expires_at,
        ))

    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, f"Belgilash xatosi: {type(e).__name__}: {str(e)[:200]}")
    return {
        "merchant_id": m.id,
        "tariff_id": t.id,
        "tariff_name": t.title_uz,
        "started_at": m.tariff_started_at.isoformat(),
        "expires_at": m.tariff_expires_at.isoformat(),
        "days": days,
    }


# ── Merchant: o'z tarifi ─────────────────────────────────────────────────────
def _plan_as_tariff(p) -> dict:
    """BillingPlan'ni Tariff ko'rinishidagi minimal dict'ga aylantiradi —
    merchant Tariff yozuvisiz (faqat BillingPlan obunasi) bo'lganda tarif
    nomi/narxi ko'rsatilishi uchun."""
    feats = p.features if isinstance(getattr(p, "features", None), dict) else {}
    return {
        "id": p.id,
        "name": p.name,
        "title_uz": p.name,
        "title_ru": p.name,
        "description_uz": "",
        "description_ru": "",
        "monthly_price": float(getattr(p, "price_monthly", 0) or 0),
        "is_active": getattr(p, "is_active", True),
        "is_recommended": False,
        "sort_order": getattr(p, "sort_order", 100),
        "limits": {
            "customers": getattr(p, "max_cards", None),
            "branches": getattr(p, "max_branches", None),
            "staff": None,
            "rewards": getattr(p, "max_rewards", None),
            "push_per_month": None,
            "announcements": None,
        },
        "features": feats,
    }


@router.get("/merchants/me/tariff", summary="Merchant: o'z tarifi va qolgan kunlar")
async def merchant_my_tariff(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tariff_tables(db)
    # Yagona manba — admin paneli bilan bir xil natija (MerchantSubscription
    # va merchant.tariff_id sinxron hisoblanadi).
    res = await resolve_merchant_tariff(merchant, db)
    t = res["tariff"]
    plan = res.get("plan")
    expires_at = res["expires_at"]
    # "expired" obuna STATUSidan hisoblanadi (Tariff yozuvi bor-yo'qligidan
    # emas) — aks holda BillingPlan obunasi faol bo'lsa ham "Muddati tugagan"
    # ko'rinardi.
    sub_active = res["status"] in ("active", "trial")
    # Tarif nomi: Tariff yoki (yo'q bo'lsa) BillingPlan'dan.
    tariff_dict = _serialize(t) if t else (_plan_as_tariff(plan) if plan else None)
    if not sub_active:
        return {
            "tariff": tariff_dict,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "days_remaining": days_remaining(expires_at),
            "expired": True,
        }
    return {
        "tariff": tariff_dict,
        "started_at": getattr(merchant, "tariff_started_at", None).isoformat() if getattr(merchant, "tariff_started_at", None) else None,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "days_remaining": days_remaining(expires_at),
        "expired": False,
    }


@router.get("/merchants/me/push-stats", summary="Merchant: bu oyda yuborilgan push soni")
async def merchant_push_stats(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_tariff_tables(db)
    # Bu oy boshidan hisoblash
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = await db.execute(
        select(_text("COALESCE(SUM(sent_count), 0)"))
        .select_from(PushNotificationLog.__table__)
        .where(
            PushNotificationLog.sent_by.like(f"merchant#{merchant.id}%"),
            PushNotificationLog.sent_at >= month_start,
        )
    )
    used = int(result.scalar() or 0)

    # Tarifdan limit
    res = await resolve_merchant_tariff(merchant, db)
    t = res.get("tariff")
    limit = t.max_push_per_month if t and t.max_push_per_month else None
    remaining = max(0, limit - used) if limit is not None else None

    return {
        "used_this_month": used,
        "limit": limit,
        "remaining": remaining,
        "month_start": month_start.isoformat(),
    }
