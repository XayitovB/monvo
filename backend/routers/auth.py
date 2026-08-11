"""
routers/auth.py
───────────────
Customer autentifikatsiyasi.

POST /auth/phone/send-otp  — telefon raqamga OTP yuborish
POST /auth/phone/verify    — OTP tasdiqlash + JWT
GET  /auth/me              — joriy profil
POST /auth/register        — email/parol (legacy)
POST /auth/login           — email/parol (legacy)
POST /auth/google          — Google Sign-In
"""
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.dependencies import get_current_user, log_action
from core.login_security import record_login_attempt, safe_verify_password
from core.pos_engine import normalize_phone
from core.security import create_access_token, create_staff_token, hash_password, verify_password
from core.sms import send_otp_sms
from database import get_db
from models import PhoneOTP, User
from schemas import GoogleAuthRequest, PhoneOTPRequest, PhoneVerifyRequest, TokenResponse, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["🔐 Auth"])

from main import limiter as _limiter


def _generate_otp() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


# ── Phone OTP Auth ───────────────────────────────────────────────────────────

@router.post("/phone/check-merchant", summary="Telefon merchant akkauntiga tegishli ekanligini tekshirish")
@_limiter.limit("20/minute")
async def check_phone_is_merchant(
    request: Request,
    body: PhoneOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Web login pre-check: telefon raqam role=merchant bo'lgan userga tegishlimi?
    SMS yuborishdan oldin UX uchun — noto'g'ri raqamlarga OTP yubormaslik uchun.
    Haqiqiy himoya /auth/merchant-token endpointida.
    """
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(400, "Telefon raqam noto'g'ri")

    user = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Bu raqam ro'yxatdan o'tmagan")
    if getattr(user, "role", "user") != "merchant":
        raise HTTPException(403, "Bu raqam biznes akkauntga ulanmagan")
    if not user.is_active:
        raise HTTPException(403, "Hisob bloklangan")

    return {"ok": True, "business_name": None}


@router.post("/phone/send-otp", summary="Telefon raqamga OTP yuborish")
@_limiter.limit("5/minute")
async def send_otp(
    request: Request,
    body: PhoneOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(400, "Telefon raqam noto'g'ri")

    # Per-phone rate limit: 5 daqiqada max 3 ta SMS (spam + botdan himoya)
    from core.cache import rate_limit_incr
    sms_count = await rate_limit_incr(f"otp_send:{phone}", 300)
    if sms_count > 3:
        raise HTTPException(429, "Juda ko'p urinish — 5 daqiqadan keyin qaytadan urinib ko'ring")

    # Anti-duplikat: oxirgi 90 soniyada kod yuborilgan bo'lsa, yangi SMS yubormaymiz
    # (eski kod hali 5 daqiqa amal qiladi) — SMS xarajatini tejaydi.
    recent = await rate_limit_incr(f"otp_recent:{phone}", 90)
    if recent > 1:
        return {"detail": "Tasdiqlash kodi yuborildi"}

    # Eski OTPlarni o'chirish
    await db.execute(delete(PhoneOTP).where(PhoneOTP.phone == phone))

    code = _generate_otp()
    otp = PhoneOTP(
        phone=phone,
        code=code,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db.add(otp)
    await db.commit()

    await send_otp_sms(phone, code)
    return {"detail": "Tasdiqlash kodi yuborildi"}


@router.post("/phone/verify", response_model=TokenResponse, summary="OTP tasdiqlash + JWT")
@_limiter.limit("10/minute")
async def verify_otp(
    request: Request,
    body: PhoneVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(400, "Telefon raqam noto'g'ri")

    now = datetime.now(timezone.utc)

    # Per-phone xato urinishlar: 15 daqiqada 5 tadan ortiq → 429
    from core.cache import rate_limit_incr
    fail_key = f"otp_fail:{phone}"

    result = await db.execute(
        select(PhoneOTP)
        .where(PhoneOTP.phone == phone, PhoneOTP.used.is_(False))
        .order_by(PhoneOTP.created_at.desc())
        .limit(1)
    )
    otp = result.scalar_one_or_none()

    # App Store/Play Store tekshiruv akkaunti — reviewer haqiqiy SMS ololmaydi.
    # Faqat ANIQ shu bitta raqam + ANIQ shu bitta kod moslashsa ishlaydi
    # (REVIEW_PHONE_NUMBER bo'sh bo'lsa — hech qanday raqamga bypass yo'q).
    review_bypass = bool(
        settings.REVIEW_PHONE_NUMBER
        and settings.REVIEW_OTP_CODE
        and phone == settings.REVIEW_PHONE_NUMBER
        and body.code == settings.REVIEW_OTP_CODE
    )

    if not review_bypass:
        # Per-phone limit ni avval tekshiramiz
        fail_count = await rate_limit_incr(fail_key, 900)  # 15 daqiqalik oyna
        if fail_count > 5:
            raise HTTPException(429, "Juda ko'p xato — 15 daqiqadan keyin urinib ko'ring")

        if not otp:
            raise HTTPException(400, "Kod topilmadi. Qaytadan yuborish tugmasini bosing")
        if otp.expires_at.replace(tzinfo=timezone.utc) < now:
            raise HTTPException(400, "Kod muddati tugagan. Qaytadan yuborish tugmasini bosing")
        if otp.code != body.code:
            raise HTTPException(400, "Kod noto'g'ri")

        # Muvaffaqiyatli — xato counter'ni reset qilamiz
        from core.cache import cache_delete_prefix
        await cache_delete_prefix(f"otp_fail:{phone}")

    if otp:
        otp.used = True

    user_result = await db.execute(select(User).where(User.phone == phone))
    user = user_result.scalar_one_or_none()
    is_new = user is None

    if is_new:
        name = (body.name or "").strip() or phone
        user = User(name=name, phone=phone, auth_provider="phone")
        db.add(user)

    await db.commit()
    if is_new:
        await db.refresh(user)

    if not user.is_active:
        raise HTTPException(403, "Hisob bloklangan")

    token = create_access_token({"sub": user.id})
    fwd = request.headers.get("x-forwarded-for", "")
    real_ip = (fwd.split(",")[0].strip() if fwd else "") or request.headers.get("x-real-ip", "") \
        or (request.client.host if request.client else "")
    meta = {
        "ip": real_ip,
        "user_agent": request.headers.get("user-agent", ""),
        "platform": (body.platform or "").lower(),
        "os_version": body.os_version or "",
        "app_version": body.app_version or "",
        "device_model": body.device_model or "",
        "device_uid": body.device_uid or "",
    }
    await log_action(db, user.id, "phone_auth", meta=meta)

    # Xuddi shu telefon kassir sifatida ham ro'yxatdan o'tganmi?
    # staff_token — alohida staff-scoped JWT (merchant tokeni EMAS)
    from models import MerchantStaff
    staff = (await db.execute(
        select(MerchantStaff).where(
            MerchantStaff.phone == phone,
            MerchantStaff.is_active.is_(True),
        )
    )).scalars().first()
    staff_payload = {}
    if staff is not None:
        staff_token = create_staff_token(staff.id, staff.merchant_id, staff.branch_id)
        staff.last_login_at = datetime.now(timezone.utc)
        await db.commit()
        staff_payload = {
            "staff_token": staff_token,
            "staff_id": staff.id,
            "merchant_id": staff.merchant_id,
            "staff_role": staff.role,
            "staff_full_name": staff.full_name,
        }

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        is_new=is_new,
        role=getattr(user, "role", "user"),
        **staff_payload,
    )


@router.post("/register", response_model=TokenResponse, status_code=201,
             summary="Yangi foydalanuvchi ro'yxatdan o'tishi")
@_limiter.limit(f"{settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def register(
    request: Request,
    body: UserRegister,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Email '{body.email}' allaqachon ro'yxatdan o'tgan")

    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": user.id})
    logger.success(f"Yangi foydalanuvchi: {body.email}")
    await log_action(db, user.id, "register")
    return TokenResponse(access_token=token, user_id=user.id, name=user.name)


@router.post("/login", response_model=TokenResponse,
             summary="Email/parol bilan kirish")
@_limiter.limit(f"{settings.RATE_LIMIT_AUTH_PER_MINUTE}/minute")
async def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form.username))
    user = result.scalar_one_or_none()

    ok = safe_verify_password(
        form.password,
        user.password_hash if user else None,
    )
    await record_login_attempt(
        db,
        identifier=form.username,
        role="user",
        success=ok,
        request=request,
        user_id=user.id if user else None,
    )

    if not ok:
        logger.warning(f"Muvaffaqiyatsiz kirish: {form.username}")
        raise HTTPException(401, "Email yoki parol noto'g'ri")
    if not user.is_active:
        raise HTTPException(403, "Hisob bloklangan. Qo'llab-quvvatlash bilan bog'laning.")

    token = create_access_token({"sub": user.id})
    await log_action(db, user.id, "login")
    return TokenResponse(access_token=token, user_id=user.id, name=user.name)


@router.get("/me", response_model=UserOut, summary="Joriy foydalanuvchi profili")
async def me(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Ilova ochilishi = "aktivlik". /auth/me ilova ishga tushganda chaqiriladi.
    # 10 daqiqada bir marta yozamiz (Redis throttle) — admin "faol userlar"
    # statistikasi shu AuditLog'dan hisoblanadi (mini-app'dagi miniapp_open bilan bir xil).
    try:
        from core.cache import rate_limit_incr
        if await rate_limit_incr(f"app_active:{user.id}", 600) == 1:
            from models import AuditLog
            ua = (request.headers.get("user-agent", "") or "").lower()
            plat = "ios" if ("iphone" in ua or "ios" in ua or "darwin" in ua) else (
                "android" if "android" in ua else "app")
            db.add(AuditLog(
                user_id=user.id, actor=f"user:{user.id}",
                action="app_open", platform=plat,
            ))
            await db.commit()
    except Exception:  # noqa: BLE001 — faollik qaydi profilni qaytarishga to'sqinlik qilmasin
        try:
            await db.rollback()
        except Exception:  # noqa: BLE001
            pass
    return user


class UserUpdateIn(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    language: Optional[str] = Field(None, pattern=r"^(uz|ru)$")
    birth_date: Optional[str] = Field(None, description="YYYY-MM-DD yoki ISO datetime")


@router.patch("/me", response_model=UserOut, summary="Profilni yangilash (ism, til, tug'ilgan sana)")
async def update_me(
    body: UserUpdateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.name is not None:
        name = body.name.strip()
        if not name:
            raise HTTPException(400, "Ism bo'sh bo'lmasligi kerak")
        user.name = name

    if body.language is not None:
        user.language = body.language.strip().lower()

    if body.birth_date is not None:
        bd = body.birth_date
        if bd == "":
            user.birth_date = None
        else:
            try:
                if len(bd) == 10:
                    user.birth_date = datetime.strptime(bd, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                else:
                    user.birth_date = datetime.fromisoformat(bd.replace("Z", "+00:00"))
            except Exception:
                raise HTTPException(400, "birth_date formati: YYYY-MM-DD")

    await db.commit()
    await db.refresh(user)
    return user


class RegionIn(BaseModel):
    lat: float
    lng: float


@router.post("/region", summary="Joylashuvdan foydalanuvchi regionini saqlash")
async def set_region(
    body: RegionIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Ilova joylashuvni olganda (Karta ekrani) lat/lng yuboradi → viloyat saqlanadi."""
    from core.uz_regions import region_from_coords
    region = region_from_coords(body.lat, body.lng)
    if region:
        user.region = region
        user.region_updated_at = datetime.now(timezone.utc)
        await db.commit()
    return {"region": region}


@router.delete("/me", status_code=204, summary="Hisobni butunlay o'chirish")
async def delete_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Foydalanuvchi o'z hisobini butunlay o'chiradi (App Store / Google Play
    talabi: hisob yaratuvchi ilovalarda ilova ichidan o'chirish bo'lishi shart).

    Bog'liq ma'lumotlar DB darajasidagi FK qoidalari bilan tozalanadi:
      • cards, fcm_tokens, audit_logs, gamification va h.k. → CASCADE (o'chadi)
      • transactions → SET NULL (do'kon hisoboti uchun saqlanadi, anonimlashadi)
    """
    uid, phone = user.id, user.phone
    await db.delete(user)
    await db.commit()
    # audit_log user bilan cascade o'chadi — shuning uchun loguru/Sentry'ga yozamiz
    logger.info(f"Account deleted: user_id={uid} phone={phone}")
    return None


@router.post("/google", response_model=TokenResponse, status_code=200,
             summary="Google Sign-In")
async def google_auth(
    body: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        idinfo = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        logger.warning(f"Google token yaroqsiz: {exc}")
        raise HTTPException(401, "Google token yaroqsiz yoki muddati tugagan")

    google_id = idinfo["sub"]
    email = idinfo.get("email", "")
    name = idinfo.get("name") or idinfo.get("given_name") or (email.split("@")[0] if email else "user")

    if not email:
        raise HTTPException(400, "Google akkauntida email topilmadi")

    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            user.google_id = google_id
            user.auth_provider = "google"
            await db.commit()
        else:
            user = User(
                name=name,
                email=email,
                password_hash="",
                google_id=google_id,
                auth_provider="google",
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            logger.success(f"Google orqali yangi user: {email}")

    if not user.is_active:
        raise HTTPException(403, "Hisob bloklangan.")

    token = create_access_token({"sub": user.id})
    await log_action(db, user.id, "google_auth")
    return TokenResponse(access_token=token, user_id=user.id, name=user.name)


# ── Merchant token (role=merchant bo'lgan userlar uchun) ─────────────────────

@router.post("/merchant-token", summary="Merchant JWT (faqat role=merchant users)")
async def get_merchant_token(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Merchant role'ga ega user o'z Merchant akkauntiga kirish uchun
    merchant JWT token oladi. Bu token /merchants/* endpointlari uchun.
    """
    if getattr(user, "role", "user") != "merchant":
        raise HTTPException(403, "Bu endpoint faqat merchant role uchun")

    merchant_id = getattr(user, "merchant_account_id", None)
    if not merchant_id:
        raise HTTPException(404, "Merchant akkaunt topilmadi. Admin bilan bog'laning.")

    from models import Merchant
    merchant = (await db.execute(
        select(Merchant).where(Merchant.id == merchant_id, Merchant.is_active.is_(True))
    )).scalar_one_or_none()
    if not merchant:
        raise HTTPException(404, "Merchant akkaunt faol emas")

    from core.security import create_merchant_token
    token = create_merchant_token({"sub": str(merchant.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "merchant_id": merchant.id,
        "business_name": merchant.business_name,
    }


@router.post("/admin-token", summary="Admin JWT (faqat role=admin users)")
async def get_admin_token(
    user: User = Depends(get_current_user),
):
    """User token → agar role=admin bo'lsa, admin JWT token qaytaradi."""
    if getattr(user, "role", "user") != "admin":
        raise HTTPException(403, "Bu endpoint faqat admin role uchun")

    from core.security import create_admin_token
    token = create_admin_token({"sub": f"user_{user.id}", "role": "admin"})
    return {
        "access_token": token,
        "token_type": "bearer",
        "name": user.name,
    }
