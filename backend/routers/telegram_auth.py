"""
routers/telegram_auth.py
─────────────────────────
Telegram Mini App autentifikatsiyasi.

POST /auth/telegram  — Telegram initData validatsiya + JWT
"""
import hashlib
import hmac
from urllib.parse import parse_qsl, unquote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.security import create_access_token
from database import get_db
from models import User

router = APIRouter(prefix="/auth", tags=["🤖 Telegram"])


class TelegramAuthRequest(BaseModel):
    init_data: str


def _validate_init_data(init_data: str, bot_token: str) -> dict:
    """
    Telegram initData'ni HMAC-SHA256 bilan tekshirish.
    https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
    """
    parsed = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = parsed.pop("hash", None)
    if not received_hash:
        raise ValueError("hash yo'q")

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(parsed.items())
    )

    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise ValueError("hash mos kelmadi")

    return parsed


@router.post("/telegram", summary="Telegram Mini App orqali kirish")
async def telegram_auth(
    body: TelegramAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        raise HTTPException(503, "Telegram bot sozlanmagan")

    try:
        parsed = _validate_init_data(body.init_data, bot_token)
    except ValueError as e:
        raise HTTPException(401, f"Telegram initData yaroqsiz: {e}")

    import json
    tg_user_raw = parsed.get("user")
    if not tg_user_raw:
        raise HTTPException(400, "user ma'lumoti topilmadi")

    tg_user = json.loads(unquote(tg_user_raw))
    tg_id = str(tg_user.get("id", ""))
    first = tg_user.get("first_name", "")
    last = tg_user.get("last_name", "")
    name = f"{first} {last}".strip() or f"tg_{tg_id}"

    # Telegram ID orqali mavjud userni topish yoki yangi yaratish
    user = (await db.execute(
        select(User).where(User.telegram_id == tg_id)
    )).scalar_one_or_none()

    is_new = False
    if not user:
        is_new = True
        user = User(
            name=name,
            telegram_id=tg_id,
            auth_provider="telegram",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    if not user.is_active:
        raise HTTPException(403, "Hisob bloklangan")

    # Mini-app ochilishi = "aktivlik". Admin "So'nggi aktiv" AuditLog'dan
    # o'qiydi. Har ochilishda emas — 10 daqiqada bir marta yozamiz (Redis
    # throttle) ki audit_logs shishib ketmasin.
    try:
        from core.cache import rate_limit_incr
        if await rate_limit_incr(f"miniapp_active:{user.id}", 600) == 1:
            from models import AuditLog
            db.add(AuditLog(
                user_id=user.id, actor=f"user:{user.id}",
                action="miniapp_open", platform="telegram",
            ))
            await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass

    token = create_access_token({"sub": user.id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": user.id,
        "name": user.name,
        "is_new": is_new,
    }
