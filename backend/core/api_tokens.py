"""Merchant API token helperlari.

Token formati:
    kar_live_<24 url-safe random chars>           (production)
    kar_test_<24 url-safe random chars>           (test/sandbox — kelajak)

Saqlash:
  - DB'da faqat `token_hash` (sha256 hex, 64 belgi) — high-entropy random
    token uchun bcrypt shart emas, lookup tezroq.
  - `token_prefix` UI ko'rsatish uchun (token to'liq formatida bo'shliq joyini
    bilish uchun ham yordam beradi).

Token faqat yaratilgan paytda bir marta qaytariladi. Yo'qolsa — yangi token
chiqarish va eskini revoke qilish kerak.

Xavfsizlik bosqichlari:
  - Token expiry — `expires_at` (NULL = cheksiz). O'tib ketgan token 401.
  - Lockout — 10 ta ketma-ket xato urinishdan keyin token 15 daqiqa qulflanadi.
    `locked_until > now` bo'lsa darhol 401, hatto to'g'ri token bo'lsa ham
    (himoya invariantini saqlash uchun emas — siyo'-pattern). Ammo hozirgi
    sxema **per-token** lockout, ya'ni xato urinishlar topilgan token'ga
    yoziladi (notog'ri token aslida tokenni aniqlamaydi — hash topilmaydi —
    shuning uchun lockout faqat REVOKED yoki EXPIRED tokenni qayta-qayta
    ishlatish urinishlari uchun foydalidir).
  - Deferred `last_used_at` write — DB hot-write'ni kamaytirish uchun
    faqat har 60s da yangilanadi.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Merchant, MerchantApiToken


TOKEN_PREFIX_LIVE = "kar_live_"
TOKEN_BODY_BYTES = 24            # 24 baytlik secrets → ~32 url-safe belgi
TOKEN_PREFIX_LEN = 16            # UI ko'rsatish uchun saqlanadigan belgilar soni

# Brute-force lockout sozlamalari
_MAX_FAILED_ATTEMPTS = 10
_LOCKOUT_MINUTES = 15
# `last_used_at` ni har request'da yozmaymiz — 60s'da bir
_LAST_USED_DEBOUNCE_SECONDS = 60
# Per-token rate limit: har token uchun 60 so'rov / daqiqa.
_API_RATE_LIMIT_PER_MIN = 60


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_token() -> tuple[str, str, str]:
    """Yangi token yaratadi.

    Qaytaradi: (full_token, token_prefix, token_hash)
    """
    body = secrets.token_urlsafe(TOKEN_BODY_BYTES)
    full = TOKEN_PREFIX_LIVE + body
    prefix = full[:TOKEN_PREFIX_LEN]
    return full, prefix, _sha256(full)


def hash_token(token: str) -> str:
    return _sha256(token)


def mask_token(prefix: str) -> str:
    """`kar_live_aBcD1234` → `kar_live_aBcD1234……` (UI ko'rinishi)."""
    return f"{prefix}……"


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host or ""
    return ""


def get_api_token_key(request: Request) -> str:
    """slowapi `key_func` — per-token rate limiting kaliti.

    Auth header bor bo'lsa token-hash'ning birinchi 16 belgisini ishlatamiz
    (DB ma'lumotsiz, butun hash kerak emas). Aks holda IP'ga qaytamiz.

    Bu Limiter har token uchun alohida bucket beradi — bir token ko'p IP'lardan
    ishlatilsa ham, aniq token uchun chegara amal qiladi.
    """
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        if token.startswith(TOKEN_PREFIX_LIVE):
            return f"api_tok:{hash_token(token)[:16]}"
    # Fallback — IP. Avtorizatsiyasiz so'rov uchun (401 bo'ladi baribir).
    if request.client:
        return request.client.host or "anon"
    return "anon"


# ── FastAPI dependency: header'dan API tokenni o'qib merchantni qaytarish ──
async def get_api_merchant(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Merchant:
    """`Authorization: Bearer kar_live_...` header'i orqali merchant aniqlash.

    Xavfsizlik tekshiruvlari ketma-ketligi:
      1. Header formati: `Bearer kar_live_…`
      2. DB'da hash topilishi
      3. `revoked_at IS NULL`
      4. `locked_until <= NOW()` (yoki NULL)
      5. `expires_at > NOW()` (yoki NULL)
      6. Merchant aktiv
    Har xato bosqichda 401/403 qaytadi va (agar token aniqlangan bo'lsa)
    `failed_attempts` o'sadi.
    """
    auth = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Bearer token required")
    token = auth[7:].strip()
    if not token.startswith(TOKEN_PREFIX_LIVE):
        raise HTTPException(401, "Invalid token format")

    h = hash_token(token)
    row = (await db.execute(
        select(MerchantApiToken).where(MerchantApiToken.token_hash == h)
    )).scalar_one_or_none()

    if row is None:
        # Hash topilmadi — noma'lum token. Per-IP counter bilan
        # brute-force urinishlarini kuzatamiz va 429 qaytaramiz.
        ip = _client_ip(request)
        try:
            from core.cache import rate_limit_incr  # noqa: PLC0415
            ip_attempts = await rate_limit_incr(f"api_unk:{ip}", 300)  # 5 daqiqalik oyna
            if ip_attempts > 20:
                raise HTTPException(429, "Too many invalid token attempts — try again in 5 minutes")
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(f"api_tokens: unknown-token IP counter failed: {exc}")
        raise HTTPException(401, "Invalid token")

    now = datetime.now(timezone.utc)

    if row.revoked_at is not None:
        await _bump_failed_attempts(db, row, now)
        raise HTTPException(401, "Token revoked")
    if row.locked_until is not None and row.locked_until > now:
        raise HTTPException(401, "Token temporarily locked due to repeated failures")
    if row.expires_at is not None and row.expires_at <= now:
        await _bump_failed_attempts(db, row, now)
        raise HTTPException(401, "Token expired")

    merchant = await db.get(Merchant, row.merchant_id)
    if merchant is None:
        await _bump_failed_attempts(db, row, now)
        raise HTTPException(401, "Merchant not found")
    if not merchant.is_active:
        await _bump_failed_attempts(db, row, now)
        raise HTTPException(403, "Merchant disabled")

    # Per-token rate limit (Redis atomic counter, 60s window).
    # slowapi'dagi global per-IP limiter saqlanib qoladi — bu yana qo'shimcha
    # darajadagi himoya: bir token ko'p IP'lardan ishlatilsa ham token darajasida
    # 60 so'rov/daqiqa chegarasi amal qiladi.
    try:
        from core.cache import rate_limit_incr  # noqa: PLC0415
        count = await rate_limit_incr(f"api_rl:{row.id}", 60)
        if count > _API_RATE_LIMIT_PER_MIN:
            raise HTTPException(
                429,
                f"Rate limit exceeded — {_API_RATE_LIMIT_PER_MIN} requests/minute per token",
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Cache qatlami yiqilsa rate limit'siz davom etamiz (open-fail).
        logger.warning(f"api_tokens: per-token rate limit skipped (cache error): {exc}")

    # Muvaffaqiyatli auth — failed_attempts'ni reset qilamiz va `last_used`'ni
    # debounce qilingan ravishda yangilaymiz.
    try:
        changed = False
        if row.failed_attempts:
            row.failed_attempts = 0
            row.locked_until = None
            changed = True
        # last_used_at — har 60s da bir
        if (
            row.last_used_at is None
            or (now - row.last_used_at).total_seconds() >= _LAST_USED_DEBOUNCE_SECONDS
        ):
            row.last_used_at = now
            row.last_used_ip = _client_ip(request)[:45]
            changed = True
        if changed:
            await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass

    request.state.api_token_id = row.id
    return merchant


async def _bump_failed_attempts(
    db: AsyncSession, row: MerchantApiToken, now: datetime
) -> None:
    """Notog'ri / muddati o'tgan token urinishi — counter va lockout."""
    try:
        row.failed_attempts = (row.failed_attempts or 0) + 1
        if row.failed_attempts >= _MAX_FAILED_ATTEMPTS:
            row.locked_until = now + timedelta(minutes=_LOCKOUT_MINUTES)
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
