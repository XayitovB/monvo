"""
routers/merchants.py
────────────────────
Biznes (merchant) akkauntlari uchun auth, profil, mijoz segmentlari,
analitika va targetlangan push kampaniyalari.
"""
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import OAuth2PasswordRequestForm
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import Date, case, cast, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.dependencies import get_current_merchant
from core.tariff_gate import require_feature
from core.fcm import is_firebase_ready, send_fcm_multicast
from core.login_security import (
    maybe_alert_new_device,
    record_login_attempt,
    safe_verify_password,
)
from core.security import create_merchant_token, hash_password
from database import get_db
from models import (
    Card,
    FCMToken,
    Merchant,
    MerchantBranch,
    PushNotificationLog,
    Reward,
    Transaction,
    User,
)
from schemas import (
    MerchantLogin,
    MerchantOut,
    MerchantRegister,
    MerchantTokenResponse,
    MerchantUpdate,
)

router = APIRouter(prefix="/merchants", tags=["🏪 Merchants"])

from main import limiter as _limiter


@router.post("/register", response_model=MerchantTokenResponse, status_code=201,
             summary="Yangi biznes akkaunt ochish")
@_limiter.limit(f"{settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def register_merchant(
    request: Request,
    body: MerchantRegister,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Merchant).where(Merchant.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Email '{body.email}' allaqachon ro'yxatdan o'tgan")

    merchant = Merchant(
        business_name=body.business_name,
        email=body.email,
        password_hash=hash_password(body.password),
        phone=body.phone or "",
        description=body.description or "",
    )
    db.add(merchant)
    await db.commit()
    await db.refresh(merchant)

    token = create_merchant_token({"sub": str(merchant.id)})
    logger.success(f"Yangi merchant: {body.email}")
    return MerchantTokenResponse(
        access_token=token,
        merchant_id=merchant.id,
        business_name=merchant.business_name,
    )


@router.post("/login", response_model=MerchantTokenResponse,
             summary="Merchant kirish (JWT)")
@_limiter.limit(f"{settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def login_merchant(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Merchant email + parol login.

    Brute-force va account-enumeration himoyasi:
      - Constant-time bcrypt verify (hisob mavjud bo'lmasa ham vaqt bir xil)
      - Audit log (har urinish — muvaffaqiyatli + muvaffaqiyatsiz)
      - Yangi qurilmadan login → ogohlantiruvchi email
    """
    identifier = (form.username or "").strip().lower()

    result = await db.execute(select(Merchant).where(Merchant.email == identifier))
    merchant = result.scalar_one_or_none()

    real_hash = merchant.password_hash if merchant else None
    password_ok = safe_verify_password(form.password, real_hash)

    if not merchant or not password_ok:
        await record_login_attempt(
            db, identifier=identifier, role="merchant",
            success=False, request=request,
            user_id=merchant.id if merchant else None,
            error_reason="bad_password" if merchant else "unknown_user",
        )
        # Generic xato — qaysi maydon noto'g'ri ekanini oshkor qilmaydi
        raise HTTPException(401, "Email yoki parol noto'g'ri")

    if not merchant.is_active:
        await record_login_attempt(
            db, identifier=identifier, role="merchant", success=False,
            request=request, user_id=merchant.id, error_reason="disabled",
        )
        raise HTTPException(403, "Akkaunt bloklangan")

    # Yangi qurilma bo'lsa email yuborish (audit yozuvidan oldin —
    # is_known_login() shu yozuvni o'zini yangi-qurilma deb topmasligi uchun)
    await maybe_alert_new_device(
        db,
        request=request,
        identifier=identifier,
        role="merchant",
        user_id=merchant.id,
        notify_email=merchant.email,
    )

    await record_login_attempt(
        db, identifier=identifier, role="merchant",
        success=True, request=request, user_id=merchant.id,
    )

    token = create_merchant_token({"sub": merchant.id})
    return MerchantTokenResponse(
        access_token=token,
        merchant_id=merchant.id,
        business_name=merchant.business_name,
    )


@router.get("/me", summary="Joriy merchant profili")
async def me(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    # Compute live counts so the merchant home / profile hero card shows
    # accurate FILIALLAR + MIJOZLAR numbers. Cheap aggregate queries — both
    # tables already have `merchant_id` indexed.
    branches_count = (await db.execute(
        select(func.count(MerchantBranch.id))
        .where(MerchantBranch.merchant_id == merchant.id)
    )).scalar() or 0
    cards_count = (await db.execute(
        select(func.count(Card.id))
        .where(Card.merchant_id == merchant.id)
    )).scalar() or 0

    return {
        "id": merchant.id,
        "business_name": merchant.business_name,
        "business_type": merchant.business_type,
        "email": merchant.email,
        "phone": merchant.phone,
        "description": merchant.description,
        "logo_url": merchant.logo_url,
        "brand_color": merchant.brand_color,
        "card_design": dict(merchant.card_design or {}),
        "loyalty_type": getattr(merchant, "loyalty_type", "cashback"),
        "spend_goal": int(getattr(merchant, "spend_goal", 1000000) or 1000000),
        "stamp_threshold": getattr(merchant, "stamp_threshold", 7),
        "stamp_reward_title": getattr(merchant, "stamp_reward_title", "") or "Bepul mahsulot",
        "stamp_icon": getattr(merchant, "stamp_icon", "coffee") or "coffee",
        "is_active": merchant.is_active,
        "tariff_id": merchant.tariff_id,
        "tariff_started_at": (
            merchant.tariff_started_at.isoformat()
            if merchant.tariff_started_at else None
        ),
        "tariff_expires_at": (
            merchant.tariff_expires_at.isoformat()
            if merchant.tariff_expires_at else None
        ),
        "created_at": (
            merchant.created_at.isoformat() if merchant.created_at else None
        ),
        "branches_count": int(branches_count),
        "cards_count": int(cards_count),
    }


class _MerchantCredentialsUpdate(BaseModel):
    current_password: str = Field(min_length=1)
    new_login: Optional[str] = None
    new_password: Optional[str] = None


@router.patch("/me/credentials", summary="Login va parolni o'zgartirish")
async def update_my_credentials(
    body: _MerchantCredentialsUpdate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Merchant o'zining login (email/username) va parolini o'zgartiradi.

    Joriy parolni qayta tasdiqlatamiz — sessiya o'g'irlangan bo'lsa ham,
    hujumchi credential'larni o'zgartira olmasligi uchun.
    """
    if not safe_verify_password(body.current_password, merchant.password_hash):
        raise HTTPException(401, "Joriy parol noto'g'ri")

    new_login = (body.new_login or "").strip().lower() or None
    new_password = (body.new_password or "").strip() or None

    if not new_login and not new_password:
        raise HTTPException(400, "Yangi login yoki parol kiriting")

    if new_login is not None:
        if len(new_login) < 3:
            raise HTTPException(400, "Login kamida 3 belgi bo'lishi kerak")
        if " " in new_login:
            raise HTTPException(400, "Loginda bo'sh joy bo'lmasligi kerak")
        if new_login != merchant.email:
            taken = (await db.execute(
                select(Merchant).where(
                    Merchant.email == new_login, Merchant.id != merchant.id
                )
            )).scalar_one_or_none()
            if taken:
                raise HTTPException(409, "Bu login allaqachon band")
            merchant.email = new_login

    if new_password is not None:
        if len(new_password) < 6:
            raise HTTPException(400, "Yangi parol kamida 6 belgi bo'lishi kerak")
        merchant.password_hash = hash_password(new_password)

    try:
        await db.commit()
        await db.refresh(merchant)
    except Exception as e:  # noqa: BLE001
        await db.rollback()
        logger.error(f"merchant credentials update failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Saqlanmadi: {type(e).__name__}")

    return {
        "ok": True,
        "login": merchant.email if not (merchant.email or "").endswith("@monvo.internal") else None,
        "login_changed": new_login is not None,
        "password_changed": new_password is not None,
    }


@router.patch("/me", response_model=MerchantOut, summary="Profilni yangilash")
async def update_me(
    body: MerchantUpdate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump(exclude_unset=True)
    if "loyalty_type" in payload and payload["loyalty_type"] not in ("cashback", "stamp", "spend"):
        raise HTTPException(400, "loyalty_type 'cashback', 'stamp' yoki 'spend' bo'lishi kerak")
    if "spend_goal" in payload:
        try:
            payload["spend_goal"] = max(1000, int(payload["spend_goal"]))
        except (TypeError, ValueError):
            payload["spend_goal"] = 1000000
    if "stamp_icon" in payload:
        _allowed_icons = {"coffee", "tea", "pizza", "burger", "fastfood", "icecream",
                          "cake", "bakery", "gift", "star", "heart", "cart"}
        if payload["stamp_icon"] not in _allowed_icons:
            payload["stamp_icon"] = "coffee"
    if "logo_url" in payload and payload["logo_url"] is not None:
        logo = payload["logo_url"].strip()
        # Format check only (URL or data:image) — no size cap.
        if logo and not (
            logo.startswith("http://") or logo.startswith("https://")
            or logo.startswith("data:image/")
        ):
            raise HTTPException(400, "logo_url URL yoki data:image bo'lishi kerak")
        payload["logo_url"] = logo
    for field, value in payload.items():
        setattr(merchant, field, value)
    await db.commit()
    await db.refresh(merchant)
    return merchant


# ── Tier konstruktor ─────────────────────────────────────────────────────────
DEFAULT_TIERS = [
    {"name": "Bronze", "min_points": 0, "color": "#CD7F32", "emoji": "🥉", "benefits": []},
    {"name": "Silver", "min_points": 1000, "color": "#C0C0C0", "emoji": "🥈", "benefits": []},
    {"name": "Gold", "min_points": 5000, "color": "#FFD700", "emoji": "🥇", "benefits": []},
    {"name": "Platinum", "min_points": 10000, "color": "#E5E4E2", "emoji": "💎", "benefits": []},
]


@router.get("/me/tiers", summary="Tier konstruktor — darajalarni olish")
async def get_tiers(merchant: Merchant = Depends(get_current_merchant)):
    tiers = getattr(merchant, "custom_tiers", None) or []
    if not tiers:
        tiers = DEFAULT_TIERS
    return {"tiers": tiers, "is_default": tiers is DEFAULT_TIERS}


@router.put("/me/tiers", summary="Tier darajalarini saqlash")
async def set_tiers(
    body: dict,
    merchant: Merchant = Depends(require_feature("tier")),
    db: AsyncSession = Depends(get_db),
):
    tiers = body.get("tiers") or []
    if not isinstance(tiers, list) or len(tiers) < 1:
        raise HTTPException(400, "Kamida 1 ta daraja kerak")
    if len(tiers) > 10:
        raise HTTPException(400, "Maksimal 10 ta daraja")

    # Validatsiya va tozalash
    cleaned = []
    for t in tiers:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name", "")).strip()[:40]
        if not name:
            raise HTTPException(400, "Har bir daraja uchun nom kerak")
        cleaned.append({
            "name": name,
            "min_points": max(0, int(t.get("min_points", 0) or 0)),
            "color": str(t.get("color", "#888"))[:10],
            "emoji": str(t.get("emoji", ""))[:8],
            "benefits": [str(b)[:100] for b in (t.get("benefits") or []) if b][:10],
        })
    # min_points bo'yicha tartib
    cleaned.sort(key=lambda x: x["min_points"])

    merchant.custom_tiers = cleaned
    await db.commit()
    await db.refresh(merchant)
    logger.success(f"Merchant #{merchant.id} tiers yangilandi ({len(cleaned)})")
    return {"tiers": cleaned}


# ── Karta dizayn konstruktor ─────────────────────────────────────────────────
DEFAULT_CARD_DESIGN = {
    "preset": "classic",                 # classic | emerald | sunset | minimal | custom
    "template": "aurora",                # aurora | minimal | carbon | wave (vizual uslub)
    "background_type": "gradient",       # solid | gradient | image
    "bg_color_1": "#0B2545",
    "bg_color_2": "#1E40AF",
    "text_color": "#FFFFFF",
    "accent_color": "#D4AF37",
    "corner_radius": 16,
    "show_logo": True,
    "show_holder_name": True,
    "show_holder_phone": False,
    "show_tier_badge": True,
    "show_points": True,
    "show_qr": True,
    "pattern": "none",                    # none | dots | waves | diagonal
    "logo_position": "top-left",          # top-left | top-right | center
    # Background image (saqlanadigan: data:image/... base64 yoki tashqi URL)
    "background_image": "",
    "image_fit": "cover",                 # cover | contain | fill
    "image_align": "center",              # top | center | bottom
    "image_opacity": 100,                 # 0 .. 100
    "image_overlay": 0,                   # 0 .. 100 (qora yopinchiq foizi, matnni ko'rsatish uchun)
}

# Qisqa string maydonlari (40 belgi cheklov)
_SHORT_STRING_FIELDS = {
    "preset", "template",
    "background_type", "bg_color_1", "bg_color_2", "text_color", "accent_color",
    "pattern", "logo_position", "image_fit", "image_align",
}
# Uzun string (data URI / URL) — ~3 MB cheklov
_LONG_STRING_FIELDS = {"background_image"}


@router.get("/me/card-design", summary="Karta dizayn sozlamalari")
async def get_card_design(merchant: Merchant = Depends(get_current_merchant)):
    design = getattr(merchant, "card_design", None) or {}
    merged = {**DEFAULT_CARD_DESIGN, **design}
    return merged


@router.put("/me/card-design", summary="Karta dizaynini saqlash")
async def set_card_design(
    body: dict,
    merchant: Merchant = Depends(require_feature("card_design_custom")),
    db: AsyncSession = Depends(get_db),
):
    # Faqat ruxsat etilgan maydonlarni olamiz
    allowed = set(DEFAULT_CARD_DESIGN.keys())
    cleaned = {}
    for k, v in (body or {}).items():
        if k not in allowed:
            continue
        if isinstance(v, str):
            if k in _LONG_STRING_FIELDS:
                # Data URI yoki URL — 3 MB chegara (rasm uchun)
                if len(v) > 3_500_000:
                    raise HTTPException(400, f"{k} juda katta (~3 MB chegara)")
                cleaned[k] = v
            elif k in _SHORT_STRING_FIELDS:
                cleaned[k] = v[:40]
            else:
                cleaned[k] = v[:40]
        elif isinstance(v, bool):
            cleaned[k] = v
        elif isinstance(v, (int, float)):
            cleaned[k] = v
    merged = {**DEFAULT_CARD_DESIGN, **cleaned}
    merchant.card_design = merged
    await db.commit()
    await db.refresh(merchant)
    logger.success(f"Merchant #{merchant.id} card_design yangilandi")
    return merged


# ── Public card design (mobil ilova uchun) ───────────────────────────────────
@router.get("/{merchant_id}/card-design", summary="Karta dizayn (public)",
            include_in_schema=False)
async def public_card_design(
    merchant_id: int,
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")
    return {**DEFAULT_CARD_DESIGN, **(m.card_design or {})}


@router.get("/stats", summary="Merchant KPI (cards / points / redemptions)")
async def merchant_stats(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    cards_count = (await db.execute(
        select(func.count(Card.id)).where(Card.merchant_id == merchant.id)
    )).scalar_one()

    active_cards = (await db.execute(
        select(func.count(Card.id))
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
    )).scalar_one()

    total_points_issued = (await db.execute(
        select(func.coalesce(func.sum(Transaction.points_delta), 0))
        .where(Transaction.merchant_id == merchant.id, Transaction.tx_type == "earn")
    )).scalar_one()

    total_points_redeemed = (await db.execute(
        select(func.coalesce(func.sum(Transaction.points_delta), 0))
        .where(Transaction.merchant_id == merchant.id, Transaction.tx_type == "redeem")
    )).scalar_one()

    rewards_count = (await db.execute(
        select(func.count(Reward.id))
        .where(Reward.merchant_id == merchant.id, Reward.is_active.is_(True))
    )).scalar_one()

    return {
        "cards_total": int(cards_count or 0),
        "cards_active": int(active_cards or 0),
        "points_issued": int(total_points_issued or 0),
        "points_redeemed": int(abs(total_points_redeemed or 0)),
        "active_rewards": int(rewards_count or 0),
    }


# ── Customer segments ────────────────────────────────────────────────────────
SegmentType = Literal["vip", "returning", "new", ""]


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@router.get("/customers", summary="Merchant mijozlari (segment bo'yicha filter)")
async def list_customers(
    segment: SegmentType = Query("", description="vip | returning | new | '' (barcha)"),
    search: str = Query("", description="Ism yoki telefon bo'yicha qidiruv"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """
    Segmentlar:
    - **new**      — karta chiqarilganiga 30 kundan kam
    - **returning** — so'nggi 90 kunda 2+ tranzaksiya
    - **vip**      — shu merchant kartalari orasida ball bo'yicha TOP 10%
    """
    now = _now_utc()
    d30 = now - timedelta(days=30)
    d90 = now - timedelta(days=90)

    # Per-card tx_count va last_tx_at (so'nggi 90 kun)
    tx90 = (
        select(
            Transaction.card_id.label("card_id"),
            func.count(Transaction.id).label("tx_count_90d"),
            func.max(Transaction.created_at).label("last_tx_at"),
        )
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= d90,
        )
        .group_by(Transaction.card_id)
        .subquery()
    )

    # VIP — ushbu merchant kartalari orasidagi TOP 10% (ball bo'yicha)
    vip_threshold: Optional[int] = None
    if segment == "vip":
        points_row = (await db.execute(
            select(Card.points)
            .where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
            .order_by(Card.points.desc())
        )).scalars().all()
        if points_row:
            top_idx = max(0, len(points_row) // 10 - 1)
            vip_threshold = int(points_row[top_idx] or 0)
            if vip_threshold < 1:
                vip_threshold = 1

    stmt = (
        select(
            Card.id.label("card_id"),
            Card.card_uid,
            Card.points,
            Card.tier,
            Card.issued_at,
            Card.last_used_at,
            Card.holder_name,
            Card.holder_phone,
            Card.user_id,
            User.name.label("user_name"),
            User.phone.label("user_phone"),
            func.coalesce(tx90.c.tx_count_90d, 0).label("tx_count_90d"),
            tx90.c.last_tx_at,
        )
        .select_from(Card)
        .join(tx90, tx90.c.card_id == Card.id, isouter=True)
        .join(User, User.id == Card.user_id, isouter=True)
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
    )

    if segment == "new":
        stmt = stmt.where(Card.issued_at >= d30)
    elif segment == "returning":
        stmt = stmt.where(func.coalesce(tx90.c.tx_count_90d, 0) >= 2)
    elif segment == "vip" and vip_threshold is not None:
        stmt = stmt.where(Card.points >= vip_threshold)

    if search:
        q = f"%{search}%"
        stmt = stmt.where(
            (Card.holder_name.ilike(q))
            | (Card.holder_phone.ilike(q))
            | (User.name.ilike(q))
            | (User.phone.ilike(q))
        )

    total = (await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )).scalar_one()

    rows = (await db.execute(
        stmt.order_by(Card.points.desc(), Card.issued_at.desc())
        .limit(limit).offset(offset)
    )).all()

    items = []
    for r in rows:
        is_new = r.issued_at is not None and r.issued_at >= d30
        is_returning = (r.tx_count_90d or 0) >= 2
        is_vip = vip_threshold is not None and r.points >= vip_threshold if vip_threshold else False

        tags = []
        if is_vip:
            tags.append("vip")
        if is_returning:
            tags.append("returning")
        if is_new:
            tags.append("new")

        items.append({
            "card_id": r.card_id,
            "card_uid": r.card_uid,
            "user_id": r.user_id,
            "name": r.user_name or r.holder_name or "",
            "phone": r.user_phone or r.holder_phone or "",
            "points": int(r.points or 0),
            "tier": r.tier,
            "tx_count_90d": int(r.tx_count_90d or 0),
            "issued_at": r.issued_at.isoformat() if r.issued_at else None,
            "last_tx_at": r.last_tx_at.isoformat() if r.last_tx_at else None,
            "tags": tags,
        })

    return {"total": int(total or 0), "items": items}


@router.get("/customers/segments/counts", summary="Har bir segmentdagi mijozlar soni")
async def segment_counts(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    now = _now_utc()
    d30 = now - timedelta(days=30)
    d90 = now - timedelta(days=90)

    total = (await db.execute(
        select(func.count(Card.id))
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
    )).scalar_one()

    new_count = (await db.execute(
        select(func.count(Card.id))
        .where(
            Card.merchant_id == merchant.id,
            Card.is_active.is_(True),
            Card.issued_at >= d30,
        )
    )).scalar_one()

    returning_sub = (
        select(Transaction.card_id)
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= d90,
        )
        .group_by(Transaction.card_id)
        .having(func.count(Transaction.id) >= 2)
        .subquery()
    )
    returning_count = (await db.execute(
        select(func.count()).select_from(returning_sub)
    )).scalar_one()

    points_row = (await db.execute(
        select(Card.points)
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
        .order_by(Card.points.desc())
    )).scalars().all()
    vip_count = max(1, len(points_row) // 10) if points_row else 0

    # Segment: active / sleeping / churned (last_used_at asosida)
    active_count = (await db.execute(
        select(func.count(Card.id))
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True),
               Card.last_used_at >= d30)
    )).scalar_one()

    sleeping_count = (await db.execute(
        select(func.count(Card.id))
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True),
               Card.last_used_at < d30,
               Card.last_used_at >= d90)
    )).scalar_one()

    churned_count = (await db.execute(
        select(func.count(Card.id))
        .where(Card.merchant_id == merchant.id, Card.is_active.is_(True),
               (Card.last_used_at < d90) | Card.last_used_at.is_(None))
    )).scalar_one()

    return {
        "total": int(total or 0),
        "new": int(new_count or 0),
        "returning": int(returning_count or 0),
        "vip": int(vip_count),
        "active": int(active_count or 0),
        "sleeping": int(sleeping_count or 0),
        "churned": int(churned_count or 0),
    }


# ── Analytics ────────────────────────────────────────────────────────────────
@router.get("/analytics/trend", summary="Kunlik tranzaksiyalar trend (oxirgi N kun)")
async def analytics_trend(
    days: int = Query(30, ge=7, le=90),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    now = _now_utc()
    since = now - timedelta(days=days)

    day_col = cast(Transaction.created_at, Date).label("day")
    rows = (await db.execute(
        select(
            day_col,
            func.sum(case((Transaction.tx_type == "earn", 1), else_=0)).label("earn_count"),
            func.sum(case((Transaction.tx_type == "redeem", 1), else_=0)).label("redeem_count"),
            func.coalesce(
                func.sum(case((Transaction.tx_type == "earn", Transaction.points_delta), else_=0)),
                0,
            ).label("points_earned"),
            func.coalesce(
                func.sum(case((Transaction.tx_type == "redeem", -Transaction.points_delta), else_=0)),
                0,
            ).label("points_redeemed"),
        )
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= since,
        )
        .group_by(day_col)
        .order_by(day_col)
    )).all()

    by_day = {str(r.day): r for r in rows}
    result = []
    cur = since.date()
    end = now.date()
    while cur <= end:
        key = str(cur)
        r = by_day.get(key)
        result.append({
            "date": key,
            "earn_count": int(r.earn_count or 0) if r else 0,
            "redeem_count": int(r.redeem_count or 0) if r else 0,
            "points_earned": int(r.points_earned or 0) if r else 0,
            "points_redeemed": int(r.points_redeemed or 0) if r else 0,
        })
        cur += timedelta(days=1)

    return {"days": days, "data": result}


@router.get("/analytics/peak-hours", summary="Soatma-soat yuklanish (0–23)")
async def analytics_peak_hours(
    days: int = Query(30, ge=7, le=90),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    since = _now_utc() - timedelta(days=days)
    hour_col = func.extract("hour", Transaction.created_at).label("hour")

    rows = (await db.execute(
        select(hour_col, func.count(Transaction.id).label("count"))
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.created_at >= since,
        )
        .group_by(hour_col)
    )).all()

    by_hour = {int(r.hour): int(r.count) for r in rows}
    buckets = [{"hour": h, "count": by_hour.get(h, 0)} for h in range(24)]
    return {"days": days, "data": buckets}


@router.get("/analytics/top-rewards", summary="Eng ko'p olingan rewardlar")
async def analytics_top_rewards(
    days: int = Query(30, ge=7, le=365),
    limit: int = Query(10, ge=1, le=50),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    since = _now_utc() - timedelta(days=days)

    rows = (await db.execute(
        select(
            Reward.id,
            Reward.title,
            Reward.points_cost,
            func.count(Transaction.id).label("redeem_count"),
            func.coalesce(func.sum(-Transaction.points_delta), 0).label("points_spent"),
        )
        .join(Transaction, Transaction.reward_id == Reward.id)
        .where(
            Reward.merchant_id == merchant.id,
            Transaction.tx_type == "redeem",
            Transaction.created_at >= since,
        )
        .group_by(Reward.id, Reward.title, Reward.points_cost)
        .order_by(desc("redeem_count"))
        .limit(limit)
    )).all()

    return {
        "days": days,
        "data": [
            {
                "reward_id": r.id,
                "title": r.title,
                "points_cost": int(r.points_cost or 0),
                "redeem_count": int(r.redeem_count or 0),
                "points_spent": int(r.points_spent or 0),
            }
            for r in rows
        ],
    }


# ── Campaigns (targetlangan push) ────────────────────────────────────────────
class CampaignPushRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=500)
    segment: SegmentType = Field("", description="vip | returning | new | '' (barcha)")
    data: Optional[dict] = None


@router.post("/campaigns/push", summary="Segmentga targetlangan push yuborish")
async def send_campaign_push(
    body: CampaignPushRequest,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    if not is_firebase_ready():
        raise HTTPException(503, "Firebase sozlanmagan — push yuborilmadi")

    now = _now_utc()
    d30 = now - timedelta(days=30)
    d90 = now - timedelta(days=90)

    user_ids_stmt = (
        select(func.distinct(Card.user_id))
        .where(
            Card.merchant_id == merchant.id,
            Card.is_active.is_(True),
            Card.user_id.isnot(None),
        )
    )

    if body.segment == "new":
        user_ids_stmt = user_ids_stmt.where(Card.issued_at >= d30)
    elif body.segment == "returning":
        tx_sub = (
            select(Transaction.card_id)
            .where(
                Transaction.merchant_id == merchant.id,
                Transaction.created_at >= d90,
            )
            .group_by(Transaction.card_id)
            .having(func.count(Transaction.id) >= 2)
            .subquery()
        )
        user_ids_stmt = user_ids_stmt.where(Card.id.in_(select(tx_sub.c.card_id)))
    elif body.segment == "vip":
        points_row = (await db.execute(
            select(Card.points)
            .where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
            .order_by(Card.points.desc())
        )).scalars().all()
        if not points_row:
            raise HTTPException(404, "VIP mijozlar topilmadi")
        top_idx = max(0, len(points_row) // 10 - 1)
        threshold = max(1, int(points_row[top_idx] or 0))
        user_ids_stmt = user_ids_stmt.where(Card.points >= threshold)

    user_ids = [r[0] for r in (await db.execute(user_ids_stmt)).all() if r[0]]
    if not user_ids:
        raise HTTPException(404, "Segmentda mijoz topilmadi")

    tokens = [r[0] for r in (await db.execute(
        select(FCMToken.token).where(FCMToken.user_id.in_(user_ids))
    )).all()]

    if not tokens:
        raise HTTPException(404, "Mijozlarning FCM tokenlari topilmadi")

    payload = dict(body.data or {})
    payload.setdefault("kind", "merchant_campaign")
    payload["merchant_id"] = merchant.id
    payload["segment"] = body.segment or "all"

    BATCH = 500
    sent_total, failed_total = 0, 0
    for i in range(0, len(tokens), BATCH):
        s, f = await send_fcm_multicast(
            tokens[i: i + BATCH],
            title=body.title,
            body=body.body,
            data=payload,
        )
        sent_total += s
        failed_total += f

    db.add(PushNotificationLog(
        title=body.title,
        body=body.body,
        target=f"merchant:{merchant.id}:{body.segment or 'all'}",
        sent_count=sent_total,
        failed_count=failed_total,
        sent_by=f"merchant#{merchant.id}",
    ))
    await db.commit()

    logger.info(
        f"Merchant campaign: merchant={merchant.id} segment={body.segment or 'all'} "
        f"users={len(user_ids)} tokens={len(tokens)} sent={sent_total} failed={failed_total}"
    )

    return {
        "segment": body.segment or "all",
        "targeted_users": len(user_ids),
        "total_tokens": len(tokens),
        "sent": sent_total,
        "failed": failed_total,
    }
