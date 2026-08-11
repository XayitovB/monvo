"""
routers/password_reset.py
──────────────────────────
Parolni tiklash — 3 bosqich:
  1. POST /auth/forgot-password   → email bo'yicha OTP yuborish
  2. POST /auth/verify-reset-code → OTP ni tekshirish, reset token qaytarish
  3. POST /auth/reset-password    → yangi parol o'rnatish
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from loguru import logger
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.email_service import (
    DEFAULT_FORGOT_PASSWORD_HTML,
    DEFAULT_FORGOT_PASSWORD_SUBJECT,
    generate_otp,
    generate_reset_token,
    get_token_expiry,
    send_reset_email,
)
from core.security import hash_password
from database import get_db
from main import limiter
from models import EmailTemplate, PasswordResetToken, User

router = APIRouter(prefix="/auth", tags=["🔑 Password Reset"])


# ── Pydantic Schema ────────────────────────────────────────────────────────────
class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str   # 6 xonali OTP


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str


# ── 1. Forgot Password ────────────────────────────────────────────────────────
@router.post("/forgot-password", summary="OTP kodni emailga yuborish")
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Email mavjud bo'lsa 6 xonali OTP kodi yuboradi.
    Xavfsizlik uchun email topilmasa ham "ok" javob qaytaradi
    (email enumeration himoyasi).
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user and user.is_active:
        # Eski tokenlarni bekor qilish (bir emailga faqat 1 ta faol token)
        old_tokens = await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == user.id,
                PasswordResetToken.used == False,
            )
        )
        for old in old_tokens.scalars().all():
            old.used = True

        # Yangi OTP va reset token yaratish
        code        = generate_otp()
        reset_token = generate_reset_token()
        expires_at  = get_token_expiry()

        db_token = PasswordResetToken(
            user_id    = user.id,
            code       = code,
            token      = reset_token,
            expires_at = expires_at,
        )
        db.add(db_token)
        await db.commit()

        # Email shablonini DB dan olish (admin o'zgartirgan bo'lsa)
        tmpl_result = await db.execute(
            select(EmailTemplate).where(EmailTemplate.key == "forgot_password")
        )
        tmpl = tmpl_result.scalar_one_or_none()

        email_sent = await send_reset_email(
            to_email      = user.email,
            user_name     = user.name,
            code          = code,
            subject       = tmpl.subject   if tmpl else DEFAULT_FORGOT_PASSWORD_SUBJECT,
            html_template = tmpl.body_html if tmpl else DEFAULT_FORGOT_PASSWORD_HTML,
        )

        if not email_sent:
            # SMTP sozlanmagan — development uchun kodni logga yozamiz
            logger.warning(
                f"[DEV] Reset kodi: {code} | Email: {user.email} | Token: {reset_token}"
            )

    # Xavfsizlik: doim bir xil javob (email bor/yo'qligini ko'rsatma)
    return {
        "message": "Agar bu email ro'yxatdan o'tgan bo'lsa, kod yuborildi.",
        "success": True,
    }


# ── 2. Verify OTP Code ─────────────────────────────────────────────────────────
@router.post("/verify-reset-code", summary="OTP kodni tekshirish")
@limiter.limit("10/minute")
async def verify_reset_code(
    request: Request,
    body: VerifyCodeRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    OTP kod to'g'ri va muddati o'tmagan bo'lsa reset_token qaytaradi.
    Keyingi bosqichda shu token bilan yangi parol o'rnatiladi.
    """
    user_result = await db.execute(select(User).where(User.email == body.email))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Email yoki kod noto'g'ri")

    token_result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.code    == body.code,
            PasswordResetToken.used    == False,
        )
    )
    token_obj = token_result.scalar_one_or_none()

    if not token_obj:
        raise HTTPException(status_code=400, detail="Kod noto'g'ri yoki allaqachon ishlatilgan")

    if datetime.now(timezone.utc) > token_obj.expires_at:
        raise HTTPException(status_code=400, detail="Kod muddati tugagan. Qayta so'rang")

    return {
        "reset_token": token_obj.token,
        "message": "Kod tasdiqlandi! Endi yangi parolingizni kiriting.",
    }


# ── 3. Reset Password ─────────────────────────────────────────────────────────
@router.post("/reset-password", summary="Yangi parol o'rnatish")
@limiter.limit("10/minute")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    reset_token va yangi parol qabul qiladi.
    Token faqat bir marta ishlatilishi mumkin.
    """
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Parol kamida 6 ta belgidan iborat bo'lsin")

    token_result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token == body.reset_token,
            PasswordResetToken.used  == False,
        )
    )
    token_obj = token_result.scalar_one_or_none()

    if not token_obj:
        raise HTTPException(status_code=400, detail="Token yaroqsiz yoki allaqachon ishlatilgan")

    if datetime.now(timezone.utc) > token_obj.expires_at:
        raise HTTPException(status_code=400, detail="Token muddati tugagan")

    # Parolni yangilash
    user_result = await db.execute(select(User).where(User.id == token_obj.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    user.password_hash = hash_password(body.new_password)
    token_obj.used = True   # tokenni o'chirib qo'yamiz

    await db.commit()
    logger.info(f"Parol tiklandi: {user.email}")

    return {"message": "Parol muvaffaqiyatli yangilandi! Endi kiring.", "success": True}
