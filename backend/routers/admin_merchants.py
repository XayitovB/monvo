"""
routers/admin_merchants.py
──────────────────────────
Merchant management endpointlari (admin panel).

  GET    /admin/merchants
  POST   /admin/merchants
  PATCH  /admin/merchants/{id}
  GET    /admin/merchants/{id}/credentials
  PATCH  /admin/merchants/{id}/credentials
  POST   /admin/merchants/{id}/director
  PATCH  /admin/merchants/{id}/toggle
  GET    /admin/merchants/{id}/cards
  GET    /admin/merchants/{id}/transactions
  GET    /admin/merchants/{id}/customers
  GET    /admin/merchants/{id}/full
  POST   /admin/merchants/{id}/branches
  PATCH  /admin/merchants/{id}/branches/{branch_id}
  DELETE /admin/merchants/{id}/branches/{branch_id}
  POST   /admin/merchants/{id}/staff
  PATCH  /admin/merchants/{id}/staff/{staff_id}
  DELETE /admin/merchants/{id}/staff/{staff_id}
  DELETE /admin/merchants/{id}
  GET    /admin/merchants/export
"""
import csv
import io
import secrets
import string
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlalchemy import select, text as _text
from sqlalchemy.ext.asyncio import AsyncSession

from core.admin_audit import log_admin_action
from core.dependencies import get_current_admin
from core.security import hash_password
from core.subscription import days_remaining, resolve_sub_status
from database import get_db
from models import Card, Merchant, MerchantBranch, MerchantSubscription, Reward, Transaction, User

merchants_router = APIRouter(tags=["🔧 Admin"])

MERCHANT_TYPES = (
    "restaurant", "cafe", "coffee", "fastfood", "bakery", "retail", "grocery",
    "clothing", "beauty", "barbershop", "fitness", "pharmacy", "medical",
    "electronics", "service", "auto", "gas_station", "hotel",
    "entertainment", "education", "flowers", "jewelry", "other",
)


class _AdminMerchantCreate(BaseModel):
    business_name: str
    business_type: str | None = None
    login: str | None = None
    password: str | None = None
    tariff_id: int | None = None
    tariff_days: int | None = None


class _AssignDirectorBody(BaseModel):
    phone: str | None = None
    user_id: int | None = None
    name: str | None = None


class _AdminMerchantUpdate(BaseModel):
    business_name: str | None = None
    business_type: str | None = None
    phone: str | None = None
    description: str | None = None
    brand_color: str | None = None
    logo_url: str | None = None


class _AdminMerchantCredentials(BaseModel):
    login: str | None = None
    password: str | None = None


class _AdminBranchIn(BaseModel):
    name: str
    address: str = ""
    phone: str = ""
    working_hours: str = ""
    is_active: bool = True
    lat: float | None = None
    lng: float | None = None


class _AdminStaffIn(BaseModel):
    username: str
    password: str
    full_name: str = ""
    phone: str = ""
    role: str = "cashier"
    branch_id: int | None = None
    is_active: bool = True


class _AdminBranchPatch(BaseModel):
    name: str | None = None
    address: str | None = None
    phone: str | None = None
    working_hours: str | None = None
    is_active: bool | None = None
    lat: float | None = None
    lng: float | None = None


class _AdminStaffPatch(BaseModel):
    username: str | None = None
    password: str | None = None
    full_name: str | None = None
    phone: str | None = None
    role: str | None = None
    branch_id: int | None = None
    is_active: bool | None = None


def _rand_password(n: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


@merchants_router.get("/merchants", summary="Biznes ro'yxati")
async def admin_get_merchants(
    limit: int = Query(100, le=500),
    offset: int = 0,
    search: str = "",
    business_type: str = "",
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    base_q = select(Merchant)
    if search.strip():
        like = f"%{search.strip()}%"
        base_q = base_q.where(
            (Merchant.business_name.ilike(like)) | (Merchant.phone.ilike(like))
        )
    if business_type.strip() and business_type in MERCHANT_TYPES:
        base_q = base_q.where(Merchant.business_type == business_type)

    total = (await db.execute(select(sa_func.count()).select_from(base_q.subquery()))).scalar_one()
    result = await db.execute(base_q.order_by(Merchant.id.desc()).limit(limit).offset(offset))
    merchants = result.scalars().all()

    def _public_login(email: str | None) -> str | None:
        if not email or email.endswith("@monvo.internal"):
            return None
        return email

    director_phones: dict[int, tuple[str | None, str | None]] = {}
    if merchants:
        merchant_ids = [m.id for m in merchants]
        dir_rows = await db.execute(
            select(User.merchant_account_id, User.phone, User.name)
            .where(User.merchant_account_id.in_(merchant_ids))
        )
        for mid, ph, nm in dir_rows.all():
            if mid not in director_phones:
                director_phones[mid] = (ph, nm)

    # Obuna ma'lumotlarini batch qilb olish
    sub_map: dict[int, MerchantSubscription] = {}
    if merchants:
        merchant_ids = [m.id for m in merchants]
        sub_rows = await db.execute(
            select(MerchantSubscription)
            .where(MerchantSubscription.merchant_id.in_(merchant_ids))
        )
        for sub in sub_rows.scalars().all():
            sub_map[sub.merchant_id] = sub

    data = []
    for m in merchants:
        d_phone, d_name = director_phones.get(m.id, (None, None))
        sub = sub_map.get(m.id)

        # Obuna holati — yagona manba: MerchantSubscription, fallback tariff_expires_at
        sub_status, sub_expires = resolve_sub_status(
            m.is_active, sub, getattr(m, "tariff_expires_at", None))

        data.append({
            "id": m.id,
            "business_name": m.business_name,
            "business_type": getattr(m, "business_type", "other"),
            "phone": m.phone or d_phone,
            "director_phone": d_phone,
            "director_name": d_name,
            "login": _public_login(m.email),
            "is_active": m.is_active,
            "sub_status": sub_status,
            "sub_expires_at": sub_expires.isoformat() if sub_expires else None,
            "sub_days_remaining": days_remaining(sub_expires),
            "created_at": m.created_at.isoformat() if m.created_at else None,
        })
    return JSONResponse(
        content=data,
        headers={"X-Total-Count": str(total)},
    )


@merchants_router.get("/merchants/export", summary="Merchants CSV export")
async def export_merchants(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Merchant).order_by(Merchant.id))).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "business_name", "business_type", "phone", "is_active", "created_at"])
    for m in rows:
        w.writerow([
            m.id, m.business_name, getattr(m, "business_type", "other"),
            m.phone, m.is_active,
            m.created_at.isoformat() if m.created_at else "",
        ])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=merchants.csv"})


@merchants_router.post("/merchants", summary="Admin tomonidan yangi biznes yaratish", status_code=201)
async def admin_create_merchant(
    body: _AdminMerchantCreate,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    name = body.business_name.strip()
    if len(name) < 2:
        raise HTTPException(400, "Biznes nomi juda qisqa")

    btype = (body.business_type or "other").strip().lower()
    if btype not in MERCHANT_TYPES:
        btype = "other"

    raw_login = (body.login or "").strip().lower()
    raw_password = (body.password or "").strip()
    has_credentials = bool(raw_login or raw_password)

    if has_credentials:
        if len(raw_login) < 3:
            raise HTTPException(400, "Login kamida 3 belgi bo'lishi kerak")
        if " " in raw_login:
            raise HTTPException(400, "Loginda bo'sh joy bo'lmasligi kerak")
        if len(raw_password) < 6:
            raise HTTPException(400, "Parol kamida 6 belgi bo'lishi kerak")

        existing = (await db.execute(
            select(Merchant).where(Merchant.email == raw_login)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(409, "Bu login allaqachon band")

        login_value = raw_login
        password_for_hash = raw_password
    else:
        login_value = f"biz_{int(time.time() * 1000)}_{secrets.token_hex(3)}@monvo.internal"
        password_for_hash = _rand_password()

    try:
        password_hash = hash_password(password_for_hash)
    except Exception as e:
        logger.error(f"hash_password failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Password hash xatosi: {e}")

    try:
        from core.security import verify_password as _vp
        if not _vp(password_for_hash, password_hash):
            raise HTTPException(500, "Parol hashi yaroqsiz (verify failed)")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"hash verify failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Parol verify xatosi: {e}")

    chosen_tariff_id = body.tariff_id
    tariff_started_at = None
    tariff_expires_at = None
    if chosen_tariff_id is not None:
        from models import Tariff
        tariff_row = (await db.execute(
            select(Tariff).where(Tariff.id == chosen_tariff_id, Tariff.is_active.is_(True))
        )).scalar_one_or_none()
        if tariff_row is None:
            raise HTTPException(400, "Tarif topilmadi yoki aktiv emas")
        tariff_started_at = datetime.now(timezone.utc)
        if body.tariff_days and body.tariff_days > 0:
            tariff_expires_at = tariff_started_at + timedelta(days=int(body.tariff_days))

    try:
        merchant = Merchant(
            business_name=name,
            business_type=btype,
            email=login_value,
            password_hash=password_hash,
            is_active=True,
            tariff_id=chosen_tariff_id,
            tariff_started_at=tariff_started_at,
            tariff_expires_at=tariff_expires_at,
        )
        db.add(merchant)
        await db.flush()
        if chosen_tariff_id and tariff_expires_at:
            db.add(MerchantSubscription(
                merchant_id=merchant.id,
                tariff_id=chosen_tariff_id,
                status="active",
                started_at=tariff_started_at,
                expires_at=tariff_expires_at,
            ))
        await db.commit()
        await db.refresh(merchant)
    except Exception as e:
        await db.rollback()
        logger.error(f"merchant create failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"DB xato: {type(e).__name__}: {str(e)[:200]}")

    logger.success(f"Admin yangi merchant yaratdi: id={merchant.id} name={merchant.business_name} type={btype} login_set={has_credentials}")

    return {
        "id": merchant.id,
        "business_name": merchant.business_name,
        "business_type": merchant.business_type,
        "phone": merchant.phone,
        "is_active": merchant.is_active,
        "created_at": merchant.created_at.isoformat() if merchant.created_at else None,
        "login": login_value if has_credentials else None,
        "director": None,
    }


@merchants_router.patch("/merchants/{merchant_id}", summary="Admin: merchant ma'lumotlarini tahrirlash")
async def admin_update_merchant(
    merchant_id: int,
    body: _AdminMerchantUpdate,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")

    if body.business_name is not None:
        n = body.business_name.strip()
        if len(n) < 2:
            raise HTTPException(400, "Biznes nomi juda qisqa")
        m.business_name = n
    if body.business_type is not None:
        bt = body.business_type.strip().lower()
        if bt and bt not in MERCHANT_TYPES:
            bt = "other"
        m.business_type = bt
    if body.phone is not None:
        m.phone = body.phone.strip()
    if body.description is not None:
        m.description = body.description
    if body.brand_color is not None:
        m.brand_color = body.brand_color.strip()
    if body.logo_url is not None:
        logo = body.logo_url.strip()
        if logo and not (
            logo.startswith("http://") or logo.startswith("https://")
            or logo.startswith("data:image/")
        ):
            raise HTTPException(400, "logo_url URL yoki data:image bo'lishi kerak")
        m.logo_url = logo

    try:
        await db.commit()
        await db.refresh(m)
    except Exception as e:
        await db.rollback()
        logger.error(f"merchant update failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Yangilash xatosi: {type(e).__name__}: {str(e)[:200]}")

    log_admin_action(admin, f"update_merchant merchant_id={merchant_id}")
    return {
        "id": m.id,
        "business_name": m.business_name,
        "business_type": m.business_type,
        "phone": m.phone,
        "description": m.description,
        "brand_color": m.brand_color,
        "logo_url": m.logo_url,
    }


@merchants_router.get("/merchants/{merchant_id}/credentials", summary="Admin: merchant login (parol ko'rinmaydi)")
async def admin_get_merchant_credentials(
    merchant_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")

    is_placeholder = bool(m.email and m.email.endswith("@monvo.internal"))
    return {
        "merchant_id": m.id,
        "login": None if is_placeholder else m.email,
        "has_real_login": not is_placeholder,
    }


@merchants_router.patch("/merchants/{merchant_id}/credentials", summary="Admin: merchant login/parolni o'zgartirish")
async def admin_set_merchant_credentials(
    merchant_id: int,
    body: _AdminMerchantCredentials,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")

    new_login = (body.login or "").strip().lower() or None
    new_password = (body.password or "").strip() or None

    if not new_login and not new_password:
        raise HTTPException(400, "Login yoki parol kiriting")

    if new_login is not None:
        if len(new_login) < 3:
            raise HTTPException(400, "Login kamida 3 belgi bo'lishi kerak")
        if " " in new_login:
            raise HTTPException(400, "Loginda bo'sh joy bo'lmasligi kerak")
        if new_login != m.email:
            existing = (await db.execute(
                select(Merchant).where(Merchant.email == new_login, Merchant.id != merchant_id)
            )).scalar_one_or_none()
            if existing:
                raise HTTPException(409, "Bu login allaqachon band")
            m.email = new_login

    if new_password is not None:
        if len(new_password) < 6:
            raise HTTPException(400, "Parol kamida 6 belgi bo'lishi kerak")
        try:
            m.password_hash = hash_password(new_password)
        except Exception as e:
            logger.error(f"hash_password failed: {type(e).__name__}: {e}")
            raise HTTPException(500, f"Parol hash xatosi: {e}")

    try:
        await db.commit()
        await db.refresh(m)
    except Exception as e:
        await db.rollback()
        logger.error(f"merchant credentials update failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"DB xato: {type(e).__name__}: {str(e)[:200]}")

    log_admin_action(admin, f"set_merchant_credentials merchant_id={merchant_id} login_changed={new_login is not None} password_changed={new_password is not None}")

    return {
        "merchant_id": m.id,
        "login": m.email if not (m.email or "").endswith("@monvo.internal") else None,
        "login_changed": new_login is not None,
        "password_changed": new_password is not None,
    }


@merchants_router.post("/merchants/{merchant_id}/director", summary="Merchant direktorini belgilash")
async def admin_assign_director(
    merchant_id: int,
    body: _AssignDirectorBody,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")

    user: User | None = None

    if body.user_id is not None:
        user = (await db.execute(select(User).where(User.id == body.user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(404, "Foydalanuvchi topilmadi")
    else:
        phone = (body.phone or "").strip()
        if not phone:
            raise HTTPException(400, "Telefon raqami yoki user_id kerak")
        user = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
        if not user:
            user = User(
                name=(body.name or f"{m.business_name} direktor").strip()[:100],
                phone=phone,
                password_hash="",
                auth_provider="phone",
                role="merchant",
                merchant_account_id=m.id,
            )
            db.add(user)
            await db.flush()

    user.role = "merchant"
    user.merchant_account_id = m.id
    await db.commit()
    await db.refresh(user)

    logger.success(f"Admin direktor belgiladi: merchant={m.id} user={user.id} phone={user.phone}")

    return {
        "merchant_id": m.id,
        "director": {
            "id": user.id,
            "name": user.name,
            "phone": user.phone,
            "role": user.role,
            "is_active": user.is_active,
        },
    }


@merchants_router.patch("/merchants/{merchant_id}/toggle", summary="Merchant holatini o'zgartirish")
async def admin_toggle_merchant(
    merchant_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")
    m.is_active = not m.is_active
    await db.commit()
    log_admin_action(admin, f"toggle_merchant merchant_id={m.id} is_active={m.is_active}")
    return {"is_active": m.is_active}


@merchants_router.get("/merchants/{merchant_id}/cards", summary="Merchant kartalari")
async def admin_merchant_cards(
    merchant_id: int,
    limit: int = Query(200, le=1000),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Card, User)
        .outerjoin(User, User.id == Card.user_id)
        .where(Card.merchant_id == merchant_id)
        .order_by(Card.issued_at.desc().nullslast())
        .limit(limit)
    )).all()
    return [
        {
            "id": c.id,
            "card_uid": c.card_uid,
            "points": c.points,
            "tier": c.tier,
            "is_active": c.is_active,
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
            "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
            "holder_name": c.holder_name,
            "holder_phone": c.holder_phone,
            "user": None if u is None else {
                "id": u.id,
                "name": u.name,
                "phone": getattr(u, "phone", None),
            },
        }
        for c, u in rows
    ]


@merchants_router.get("/merchants/{merchant_id}/transactions", summary="Merchant tranzaksiyalari")
async def admin_merchant_transactions(
    merchant_id: int,
    limit: int = Query(200, le=1000),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Transaction, Card, User, Reward, MerchantBranch)
        .join(Card, Card.id == Transaction.card_id)
        .outerjoin(User, User.id == Card.user_id)
        .outerjoin(Reward, Reward.id == Transaction.reward_id)
        .outerjoin(MerchantBranch, MerchantBranch.id == Transaction.branch_id)
        .where(Transaction.merchant_id == merchant_id)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
    )).all()
    return [
        {
            "id": tx.id,
            "tx_type": tx.tx_type,
            "points_delta": tx.points_delta,
            "amount": float(tx.amount or 0),
            "note": tx.note or "",
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
            "card_uid": c.card_uid,
            "reward_title": r.title if r else None,
            "user_name": (u.name if u else None) or c.holder_name or "—",
            "user": None if u is None else {
                "id": u.id, "name": u.name, "phone": getattr(u, "phone", None),
            },
            "branch_name": b.name if b else None,
            "branch_id": tx.branch_id,
        }
        for tx, c, u, r, b in rows
    ]


@merchants_router.get("/merchants/{merchant_id}/customers", summary="Merchant mijozlari")
async def admin_merchant_customers(
    merchant_id: int,
    limit: int = Query(500, le=2000),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(
            User.id, User.name, User.phone, User.is_active, User.created_at,
            sa_func.count(Card.id).label("card_count"),
            sa_func.coalesce(sa_func.sum(Card.points), 0).label("total_points"),
            sa_func.max(Card.last_used_at).label("last_seen"),
        )
        .join(Card, Card.user_id == User.id)
        .where(Card.merchant_id == merchant_id)
        .group_by(User.id, User.name, User.phone, User.is_active, User.created_at)
        .order_by(sa_func.max(Card.last_used_at).desc().nullslast())
        .limit(limit)
    )).all()
    return [
        {
            "id": r[0],
            "name": r[1],
            "phone": r[2],
            "is_active": r[3],
            "joined_at": r[4].isoformat() if r[4] else None,
            "card_count": int(r[5] or 0),
            "total_points": int(r[6] or 0),
            "last_seen": r[7].isoformat() if r[7] else None,
        }
        for r in rows
    ]


@merchants_router.get("/merchants/{merchant_id}/full", summary="Merchant batafsil ma'lumoti")
async def admin_merchant_full(
    merchant_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import MerchantBranch, MerchantStaff

    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")

    director = None
    director_user = (await db.execute(
        select(User).where(User.merchant_account_id == merchant_id, User.role == "merchant")
    )).scalar_one_or_none()
    if director_user:
        director = {
            "id": director_user.id,
            "name": director_user.name,
            "phone": director_user.phone,
            "email": getattr(director_user, "email", None),
            "is_active": director_user.is_active,
            "last_login_at": (
                director_user.last_login_at.isoformat()
                if getattr(director_user, "last_login_at", None) else None
            ),
        }

    cards_count = (await db.execute(
        select(sa_func.count()).select_from(Card).where(Card.merchant_id == merchant_id)
    )).scalar_one() or 0
    tx_count = (await db.execute(
        select(sa_func.count()).select_from(Transaction).where(Transaction.merchant_id == merchant_id)
    )).scalar_one() or 0
    customers_count = (await db.execute(
        select(sa_func.count(sa_func.distinct(Card.user_id))).where(Card.merchant_id == merchant_id)
    )).scalar_one() or 0
    rewards_count = (await db.execute(
        select(sa_func.count()).select_from(Reward).where(Reward.merchant_id == merchant_id)
    )).scalar_one() or 0
    total_points = (await db.execute(
        select(sa_func.coalesce(sa_func.sum(Card.points), 0)).where(Card.merchant_id == merchant_id)
    )).scalar_one() or 0
    last_tx_at = (await db.execute(
        select(sa_func.max(Transaction.created_at)).where(Transaction.merchant_id == merchant_id)
    )).scalar_one()

    branches_rows = (await db.execute(
        select(MerchantBranch).where(MerchantBranch.merchant_id == merchant_id)
        .order_by(MerchantBranch.created_at.desc())
    )).scalars().all()
    branches = [{
        "id": b.id,
        "name": b.name,
        "address": b.address,
        "phone": b.phone,
        "working_hours": b.working_hours,
        "is_active": b.is_active,
        "lat": float(b.lat) if b.lat is not None else None,
        "lng": float(b.lng) if b.lng is not None else None,
    } for b in branches_rows]

    staff_rows = (await db.execute(
        select(MerchantStaff).where(MerchantStaff.merchant_id == merchant_id)
        .order_by(MerchantStaff.created_at.desc())
    )).scalars().all()
    staff = [{
        "id": s.id,
        "username": s.username,
        "full_name": s.full_name,
        "phone": s.phone,
        "role": s.role,
        "is_active": s.is_active,
        "branch_id": s.branch_id,
        "last_login_at": s.last_login_at.isoformat() if s.last_login_at else None,
    } for s in staff_rows]

    last_staff_login = max(
        (s.last_login_at for s in staff_rows if s.last_login_at),
        default=None,
    )
    last_activity = max(
        filter(None, [last_tx_at, last_staff_login,
                      director_user.last_login_at if director_user and getattr(director_user, "last_login_at", None) else None]),
        default=None,
    )

    tariff_info = None
    tariff_id = getattr(m, "tariff_id", None)
    if tariff_id:
        from models import Tariff
        t = (await db.execute(select(Tariff).where(Tariff.id == tariff_id))).scalar_one_or_none()
        if t:
            from datetime import datetime as _dt, timezone as _tz
            expires_at = getattr(m, "tariff_expires_at", None)
            started_at = getattr(m, "tariff_started_at", None)
            days_remaining = None
            expired = False
            if expires_at:
                delta = expires_at - _dt.now(_tz.utc)
                days_remaining = max(0, delta.days)
                expired = delta.total_seconds() <= 0
            tariff_info = {
                "id": t.id,
                "name": t.name,
                "title_uz": t.title_uz,
                "title_ru": t.title_ru,
                "monthly_price": t.monthly_price,
                "started_at": started_at.isoformat() if started_at else None,
                "expires_at": expires_at.isoformat() if expires_at else None,
                "days_remaining": days_remaining,
                "expired": expired,
            }

    return {
        "id": m.id,
        "business_name": m.business_name,
        "business_type": m.business_type,
        "email": m.email,
        "phone": m.phone,
        "description": m.description,
        "logo_url": m.logo_url,
        "brand_color": m.brand_color,
        "is_active": m.is_active,
        "loyalty_type": m.loyalty_type,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "director": director,
        "tariff": tariff_info,
        "stats": {
            "cards": cards_count,
            "transactions": tx_count,
            "customers": customers_count,
            "rewards": rewards_count,
            "total_points": int(total_points),
        },
        "last_activity_at": last_activity.isoformat() if last_activity else None,
        "last_transaction_at": last_tx_at.isoformat() if last_tx_at else None,
        "branches": branches,
        "staff": staff,
    }


@merchants_router.post("/merchants/{merchant_id}/branches", status_code=201, summary="Admin: filial qo'shish")
async def admin_create_branch(
    merchant_id: int,
    body: _AdminBranchIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import MerchantBranch
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")
    if len(body.name.strip()) < 1:
        raise HTTPException(400, "Filial nomi kiritilishi shart")
    try:
        b = MerchantBranch(
            merchant_id=merchant_id,
            name=body.name.strip(),
            address=body.address,
            phone=body.phone,
            working_hours=body.working_hours,
            is_active=body.is_active,
            lat=body.lat,
            lng=body.lng,
        )
        db.add(b)
        await db.commit()
        await db.refresh(b)
    except Exception as e:
        await db.rollback()
        logger.error(f"branch create failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Filial yaratish xatosi: {type(e).__name__}: {str(e)[:200]}")
    log_admin_action(admin, f"create_branch merchant_id={merchant_id} branch_id={b.id} name={b.name}")
    return {"id": b.id, "name": b.name}


@merchants_router.delete("/merchants/{merchant_id}/branches/{branch_id}", summary="Admin: filialni o'chirish")
async def admin_delete_branch(
    merchant_id: int,
    branch_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import MerchantBranch
    b = (await db.execute(
        select(MerchantBranch).where(
            MerchantBranch.id == branch_id, MerchantBranch.merchant_id == merchant_id
        )
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Filial topilmadi")
    try:
        await db.delete(b)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"branch delete failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Filial o'chirish xatosi: {type(e).__name__}: {str(e)[:200]}")
    log_admin_action(admin, f"delete_branch merchant_id={merchant_id} branch_id={branch_id}")
    return {"message": "Filial o'chirildi"}


@merchants_router.patch("/merchants/{merchant_id}/branches/{branch_id}", summary="Admin: filialni tahrirlash")
async def admin_update_branch(
    merchant_id: int,
    branch_id: int,
    body: _AdminBranchPatch,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import MerchantBranch
    b = (await db.execute(
        select(MerchantBranch).where(
            MerchantBranch.id == branch_id, MerchantBranch.merchant_id == merchant_id
        )
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Filial topilmadi")

    fields = body.model_fields_set
    if "name" in fields:
        if not (body.name or "").strip():
            raise HTTPException(400, "Filial nomi bo'sh bo'lmasin")
        b.name = body.name.strip()
    if "address" in fields:
        b.address = body.address or ""
    if "phone" in fields:
        b.phone = body.phone or ""
    if "working_hours" in fields:
        b.working_hours = body.working_hours or ""
    if "is_active" in fields and body.is_active is not None:
        b.is_active = body.is_active
    if "lat" in fields:
        b.lat = body.lat
    if "lng" in fields:
        b.lng = body.lng

    try:
        await db.commit()
        await db.refresh(b)
    except Exception as e:
        await db.rollback()
        logger.error(f"branch update failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Filial tahrirlash xatosi: {type(e).__name__}: {str(e)[:200]}")
    log_admin_action(admin, f"update_branch merchant_id={merchant_id} branch_id={branch_id}")
    return {"id": b.id, "name": b.name}


@merchants_router.post("/merchants/{merchant_id}/staff", status_code=201, summary="Admin: xodim qo'shish")
async def admin_create_staff(
    merchant_id: int,
    body: _AdminStaffIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import MerchantStaff
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")
    if len(body.username.strip()) < 3:
        raise HTTPException(400, "Username kamida 3 belgidan iborat bo'lishi kerak")
    if len(body.password) < 6:
        raise HTTPException(400, "Parol kamida 6 belgidan iborat bo'lishi kerak")
    if body.role not in ("cashier", "manager", "admin"):
        raise HTTPException(400, "Role: cashier | manager | admin")

    existing = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.merchant_id == merchant_id,
            MerchantStaff.username == body.username.strip(),
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(400, f"'{body.username}' username band")

    try:
        s = MerchantStaff(
            merchant_id=merchant_id,
            username=body.username.strip(),
            password_hash=hash_password(body.password),
            full_name=body.full_name,
            phone=body.phone,
            role=body.role,
            branch_id=body.branch_id,
            is_active=body.is_active,
        )
        db.add(s)
        await db.commit()
        await db.refresh(s)
    except Exception as e:
        await db.rollback()
        logger.error(f"staff create failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Xodim yaratish xatosi: {type(e).__name__}: {str(e)[:200]}")
    log_admin_action(admin, f"create_staff merchant_id={merchant_id} staff_id={s.id} username={s.username}")
    return {"id": s.id, "username": s.username}


@merchants_router.delete("/merchants/{merchant_id}/staff/{staff_id}", summary="Admin: xodimni o'chirish")
async def admin_delete_staff(
    merchant_id: int,
    staff_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import MerchantStaff
    s = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.id == staff_id, MerchantStaff.merchant_id == merchant_id
        )
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Xodim topilmadi")
    try:
        await db.delete(s)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"staff delete failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Xodim o'chirish xatosi: {type(e).__name__}: {str(e)[:200]}")
    log_admin_action(admin, f"delete_staff merchant_id={merchant_id} staff_id={staff_id}")
    return {"message": "Xodim o'chirildi"}


@merchants_router.patch("/merchants/{merchant_id}/staff/{staff_id}", summary="Admin: xodimni tahrirlash")
async def admin_update_staff(
    merchant_id: int,
    staff_id: int,
    body: _AdminStaffPatch,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import MerchantStaff
    s = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.id == staff_id, MerchantStaff.merchant_id == merchant_id
        )
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Xodim topilmadi")

    fields = body.model_fields_set
    if "username" in fields:
        u = (body.username or "").strip()
        if len(u) < 3:
            raise HTTPException(400, "Username kamida 3 belgidan iborat bo'lishi kerak")
        existing = (await db.execute(
            select(MerchantStaff).where(
                MerchantStaff.merchant_id == merchant_id,
                MerchantStaff.username == u,
                MerchantStaff.id != staff_id,
            )
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(400, f"'{u}' username band")
        s.username = u
    if "password" in fields and body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Parol kamida 6 belgidan iborat bo'lishi kerak")
        s.password_hash = hash_password(body.password)
    if "full_name" in fields:
        s.full_name = body.full_name or ""
    if "phone" in fields:
        s.phone = body.phone or ""
    if "role" in fields and body.role is not None:
        if body.role not in ("cashier", "manager", "admin"):
            raise HTTPException(400, "Role: cashier | manager | admin")
        s.role = body.role
    if "branch_id" in fields:
        s.branch_id = body.branch_id
    if "is_active" in fields and body.is_active is not None:
        s.is_active = body.is_active

    try:
        await db.commit()
        await db.refresh(s)
    except Exception as e:
        await db.rollback()
        logger.error(f"staff update failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Xodim tahrirlash xatosi: {type(e).__name__}: {str(e)[:200]}")
    log_admin_action(admin, f"update_staff merchant_id={merchant_id} staff_id={staff_id}")
    return {"id": s.id, "username": s.username}


@merchants_router.delete("/merchants/{merchant_id}", summary="Merchant o'chirish")
async def admin_delete_merchant(
    merchant_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(select(Merchant).where(Merchant.id == merchant_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Merchant topilmadi")
    log_admin_action(admin, f"delete_merchant merchant_id={m.id} business_name={m.business_name}")

    async def _safe_delete(table: str) -> None:
        try:
            async with db.begin_nested():
                await db.execute(
                    _text(f"DELETE FROM {table} WHERE merchant_id = :mid"),
                    {"mid": merchant_id},
                )
        except Exception as ex:
            logger.warning(f"skip delete from {table}: {type(ex).__name__}: {ex}")

    for table in (
        "transactions", "rewards", "cards", "point_rules",
        "merchant_branches", "merchant_staff",
        "loyalty_rules", "achievements", "contests", "spin_prizes",
        "games", "merchant_segments", "campaigns", "card_designs",
    ):
        await _safe_delete(table)

    try:
        await db.delete(m)
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"merchant delete failed: {type(e).__name__}: {e}")
        raise HTTPException(500, f"O'chirish xatosi: {type(e).__name__}: {str(e)[:200]}")
    return {"message": "Merchant o'chirildi"}
