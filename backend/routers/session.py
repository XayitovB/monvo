"""
routers/session.py
───────────────────
Logout endpoint'lari — JWT'ni blacklist'ga qo'shib bekor qiladi (revocation).

Har endpoint o'z token turini decode qiladi, `jti` va `exp` ni oladi va
`token_revocation.revoke()` orqali muddati tugaguncha bekor qiladi. `jti`
yo'q eski token'lar uchun no-op (orqaga moslik).
"""
from fastapi import APIRouter, Depends
from jose import JWTError

from core.dependencies import (
    admin_oauth2_scheme,
    merchant_oauth2_scheme,
    oauth2_scheme,
    staff_oauth2_scheme,
)
from core.security import (
    decode_access_token,
    decode_admin_token,
    decode_merchant_token,
    decode_staff_token,
)
from core.token_revocation import revoke

router = APIRouter(tags=["🔐 Auth"])


async def _revoke_payload(payload: dict) -> dict:
    await revoke(payload.get("jti"), payload.get("exp"))
    return {"detail": "Tizimdan chiqildi", "revoked": bool(payload.get("jti"))}


@router.post("/auth/logout", summary="Foydalanuvchi chiqishi (token bekor qilinadi)")
async def user_logout(token: str = Depends(oauth2_scheme)):
    try:
        payload = decode_access_token(token)
    except JWTError:
        return {"detail": "Token allaqachon yaroqsiz", "revoked": False}
    return await _revoke_payload(payload)


@router.post("/merchants/logout", summary="Merchant chiqishi")
async def merchant_logout(token: str = Depends(merchant_oauth2_scheme)):
    if not token:
        return {"detail": "Token yo'q", "revoked": False}
    try:
        payload = decode_merchant_token(token)
    except JWTError:
        return {"detail": "Token allaqachon yaroqsiz", "revoked": False}
    return await _revoke_payload(payload)


@router.post("/admin/logout", summary="Admin chiqishi")
async def admin_logout(token: str = Depends(admin_oauth2_scheme)):
    if not token:
        return {"detail": "Token yo'q", "revoked": False}
    try:
        payload = decode_admin_token(token)
    except JWTError:
        return {"detail": "Token allaqachon yaroqsiz", "revoked": False}
    return await _revoke_payload(payload)


@router.post("/branches/staff/logout", summary="Filial xodimi chiqishi")
async def staff_logout(token: str = Depends(staff_oauth2_scheme)):
    if not token:
        return {"detail": "Token yo'q", "revoked": False}
    try:
        payload = decode_staff_token(token)
    except JWTError:
        return {"detail": "Token allaqachon yaroqsiz", "revoked": False}
    return await _revoke_payload(payload)
