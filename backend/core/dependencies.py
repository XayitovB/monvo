"""
core/dependencies.py
────────────────────
FastAPI Depends() lar bir joyda:
  - get_current_user   (JWT → User)
  - get_current_admin  (Admin JWT → payload)
  - log_action         (AuditLog — background da yozadi, so'rovni to'xtatmaydi)
"""
import asyncio
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, AsyncSessionLocal
from models import AuditLog, Merchant, MerchantStaff, User
from core.security import (
    decode_access_token,
    decode_admin_token,
    decode_merchant_token,
    decode_staff_token,
)
from core.token_revocation import is_revoked

# ── OAuth2 schemes ─────────────────────────────────────────────────────────────
oauth2_scheme          = OAuth2PasswordBearer(tokenUrl="/auth/login")
merchant_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/merchants/login",
    scheme_name="MerchantBearer",
    auto_error=False,
)
admin_oauth2_scheme    = OAuth2PasswordBearer(
    tokenUrl="/admin/login",
    scheme_name="AdminBearer",
    auto_error=False,
)
staff_oauth2_scheme    = OAuth2PasswordBearer(
    tokenUrl="/branches/staff/login",
    scheme_name="StaffBearer",
    auto_error=False,
)


# ── User Dependency ────────────────────────────────────────────────────────────
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    JWT token orqali hozirgi foydalanuvchini qaytaradi.
    - 401 — token yaroqsiz yoki muddati tugagan
    - 401 — foydalanuvchi o'chirilgan
    - 403 — hisob bloklangan
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id: int = int(payload.get("sub"))
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    if await is_revoked(payload.get("jti")):
        raise credentials_exception

    from sqlalchemy import select
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=401, detail="User not found or deleted")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled. Contact support.")
    return user


# ── Merchant Dependency ────────────────────────────────────────────────────────
async def get_current_merchant(
    token: str = Depends(merchant_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Merchant:
    """JWT token orqali hozirgi merchantni qaytaradi."""
    if not token:
        raise HTTPException(status_code=401, detail="Merchant token required")
    try:
        payload = decode_merchant_token(token)
        merchant_id: int = int(payload.get("sub"))
        if merchant_id is None or payload.get("role") != "merchant":
            raise HTTPException(status_code=401, detail="Invalid merchant token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if await is_revoked(payload.get("jti")):
        raise HTTPException(status_code=401, detail="Token revoked")

    from sqlalchemy import select
    result = await db.execute(select(Merchant).where(Merchant.id == merchant_id))
    merchant = result.scalar_one_or_none()
    if merchant is None:
        raise HTTPException(status_code=401, detail="Merchant not found")
    if not merchant.is_active:
        raise HTTPException(status_code=403, detail="Merchant account disabled")
    return merchant


# ── Staff Dependency ───────────────────────────────────────────────────────────
async def get_current_staff(
    token: str = Depends(staff_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> MerchantStaff:
    """Filial xodimini JWT orqali qaytaradi."""
    if not token:
        raise HTTPException(status_code=401, detail="Staff token required")
    try:
        payload = decode_staff_token(token)
        if payload.get("role") != "staff":
            raise HTTPException(status_code=401, detail="Invalid staff token")
        staff_id = int(payload.get("sub"))
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if await is_revoked(payload.get("jti")):
        raise HTTPException(status_code=401, detail="Token revoked")

    from sqlalchemy import select
    result = await db.execute(select(MerchantStaff).where(MerchantStaff.id == staff_id))
    staff = result.scalar_one_or_none()
    if staff is None:
        raise HTTPException(status_code=401, detail="Staff not found")
    if not staff.is_active:
        raise HTTPException(status_code=403, detail="Staff account disabled")
    return staff


# Ruxsat etilgan admin rollari to'plami
_VALID_ADMIN_ROLES = {"admin", "super_admin", "support", "analyst", "marketing"}


# ── Admin Dependency ───────────────────────────────────────────────────────────
async def get_current_admin(token: str = Depends(admin_oauth2_scheme)) -> dict:
    """Admin JWT tokenini tekshiradi. Multi-admin: payload.admin_role yoki legacy role."""
    if not token:
        raise HTTPException(401, "Admin token required")
    try:
        payload = decode_admin_token(token)
    except JWTError:
        raise HTTPException(401, "Invalid admin token")

    if await is_revoked(payload.get("jti")):
        raise HTTPException(401, "Token revoked")

    # admin_role ustunligi bor (yangi tokenlar), bo'lmasa legacy role
    role = payload.get("admin_role") or payload.get("role")
    if role not in _VALID_ADMIN_ROLES:
        raise HTTPException(403, "Not an admin")
    return payload


# ── Role-based admin access ──────────────────────────────────────────────────
ADMIN_ROLES = ("super_admin", "support", "analyst", "marketing")


def require_admin_role(*allowed_roles: str):
    """
    Role-based access dependency factory.

    Super-admin (legacy .env login) doim hamma narsaga ruxsatga ega.
    AdminUser (DB'dan) faqat o'z roliga tegishli endpointlarga kira oladi.

    Misol:
        @router.get("/finance")
        async def finance(admin = Depends(require_admin_role("super_admin", "analyst"))):
            ...
    """
    async def _check(admin: dict = Depends(get_current_admin)) -> dict:
        # Legacy .env admin (sub == "admin", role == "admin") — doim super_admin teng
        role = admin.get("admin_role") or admin.get("role")
        if role == "admin":  # legacy
            return admin
        if role == "super_admin":
            return admin
        if role in allowed_roles:
            return admin
        raise HTTPException(403, f"Bu amal uchun quyidagi rol kerak: {', '.join(allowed_roles)}")

    return _check


# ── Audit Log — FIX 3: Background da yozadi, request ni to'xtatmaydi ──────────
async def _write_audit_log(user_id: int, action: str, meta: dict | None = None) -> None:
    """
    Alohida DB sessiyada audit log yozadi.
    asyncio.create_task() orqali chaqirilgani uchun HTTP response
    kutib turmasdan darhol qaytadi.
    """
    try:
        async with AsyncSessionLocal() as session:
            m = meta or {}
            session.add(
                AuditLog(
                    user_id=user_id,
                    action=action,
                    timestamp=datetime.now(timezone.utc),
                    ip=str(m.get("ip", ""))[:45],
                    user_agent=str(m.get("user_agent", ""))[:500],
                    platform=str(m.get("platform", ""))[:20],
                    os_version=str(m.get("os_version", ""))[:40],
                    app_version=str(m.get("app_version", ""))[:40],
                    device_model=str(m.get("device_model", ""))[:100],
                    device_uid=str(m.get("device_uid", ""))[:80],
                    extra=m.get("extra") or {},
                )
            )
            await session.commit()
    except Exception as exc:
        # Log yozish xatosi butun requestni buzmasligi kerak
        logger.warning(f"Audit log yozishda xato (user={user_id}, action={action}): {exc}")


async def log_action(
    db: AsyncSession,
    user_id: int,
    action: str,
    meta: dict | None = None,
) -> None:
    """
    Foydalanuvchi harakatini audit_log jadvaliga **background** da yozadi.

    Optional `meta` argumenti — IP, qurilma, geo, va h.k. saqlash uchun.
    """
    asyncio.ensure_future(_write_audit_log(user_id, action, meta))
