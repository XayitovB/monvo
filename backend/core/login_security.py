"""Login xavfsizligi: constant-time verify, audit log, yangi-qurilma alerti.

Bu modul `routers/merchants.py` va `routers/admin.py` login flow'larini
brute-force va account-enumeration hujumlaridan himoya qiladi:

  1. Constant-time password verify — har doim bcrypt ishlaydi (foydalanuvchi
     mavjud yoki mavjud emas), shu bilan timing-attack imkoniyatini olib tashlaydi.
  2. Generic xato xabari — "Email yoki parol noto'g'ri" (qaysi maydon
     noto'g'ri ekanini oshkora qilmaydi).
  3. Login attempt audit — har urinish (muvaffaqiyatli + muvaffaqiyatsiz)
     `login_attempts` jadvaliga yoziladi (IP, User-Agent bilan).
  4. Yangi qurilma alerti — agar muvaffaqiyatli login `identifier`+`ip` jufti
     ilgari ko'rilmagan bo'lsa, foydalanuvchiga email yuboriladi.
"""
from __future__ import annotations

import asyncio
import hmac as _hmac
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.security import hash_password, verify_password
from models import LoginAttempt


# Bir martalik dummy bcrypt hash — foydalanuvchi topilmaganda ham bcrypt
# ishlaydi va ~150ms ishlaydi (bcrypt rounds=12), shu bilan timing
# farq qilmaydi.
_DUMMY_HASH: Optional[str] = None


def _get_dummy_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password("dummy_password_for_constant_time_protection")
    return _DUMMY_HASH


def safe_verify_password(password: str, real_hash: Optional[str]) -> bool:
    """Constant-time parol tekshiruvi.

    `real_hash` None bo'lsa ham bcrypt ishlaydi (dummy hash bilan), keyin False
    qaytariladi. Shu bilan login xato javobi vaqti foydalanuvchi mavjud yoki
    mavjud emasligiga bog'liq emas.
    """
    if real_hash:
        return verify_password(password, real_hash)
    # Foydalanuvchi yo'q — vaqt bcrypt ishlatib o'xshashlash
    verify_password(password, _get_dummy_hash())
    return False


def safe_str_compare(a: str, b: str) -> bool:
    """Constant-time string solishtirish (admin parolida ishlatiladi)."""
    return _hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def client_ip(request: Request) -> str:
    """Reverse proxy ortidan ham IP'ni olish."""
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def client_ua(request: Request) -> str:
    return (request.headers.get("user-agent") or "")[:500]


# ── Audit ──────────────────────────────────────────────────────────────────
async def record_login_attempt(
    db: AsyncSession,
    *,
    identifier: str,
    role: str,
    success: bool,
    request: Request,
    user_id: Optional[int] = None,
    error_reason: str = "",
) -> None:
    """Login urinishni `login_attempts` jadvaliga yozish (best-effort)."""
    try:
        row = LoginAttempt(
            identifier=(identifier or "")[:200],
            role=role,
            user_id=user_id,
            success=bool(success),
            error_reason=error_reason[:40],
            ip=client_ip(request)[:45],
            user_agent=client_ua(request),
        )
        db.add(row)
        await db.commit()
    except Exception as e:  # noqa: BLE001
        logger.warning(f"login_security: attempt record failed: {e}")
        try:
            await db.rollback()
        except Exception:
            pass


async def is_known_login(
    db: AsyncSession,
    *,
    identifier: str,
    ip: str,
    role: str,
) -> bool:
    """Ushbu (identifier, ip) jufti ilgari muvaffaqiyatli login qilganmi?

    Muvaffaqiyatli login yozuvi mavjud bo'lsa — "ma'lum qurilma".
    """
    if not identifier or not ip:
        return True  # IP yo'q bo'lsa yangi-qurilma alerti yubormaymiz
    row = (await db.execute(
        select(LoginAttempt.id).where(
            LoginAttempt.identifier == identifier,
            LoginAttempt.role == role,
            LoginAttempt.success.is_(True),
            LoginAttempt.ip == ip,
        ).limit(1)
    )).scalar_one_or_none()
    return row is not None


# ── Yangi qurilma email alerti ─────────────────────────────────────────────
async def maybe_alert_new_device(
    db: AsyncSession,
    *,
    request: Request,
    identifier: str,
    role: str,
    user_id: Optional[int],
    notify_email: Optional[str],
) -> None:
    """Agar bu IP'dan ilgari muvaffaqiyatli login bo'lmagan bo'lsa, alert yuboradi.

    Audit yozuvi ALERT yuborilishidan oldin bo'lishi mumkin emas — shuning
    uchun bu funksiya `record_login_attempt(success=True)` dan keyin
    chaqirilishi kerak emas. Aksincha — login muvaffaqiyatli aniqlangach,
    audit yozilishidan oldin chaqiramiz.
    """
    if not notify_email:
        return
    ip = client_ip(request)
    known = await is_known_login(db, identifier=identifier, ip=ip, role=role)
    if known:
        return

    # Best-effort email — backgroundda yuboriladi, login javobini bloklamaslik
    asyncio.create_task(_send_login_alert_async(
        to_email=notify_email,
        identifier=identifier,
        role=role,
        ip=ip,
        user_agent=client_ua(request),
        when=datetime.now(timezone.utc),
    ))


async def _send_login_alert_async(
    *,
    to_email: str,
    identifier: str,
    role: str,
    ip: str,
    user_agent: str,
    when: datetime,
) -> None:
    try:
        from core.email_service import send_login_alert_email
        await send_login_alert_email(
            to_email=to_email,
            identifier=identifier,
            role=role,
            ip=ip,
            user_agent=user_agent,
            when=when,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"login_security: alert send failed: {e}")


# ── Stats / brute-force tahlil ─────────────────────────────────────────────
async def recent_failed_count(
    db: AsyncSession,
    *,
    identifier: str,
    role: str,
    minutes: int = 15,
) -> int:
    """So'nggi N daqiqa ichidagi muvaffaqiyatsiz urinishlar soni."""
    from sqlalchemy import func as _f
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    res = await db.execute(
        select(_f.count(LoginAttempt.id)).where(
            LoginAttempt.identifier == identifier,
            LoginAttempt.role == role,
            LoginAttempt.success.is_(False),
            LoginAttempt.created_at >= cutoff,
        )
    )
    return int(res.scalar() or 0)
