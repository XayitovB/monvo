"""
routers/merchant_manage.py
──────────────────────────
Merchant uchun operatsion boshqaruv:
  Filiallar (branches), Kassirlar (staff),
  Notification template va broadcast.

Endpoints:
  BRANCHES:  CRUD /merchants/me/branches
  STAFF:     CRUD /merchants/me/staff  + /merchants/me/staff/login
  NOTIFS:    /merchants/me/notifications/templates, /broadcast
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_merchant
from core.tariff_gate import enforce_limit
from core.fcm import send_fcm_multicast
from core.sms import send_bulk_sms
from core.security import create_merchant_token, hash_password, verify_password
from core.sms import send_otp_sms
from core.geocode import geocode_address
from database import get_db
from core.dependencies import get_current_admin
from models import (
    Card,
    FCMToken,
    Merchant,
    MerchantBranch,
    MerchantInboxMessage,
    MerchantNotificationLog,
    MerchantNotificationTemplate,
    MerchantStaff,
    PhoneOTP,
    Transaction,
    User,
    UserNotification,
)

router = APIRouter(tags=["🏪 Merchant Manage"])


# ═══ BRANCHES ════════════════════════════════════════════════════════════════
class _BranchIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    address: str = ""
    phone: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    working_hours: str = ""
    is_active: bool = True
    # Up to ~10 photos as data:image/... URLs or http URLs.
    photos: Optional[list[str]] = None


@router.get("/merchants/me/branches", summary="Filiallar ro'yxati")
async def list_branches(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MerchantBranch)
        .where(MerchantBranch.merchant_id == merchant.id)
        .order_by(MerchantBranch.id.desc())
    )).scalars().all()
    if not rows:
        return []

    # ── Aggregate KPIs in 4 group-by queries instead of 4 × N ──
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0)
    branch_ids = [b.id for b in rows]

    tx_total_q = await db.execute(
        select(Transaction.branch_id, sa_func.count(Transaction.id))
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.branch_id.in_(branch_ids),
        )
        .group_by(Transaction.branch_id)
    )
    tx_total: dict[int, int] = {row[0]: int(row[1]) for row in tx_total_q.all()}

    tx_today_q = await db.execute(
        select(Transaction.branch_id, sa_func.count(Transaction.id))
        .where(
            Transaction.merchant_id == merchant.id,
            Transaction.branch_id.in_(branch_ids),
            Transaction.created_at >= today_start,
        )
        .group_by(Transaction.branch_id)
    )
    tx_today: dict[int, int] = {row[0]: int(row[1]) for row in tx_today_q.all()}

    cards_q = await db.execute(
        select(Card.branch_id, sa_func.count(Card.id))
        .where(
            Card.merchant_id == merchant.id,
            Card.branch_id.in_(branch_ids),
        )
        .group_by(Card.branch_id)
    )
    cards_by_branch: dict[int, int] = {row[0]: int(row[1]) for row in cards_q.all()}

    staff_q = await db.execute(
        select(MerchantStaff.branch_id, sa_func.count(MerchantStaff.id))
        .where(
            MerchantStaff.merchant_id == merchant.id,
            MerchantStaff.branch_id.in_(branch_ids),
        )
        .group_by(MerchantStaff.branch_id)
    )
    staff_by_branch: dict[int, int] = {row[0]: int(row[1]) for row in staff_q.all()}

    return [
        {
            "id": b.id,
            "name": b.name,
            "address": b.address,
            "phone": b.phone,
            "lat": float(b.lat) if b.lat else None,
            "lng": float(b.lng) if b.lng else None,
            "working_hours": b.working_hours,
            # Photos can be MBs of inline base64 — only return the count
            # in the list view; the detail screen calls a future
            # /branches/{id} endpoint when it needs the actual photos.
            "photos_count": len(b.photos or []),
            "photos": list(b.photos or []),
            "is_active": b.is_active,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "transactions_today": tx_today.get(b.id, 0),
            "staff_count": staff_by_branch.get(b.id, 0),
            "stats": {
                "transactions": tx_total.get(b.id, 0),
                "cards": cards_by_branch.get(b.id, 0),
            },
        }
        for b in rows
    ]


@router.post("/merchants/me/branches", status_code=201, summary="Filial qo'shish")
async def create_branch(
    body: _BranchIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    count = (await db.execute(
        select(sa_func.count(MerchantBranch.id)).where(MerchantBranch.merchant_id == merchant.id)
    )).scalar() or 0
    await enforce_limit(db, merchant, "max_branches", count, "filiallar")
    # Koordinata berilmagan bo'lsa — manzildan geokodlab to'ldiramiz, aks holda
    # filial mijoz ilovasidagi xaritada ko'rinmaydi.
    lat, lng = body.lat, body.lng
    if (lat is None or lng is None) and body.address.strip():
        coords = await geocode_address(body.address)
        if coords:
            lat, lng = coords
    b = MerchantBranch(
        merchant_id=merchant.id,
        name=body.name.strip(),
        address=body.address,
        phone=body.phone,
        lat=lat, lng=lng,
        working_hours=body.working_hours,
        is_active=body.is_active,
        photos=list(body.photos or []),
    )
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return {"id": b.id}


@router.patch("/merchants/me/branches/{branch_id}", summary="Filialni yangilash")
async def update_branch(
    branch_id: int,
    body: _BranchIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    b = (await db.execute(
        select(MerchantBranch).where(
            MerchantBranch.id == branch_id, MerchantBranch.merchant_id == merchant.id
        )
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Filial topilmadi")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    # Koordinata hali ham yo'q, lekin manzil bor bo'lsa — geokodlab to'ldiramiz.
    if (b.lat is None or b.lng is None) and (b.address or "").strip():
        coords = await geocode_address(b.address)
        if coords:
            b.lat, b.lng = coords
    await db.commit()
    return {"ok": True}


@router.delete("/merchants/me/branches/{branch_id}", summary="Filialni o'chirish")
async def delete_branch(
    branch_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    b = (await db.execute(
        select(MerchantBranch).where(
            MerchantBranch.id == branch_id, MerchantBranch.merchant_id == merchant.id
        )
    )).scalar_one_or_none()
    if not b:
        raise HTTPException(404, "Filial topilmadi")
    await db.delete(b)
    await db.commit()
    return {"ok": True}


# ═══ STAFF (kassirlar) ═══════════════════════════════════════════════════════
class _StaffIn(BaseModel):
    # Kassir login + parol bilan kiradi (biznes egasi belgilaydi). Login
    # GLOBAL noyob — kassir umumiy login sahifasidan merchant_id'siz kiradi.
    # Telefon ixtiyoriy (faqat ma'lumot uchun).
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=100)
    full_name: str = ""
    phone: Optional[str] = Field("", max_length=30)
    role: str = Field("cashier", pattern="^(owner|admin|branch_chief|manager|cashier)$")
    branch_id: Optional[int] = None
    is_active: bool = True


class _StaffUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(owner|admin|branch_chief|manager|cashier)$")
    branch_id: Optional[int] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = Field(None, min_length=6, max_length=100)


class _StaffLogin(BaseModel):
    merchant_id: int
    username: str
    password: str


class _StaffLoginUsername(BaseModel):
    username: str
    password: str


class _StaffOtpRequest(BaseModel):
    phone: str = Field(min_length=4, max_length=30)


class _StaffOtpVerify(BaseModel):
    phone: str
    code: str = Field(min_length=4, max_length=8)


@router.get("/merchants/me/staff", summary="Kassirlar ro'yxati")
async def list_staff(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MerchantStaff)
        .where(MerchantStaff.merchant_id == merchant.id)
        .order_by(MerchantStaff.id.desc())
    )).scalars().all()
    return [
        {
            "id": s.id,
            "username": s.username,
            "full_name": s.full_name,
            "phone": s.phone,
            "role": s.role,
            "branch_id": s.branch_id,
            "is_active": s.is_active,
            "last_login_at": s.last_login_at.isoformat() if s.last_login_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in rows
    ]


@router.post("/merchants/me/staff", status_code=201, summary="Kassir qo'shish")
async def create_staff(
    body: _StaffIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    staff_count = (await db.execute(
        select(sa_func.count(MerchantStaff.id)).where(MerchantStaff.merchant_id == merchant.id)
    )).scalar() or 0
    await enforce_limit(db, merchant, "max_staff", staff_count, "kassirlar")

    # Login (username) — GLOBAL noyob, kichik harf, bo'sh joysiz. Kassir shu
    # login + parol bilan umumiy login sahifasidan (merchant_id'siz) kiradi.
    username = (body.username or "").strip().lower()
    if len(username) < 3:
        raise HTTPException(400, "Login kamida 3 belgi bo'lishi kerak")
    if " " in username:
        raise HTTPException(400, "Loginda bo'sh joy bo'lmasligi kerak")
    if not body.password or len(body.password) < 6:
        raise HTTPException(400, "Parol kamida 6 belgi bo'lishi kerak")

    # Global noyoblik tekshiruvi.
    dup = (await db.execute(
        select(MerchantStaff).where(MerchantStaff.username == username)
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(409, "Bu login allaqachon band")

    # Telefon ixtiyoriy — kiritilsa normallashtiramiz.
    phone = (body.phone or "").strip()
    if phone and not phone.startswith("+"):
        digits = "".join(c for c in phone if c.isdigit())
        phone = "+" + digits if digits else phone

    s = MerchantStaff(
        merchant_id=merchant.id,
        username=username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        phone=phone,
        role=body.role,
        branch_id=body.branch_id,
        is_active=body.is_active,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    logger.success(f"Staff #{s.id} yaratildi (merchant={merchant.id})")
    return {"id": s.id, "username": s.username, "phone": s.phone}


@router.patch("/merchants/me/staff/{staff_id}", summary="Kassirni yangilash")
async def update_staff(
    staff_id: int,
    body: _StaffUpdate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    s = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.id == staff_id, MerchantStaff.merchant_id == merchant.id
        )
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Kassir topilmadi")
    data = body.model_dump(exclude_unset=True)
    if "new_password" in data and data["new_password"]:
        s.password_hash = hash_password(data.pop("new_password"))
    else:
        data.pop("new_password", None)
    for k, v in data.items():
        if v is not None:
            setattr(s, k, v)
    await db.commit()
    return {"ok": True}


@router.delete("/merchants/me/staff/{staff_id}", summary="Kassirni o'chirish")
async def delete_staff(
    staff_id: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    s = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.id == staff_id, MerchantStaff.merchant_id == merchant.id
        )
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Kassir topilmadi")
    await db.delete(s)
    await db.commit()
    return {"ok": True}


def _normalize_phone(raw: str) -> str:
    """Telefonni KANONIK formatga keltiradi (mobil ilova / auth bilan bir xil:
    core.pos_engine.normalize_phone → '+998XXXXXXXXX'). Avvalgi lokal versiya
    9-xonali raqamga '998' qo'shmasdi (+901234567 ❌) — bu User yozuvlari
    nomuvofiqligiga olib kelardi. Noto'g'ri bo'lsa '' qaytaradi."""
    from core.pos_engine import normalize_phone
    return normalize_phone(raw) or ""


@router.post("/staff/auth/send-otp", summary="Kassir uchun telefon raqamga OTP yuborish")
async def staff_send_otp(
    body: _StaffOtpRequest,
    db: AsyncSession = Depends(get_db),
):
    phone = _normalize_phone(body.phone)
    if len(phone) < 5:
        raise HTTPException(400, "Telefon raqam noto'g'ri")

    # Look up at least one active staff record by phone — we don't need a
    # specific merchant_id since the phone is unique within a merchant
    # (and in practice unique globally for staff). The merchant context is
    # resolved at verify time.
    s = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.phone == phone,
            MerchantStaff.is_active.is_(True),
        )
    )).scalars().first()
    if s is None:
        raise HTTPException(404, "Bu raqam kassir sifatida ro'yxatdan o'tmagan")

    # Reuse the same PhoneOTP table the user-side phone login uses.
    await db.execute(delete(PhoneOTP).where(PhoneOTP.phone == phone))
    code = "".join(secrets.choice("0123456789") for _ in range(4))
    db.add(PhoneOTP(
        phone=phone,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    ))
    await db.commit()
    await send_otp_sms(phone, code)
    return {"detail": "Tasdiqlash kodi yuborildi"}


@router.post("/staff/auth/verify-otp", summary="Kassir OTP tasdiqlash + JWT")
async def staff_verify_otp(
    body: _StaffOtpVerify,
    db: AsyncSession = Depends(get_db),
):
    phone = _normalize_phone(body.phone)

    otp = (await db.execute(
        select(PhoneOTP).where(PhoneOTP.phone == phone).order_by(PhoneOTP.id.desc())
    )).scalars().first()
    if otp is None:
        raise HTTPException(400, "Kod muddati tugagan, qaytadan so'rang")
    if otp.expires_at and otp.expires_at < datetime.now(timezone.utc).replace(tzinfo=otp.expires_at.tzinfo):
        raise HTTPException(400, "Kod muddati tugagan")
    if otp.code != body.code.strip():
        raise HTTPException(400, "Kod noto'g'ri")

    s = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.phone == phone,
            MerchantStaff.is_active.is_(True),
        )
    )).scalars().first()
    if s is None:
        raise HTTPException(404, "Kassir topilmadi")

    s.last_login_at = datetime.now(timezone.utc)
    await db.execute(delete(PhoneOTP).where(PhoneOTP.phone == phone))
    await db.commit()

    token = create_merchant_token({
        "sub": s.merchant_id,
        "staff_id": s.id,
        "staff_role": s.role,
        "branch_id": s.branch_id,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "merchant_id": s.merchant_id,
        "staff_id": s.id,
        "staff_role": s.role,
        "full_name": s.full_name,
    }


@router.post("/staff/login", summary="Kassir login (merchant_id + username + password)")
async def staff_login(
    body: _StaffLogin,
    db: AsyncSession = Depends(get_db),
):
    """Kassir login'i alohida merchant JWT qaytaradi, lekin staff_id ham payload'da bo'ladi."""
    s = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.merchant_id == body.merchant_id,
            MerchantStaff.username == body.username.strip(),
        )
    )).scalar_one_or_none()
    if not s or not verify_password(body.password, s.password_hash):
        raise HTTPException(401, "Login yoki parol noto'g'ri")
    if not s.is_active:
        raise HTTPException(403, "Akkaunt o'chirilgan")

    s.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    # Merchant tokenini qaytaramiz — ayni merchant nomidan ishlaydi, lekin staff kontekst saqlanadi.
    token = create_merchant_token({
        "sub": s.merchant_id,
        "staff_id": s.id,
        "staff_role": s.role,
        "branch_id": s.branch_id,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "merchant_id": s.merchant_id,
        "staff_id": s.id,
        "staff_role": s.role,
        "full_name": s.full_name,
    }


@router.post("/staff/auth/login", summary="Kassir login (login + parol, merchant_id'siz)")
async def staff_login_username(
    body: _StaffLoginUsername,
    db: AsyncSession = Depends(get_db),
):
    """Kassir umumiy login sahifasidan login+parol bilan kiradi. Login global
    noyob bo'lgani uchun merchant_id talab qilinmaydi. Merchant JWT (staff
    konteksti bilan) qaytariladi."""
    username = (body.username or "").strip().lower()
    s = (await db.execute(
        select(MerchantStaff).where(MerchantStaff.username == username)
    )).scalar_one_or_none()
    if not s or not verify_password(body.password, s.password_hash):
        raise HTTPException(401, "Login yoki parol noto'g'ri")
    if not s.is_active:
        raise HTTPException(403, "Akkaunt o'chirilgan")

    s.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    token = create_merchant_token({
        "sub": s.merchant_id,
        "staff_id": s.id,
        "staff_role": s.role,
        "branch_id": s.branch_id,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "merchant_id": s.merchant_id,
        "staff_id": s.id,
        "staff_role": s.role,
        "full_name": s.full_name,
    }


# ═══ NOTIFICATIONS ═══════════════════════════════════════════════════════════
class _TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    channel: str = Field("push", pattern="^(push|sms|email)$")
    title: str = ""
    body: str = ""
    target_segment: str = "all"
    is_active: bool = True


class _BroadcastIn(BaseModel):
    template_id: Optional[int] = None
    channel: str = Field("push", pattern="^(push|sms|email|telegram)$")
    title: str = ""
    body: str = ""
    target_segment: str = "all"  # all | tier:gold | ...
    # Professional push: rasm + bosilganda yo'naltirish
    image_url: str = ""
    route: str = ""       # card | promotions | profile | url
    route_id: str = ""


@router.get("/merchants/me/notifications/templates", summary="Shablonlar ro'yxati")
async def list_templates(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MerchantNotificationTemplate)
        .where(MerchantNotificationTemplate.merchant_id == merchant.id)
        .order_by(MerchantNotificationTemplate.id.desc())
    )).scalars().all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "channel": t.channel,
            "title": t.title,
            "body": t.body,
            "target_segment": t.target_segment,
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in rows
    ]


@router.post("/merchants/me/notifications/templates", status_code=201, summary="Shablon yaratish")
async def create_template(
    body: _TemplateIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    t = MerchantNotificationTemplate(
        merchant_id=merchant.id,
        name=body.name,
        channel=body.channel,
        title=body.title,
        body=body.body,
        target_segment=body.target_segment,
        is_active=body.is_active,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"id": t.id}


@router.delete("/merchants/me/notifications/templates/{tid}", summary="Shablonni o'chirish")
async def delete_template(
    tid: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    t = (await db.execute(
        select(MerchantNotificationTemplate).where(
            MerchantNotificationTemplate.id == tid,
            MerchantNotificationTemplate.merchant_id == merchant.id,
        )
    )).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Shablon topilmadi")
    await db.delete(t)
    await db.commit()
    return {"ok": True}


def _apply_card_segment(q, segment: str):
    """Card query'ga segment filtri: all / active / sleeping[:<days>] / tier:<name>.
    active          = oxirgi 30 kunda kelgan
    sleeping        = 30+ kun kelmagan yoki hech qachon kelmagan
    sleeping:<days> = <days> kundan beri kelmagan"""
    seg = (segment or "all").strip().lower()
    if seg.startswith("tier:"):
        return q.where(Card.tier == seg.split(":", 1)[1].strip().lower())
    if seg == "active":
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        return q.where(Card.last_used_at.isnot(None), Card.last_used_at >= cutoff)
    if seg in ("sleeping", "inactive", "uxlayotgan") or seg.startswith("sleeping:"):
        days = 30
        if ":" in seg:
            try:
                days = max(1, int(seg.split(":", 1)[1]))
            except ValueError:
                pass
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        return q.where((Card.last_used_at.is_(None)) | (Card.last_used_at < cutoff))
    return q  # all


async def _send_telegram_broadcast(merchant_id, telegram_ids, text, template_id, title, body_text, target):
    """Telegram bot orqali mijozlarga xabar yuboradi — fon vazifasi, throttled
    (~20 xabar/sekund, Telegram limitidan past). Yakunida log yoziladi."""
    import asyncio
    from database import AsyncSessionLocal
    try:
        from routers.telegram_bot import bot as _bot
    except Exception:  # noqa: BLE001
        _bot = None
    sent = failed = 0
    if _bot is not None:
        for tg_id in telegram_ids:
            try:
                await _bot.send_message(chat_id=int(tg_id), text=text)
                sent += 1
            except Exception:  # noqa: BLE001 — bloklagan/chat topilmagan userlar
                failed += 1
            await asyncio.sleep(0.05)
    try:
        async with AsyncSessionLocal() as _db:
            _db.add(MerchantNotificationLog(
                merchant_id=merchant_id, template_id=template_id, channel="telegram",
                title=title, body=body_text, target=target,
                sent_count=sent, failed_count=failed,
            ))
            await _db.commit()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"telegram broadcast log xato: {e}")
    logger.info(f"telegram broadcast merchant={merchant_id} sent={sent} failed={failed}")


@router.post("/merchants/me/notifications/broadcast", summary="Broadcast yuborish (push / telegram)")
async def broadcast(
    body: _BroadcastIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """
    Target segmentlari:
      - all: shu merchantning barcha card egalari (user_id bor)
      - tier:<name>: shu tier'dagi kartalar
      - rfm:<Champions|Loyal|At Risk|Hibernating|New|Potential>: hozircha faqat tier bo'yicha
    """
    # Target userlarni aniqlaymiz
    q = select(Card).where(Card.merchant_id == merchant.id, Card.user_id.isnot(None))
    q = _apply_card_segment(q, body.target_segment)
    cards = (await db.execute(q)).scalars().all()
    user_ids = list({c.user_id for c in cards if c.user_id})

    sent = 0
    failed = 0
    invalid = 0

    if body.channel == "push" and user_ids:
        # Log avval yaratamiz — uning id'si kampaniya (o'qilgan stats) uchun.
        log = MerchantNotificationLog(
            merchant_id=merchant.id, template_id=body.template_id, channel="push",
            title=body.title, body=body.body, target=body.target_segment,
            sent_count=0, failed_count=0,
        )
        db.add(log)
        await db.flush()
        campaign_id = log.id

        push_data = {"merchant_id": str(merchant.id), "campaign_id": str(campaign_id)}
        if body.route:
            push_data["route"] = body.route
        if body.route_id:
            push_data["route_id"] = body.route_id

        tokens_rows = (await db.execute(
            select(FCMToken.token).where(FCMToken.user_id.in_(user_ids))
        )).scalars().all()
        tokens = list({t for t in tokens_rows if t})
        if tokens:
            try:
                sent, failed = await send_fcm_multicast(
                    tokens=tokens,
                    title=body.title or "",
                    body=body.body or "",
                    data=push_data,
                    image=body.image_url or "",
                )
            except Exception as e:
                logger.warning(f"Broadcast FCM xato: {e}")
                failed = len(tokens)
        log.sent_count = sent
        log.failed_count = failed

        # Ilova ichidagi "Bildirishnomalar" — campaign_id bilan (o'qilgan stats).
        if body.title or body.body:
            db.add_all([
                UserNotification(
                    user_id=uid,
                    title=(body.title or "").strip() or merchant.business_name,
                    body=(body.body or "").strip(),
                    icon="storefront",
                    image_url=body.image_url or "",
                    route=body.route or "",
                    route_id=body.route_id or "",
                    campaign_id=campaign_id,
                )
                for uid in user_ids
            ])
        await db.commit()
        return {"sent": sent, "failed": failed, "invalid": invalid,
                "target_users": len(user_ids), "campaign_id": campaign_id}

    elif body.channel == "telegram":
        # Telegram orqali — botga ulangan (telegram_id bor) mijozlarga
        tg_ids = []
        if user_ids:
            tg_ids = [t for t in (await db.execute(
                select(User.telegram_id).where(
                    User.id.in_(user_ids), User.telegram_id.isnot(None)
                )
            )).scalars().all() if t]
        if not tg_ids:
            return {"sent": 0, "failed": 0, "invalid": 0, "target_users": len(user_ids), "queued": 0}
        import html as _html
        import asyncio as _asyncio
        _title = (body.title or "").strip()
        _bd = (body.body or "").strip()
        _text = (f"<b>{_html.escape(_title)}</b>\n\n{_html.escape(_bd)}" if _title else _html.escape(_bd))
        _asyncio.create_task(_send_telegram_broadcast(
            merchant.id, tg_ids, _text, body.template_id, _title, _bd, body.target_segment,
        ))
        # Fon'da yuboriladi — darhol navbatga olingan sonni qaytaramiz
        return {"queued": len(tg_ids), "target_users": len(user_ids), "channel": "telegram"}

    elif body.channel == "sms":
        # SMS rassilka xizmati O'CHIRILGAN — faqat OTP SMS (login kodi) ishlaydi.
        raise HTTPException(403, "SMS rassilka xizmati o'chirilgan")

    # Bu yergacha faqat user_ids bo'sh bo'lganda yetib keladi (push erta return qiladi).
    log = MerchantNotificationLog(
        merchant_id=merchant.id,
        template_id=body.template_id,
        channel=body.channel,
        title=body.title,
        body=body.body,
        target=body.target_segment,
        sent_count=sent,
        failed_count=failed,
    )
    db.add(log)
    await db.commit()
    return {"sent": sent, "failed": failed, "invalid": invalid, "target_users": len(user_ids)}


@router.post("/merchants/me/notifications/telegram-audience", summary="Telegram broadcast auditoriyasi (botga ulangan mijozlar soni)")
async def telegram_audience_count(
    body: _BroadcastIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Tanlangan segmentда nechta mijoz Telegram botga ulangan (telegram_id bor)."""
    q = (
        select(sa_func.count(sa_func.distinct(User.id)))
        .select_from(Card).join(User, Card.user_id == User.id)
        .where(
            Card.merchant_id == merchant.id,
            Card.is_active.is_(True),
            User.telegram_id.isnot(None),
        )
    )
    q = _apply_card_segment(q, body.target_segment)
    count = (await db.execute(q)).scalar_one()
    return {"count": int(count)}


@router.post("/merchants/me/notifications/push-audience", summary="Push broadcast auditoriyasi soni")
async def push_audience_count(
    body: _BroadcastIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Tanlangan segmentda nechta mijoz push bildirishnoma olishi mumkin (user_id bor)."""
    q = select(sa_func.count(sa_func.distinct(Card.user_id))).where(
        Card.merchant_id == merchant.id,
        Card.user_id.isnot(None),
    )
    q = _apply_card_segment(q, body.target_segment)
    count = (await db.execute(q)).scalar() or 0
    return {"count": int(count)}


@router.post("/merchants/me/notifications/sms-audience", summary="SMS rassilka uchun raqamlar soni")
async def sms_audience_count(
    body: _BroadcastIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Tanlangan segmentda nechta yaroqli telefon raqam borligini qaytaradi."""
    from core.sms import normalize_uz_phone

    q = select(Card.holder_phone).where(
        Card.merchant_id == merchant.id,
        Card.holder_phone.isnot(None),
        Card.holder_phone != "",
    )
    q = _apply_card_segment(q, body.target_segment)
    rows = (await db.execute(q)).scalars().all()
    phones = {(p or "").strip() for p in rows if p}
    valid = sum(1 for p in phones if normalize_uz_phone(p))
    from config import settings as _s
    return {
        "total": len(phones),
        "valid": valid,
        "invalid": len(phones) - valid,
        "price_per_sms": int(getattr(_s, "SMS_PRICE_UZS", 50)),
    }


@router.post("/merchants/me/upload-image", summary="Rasm yuklash (push banner) → https URL")
async def merchant_upload_image(
    file: UploadFile = File(...),
    merchant: Merchant = Depends(get_current_merchant),
):
    """Merchant push banner rasmini media papkaga saqlaydi va public https URL
    qaytaradi (FCM image https bo'lishi shart)."""
    import os as _os
    import uuid as _uuid
    fname = file.filename or ""
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "jpg"
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        raise HTTPException(400, "Faqat rasm: jpg, png, webp yoki gif")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Rasm 10 MB dan katta bo'lmasin")
    _os.makedirs("media/uploads", exist_ok=True)
    name = f"{_uuid.uuid4().hex}.{ext}"
    with open(f"media/uploads/{name}", "wb") as f:
        f.write(data)
    return {"url": f"https://monvo.uz/media/uploads/{name}"}


class _DirectPushIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=1000)


@router.post("/merchants/me/customers/{card_uid}/push", summary="Alohida mijozga push yuborish")
async def push_to_customer(
    card_uid: str,
    body: _DirectPushIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )).scalar_one_or_none()
    if not card or not card.user_id:
        raise HTTPException(404, "Karta topilmadi yoki foydalanuvchi yo'q")

    tokens = (await db.execute(
        select(FCMToken.token).where(FCMToken.user_id == card.user_id)
    )).scalars().all()
    tokens = list({t for t in tokens if t})

    sent, failed = 0, 0
    if tokens:
        try:
            sent, failed = await send_fcm_multicast(
                tokens=tokens,
                title=body.title,
                body=body.body,
                data={"merchant_id": str(merchant.id)},
            )
        except Exception as e:
            logger.warning(f"Direct push FCM xato: {e}")
            failed = len(tokens)

    db.add(UserNotification(
        user_id=card.user_id,
        title=body.title.strip() or merchant.business_name,
        body=body.body.strip(),
        icon="storefront",
        image_url="",
        route="",
        route_id="",
    ))
    await db.commit()
    return {"sent": sent, "failed": failed}


@router.get("/merchants/me/notifications/logs", summary="Yuborilgan xabarlar tarixi")
async def list_logs(
    limit: int = Query(50, le=500),
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MerchantNotificationLog)
        .where(MerchantNotificationLog.merchant_id == merchant.id)
        .order_by(MerchantNotificationLog.id.desc())
        .limit(limit)
    )).scalars().all()
    # O'qilgan statistikasi (campaign_id = log.id orqali)
    ids = [l.id for l in rows]
    recip_map: dict = {}
    read_map: dict = {}
    if ids:
        res = await db.execute(
            select(
                UserNotification.campaign_id,
                sa_func.count(UserNotification.id),
                sa_func.count().filter(UserNotification.is_read.is_(True)),
            )
            .where(UserNotification.campaign_id.in_(ids))
            .group_by(UserNotification.campaign_id)
        )
        for cid, total, readc in res.all():
            recip_map[cid] = int(total or 0)
            read_map[cid] = int(readc or 0)
    return [
        {
            "id": l.id,
            "channel": l.channel,
            "title": l.title,
            "body": (l.body or "")[:200],
            "target": l.target,
            "sent_count": l.sent_count,
            "failed_count": l.failed_count,
            "recipients": recip_map.get(l.id, 0),
            "read_count": read_map.get(l.id, 0),
            "sent_at": l.sent_at.isoformat() if l.sent_at else None,
        }
        for l in rows
    ]


# ── Admin → Merchant Inbox ────────────────────────────────────────────────────
class InboxMessageIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=4000)
    icon: str = Field(default="notifications", max_length=50)
    tone: str = Field(default="neutral", max_length=20)
    merchant_id: Optional[int] = None  # None = broadcast to all merchants


@router.get("/merchants/me/inbox", summary="Adminstrator xabarlari (merchant inbox)")
async def list_inbox(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    rows = (await db.execute(
        select(MerchantInboxMessage)
        .where(
            (MerchantInboxMessage.merchant_id == merchant.id)
            | (MerchantInboxMessage.merchant_id.is_(None))
        )
        .order_by(MerchantInboxMessage.created_at.desc())
        .limit(limit)
        .offset(offset)
    )).scalars().all()
    return [
        {
            "id": m.id,
            "title": m.title,
            "body": m.body,
            "icon": m.icon,
            "tone": m.tone,
            "is_read": m.is_read,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "broadcast": m.merchant_id is None,
        }
        for m in rows
    ]


@router.get("/merchants/me/inbox/unread-count", summary="O'qilmagan xabarlar soni")
async def inbox_unread(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    n = (await db.execute(
        select(sa_func.count())
        .select_from(MerchantInboxMessage)
        .where(
            ((MerchantInboxMessage.merchant_id == merchant.id)
             | (MerchantInboxMessage.merchant_id.is_(None))),
            MerchantInboxMessage.is_read.is_(False),
        )
    )).scalar() or 0
    return {"unread": n}


@router.post("/merchants/me/inbox/{mid}/read", summary="Xabarni o'qildi deb belgilash")
async def mark_inbox_read(
    mid: int,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    m = (await db.execute(
        select(MerchantInboxMessage).where(MerchantInboxMessage.id == mid)
    )).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Xabar topilmadi")
    if m.merchant_id is not None and m.merchant_id != merchant.id:
        raise HTTPException(403, "Bu xabar sizga tegishli emas")
    m.is_read = True
    await db.commit()
    return {"ok": True}


@router.post("/admin/merchants/inbox", status_code=201, summary="Admin: merchantga xabar yuborish")
async def admin_send_inbox(
    body: InboxMessageIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if body.merchant_id is not None:
        m = await db.get(Merchant, body.merchant_id)
        if not m:
            raise HTTPException(404, "Merchant topilmadi")
    msg = MerchantInboxMessage(
        merchant_id=body.merchant_id,
        title=body.title.strip(),
        body=body.body.strip(),
        icon=body.icon.strip() or "notifications",
        tone=body.tone.strip() or "neutral",
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return {
        "id": msg.id,
        "broadcast": msg.merchant_id is None,
        "merchant_id": msg.merchant_id,
    }


@router.get("/admin/merchants/inbox", summary="Admin: yuborilgan xabarlar tarixi")
async def admin_list_inbox(
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=500),
    offset: int = 0,
):
    rows = (await db.execute(
        select(MerchantInboxMessage)
        .order_by(MerchantInboxMessage.created_at.desc())
        .limit(limit)
        .offset(offset)
    )).scalars().all()
    # Maqsadli xabarlar uchun merchant nomlarini yig'amiz (broadcast = None)
    mids = {r.merchant_id for r in rows if r.merchant_id is not None}
    names = {}
    if mids:
        mres = (await db.execute(
            select(Merchant.id, Merchant.business_name).where(Merchant.id.in_(mids))
        )).all()
        names = {mid: bn for mid, bn in mres}
    return [
        {
            "id": r.id,
            "title": r.title,
            "body": r.body,
            "icon": r.icon,
            "tone": r.tone,
            "is_read": r.is_read,
            "merchant_id": r.merchant_id,
            "merchant_name": names.get(r.merchant_id) if r.merchant_id else None,
            "broadcast": r.merchant_id is None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.delete("/admin/merchants/inbox/{mid}", summary="Admin: xabarni o'chirish")
async def admin_delete_inbox(
    mid: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = await db.get(MerchantInboxMessage, mid)
    if not m:
        raise HTTPException(404, "Xabar topilmadi")
    await db.delete(m)
    await db.commit()
    return {"ok": True}
