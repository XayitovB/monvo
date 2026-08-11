"""
core/security.py
────────────────
JWT token yaratish/tekshirish, parol hashing.
Barcha authentication mantiqini bir joyda ushlab turadi.

Token xavfsizligi:
  - Har bir token turida `token_type` claim bor.
  - decode_* funksiyalari `token_type` ni tekshiradi — bir turdagi
    token boshqa turdagi endpoint'da ishlamaydi.
  - Admin tokenlar alohida ADMIN_SECRET_KEY bilan imzolangan.
"""
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from config import settings


def _new_jti() -> str:
    """Token uchun unique identifikator (logout/revocation blacklist'i uchun)."""
    return uuid.uuid4().hex

# ── Password hashing ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────
def create_access_token(data: dict) -> str:
    """Foydalanuvchi uchun JWT token yaratadi."""
    payload = data.copy()
    if "sub" in payload:
        payload["sub"] = str(payload["sub"])
    payload["token_type"] = "user"
    payload.setdefault("jti", _new_jti())
    payload["exp"] = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_admin_token(data: dict) -> str:
    """Admin uchun JWT token yaratadi (24 soatlik)."""
    payload = data.copy()
    if "sub" in payload:
        payload["sub"] = str(payload["sub"])
    payload["token_type"] = "admin"
    payload.setdefault("jti", _new_jti())
    payload["exp"] = datetime.now(timezone.utc) + timedelta(hours=24)
    return jwt.encode(payload, settings.ADMIN_SECRET_KEY, algorithm=settings.ALGORITHM)


def create_merchant_token(data: dict) -> str:
    """Merchant uchun JWT token yaratadi (7 kunlik)."""
    payload = data.copy()
    if "sub" in payload:
        payload["sub"] = str(payload["sub"])
    payload["role"] = "merchant"
    payload["token_type"] = "merchant"
    payload.setdefault("jti", _new_jti())
    payload["exp"] = datetime.now(timezone.utc) + timedelta(days=7)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_staff_token(staff_id: int, merchant_id: int, branch_id: int | None) -> str:
    """Filial xodimi (staff) uchun JWT — 30 kunlik."""
    payload = {
        "sub": str(staff_id),
        "role": "staff",
        "token_type": "staff",
        "merchant_id": merchant_id,
        "branch_id": branch_id,
        "jti": _new_jti(),
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("token_type") not in ("user", None):
        # None — eski tokenlar uchun backward-compat (token_type yo'q edi)
        raise JWTError("Invalid token type")
    return payload


def decode_admin_token(token: str) -> dict:
    payload = jwt.decode(token, settings.ADMIN_SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("token_type") not in ("admin", None):
        raise JWTError("Invalid token type")
    return payload


def decode_merchant_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("token_type") not in ("merchant", None):
        raise JWTError("Invalid token type")
    return payload


def decode_staff_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    if payload.get("token_type") not in ("staff", None):
        raise JWTError("Invalid token type")
    return payload
