"""
routers/merchant_bot.py
─────────────────────────
@Monvo_business_bot — merchant Telegram bot.

Stateless webhook: kelgan har xabarga (ayniqsa /start) inline `web_app` tugmali
javob yuboradi → tugma bosilganda merchant Mini App (/m/) ochiladi.

Customer bot (telegram_bot.py — aiogram, /tg) dan ALOHIDA. Bu yerda aiogram
lifespan / per-worker bot instance kerak emas — webhook to'liq stateless:
update keladi, httpx orqali sendMessage qilinadi, tamom. Shu sabab istalgan
uvicorn worker'da ishlaydi.

Endpoints:
  POST /merchant-bot/webhook   — Telegram update qabul qilish
"""
import os

import httpx
from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import Response
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.bot_users import record_bot_user
from database import get_db

router = APIRouter(prefix="/merchant-bot", tags=["🤖 Merchant Bot"])


def _webapp_url() -> str:
    base = (settings.FRONTEND_URL or "https://monvo.uz").rstrip("/")
    return f"{base}/m/"


_BANNER_VER: str | None = None


def _banner_url() -> str:
    # Telegram rasmni URL bo'yicha keshlaydi — fayl o'zgarsa ham eski versiyani
    # ko'rsataveradi. `?v=<mtime>` bilan har banner yangilanganda Telegram'ni
    # majburan qayta yuklashga majbur qilamiz.
    global _BANNER_VER
    if _BANNER_VER is None:
        try:
            _BANNER_VER = str(int(os.path.getmtime(os.path.join("landing", "branding", "merchant-bot-banner.png"))))
        except OSError:
            _BANNER_VER = "0"
    base = (settings.FRONTEND_URL or "https://monvo.uz").rstrip("/")
    return f"{base}/branding/merchant-bot-banner.png?v={_BANNER_VER}"


def _reply_parts(lang: str) -> tuple[str, dict]:
    """Caption matni + inline web_app tugmali klaviatura."""
    ru = (lang or "").startswith("ru")
    text = (
        "👋 <b>Monvo Business</b> — merchant paneli.\n"
        "Ilovani ochish uchun pastdagi tugmani bosing."
        if not ru else
        "👋 <b>Monvo Business</b> — панель мерчанта.\n"
        "Нажмите кнопку ниже, чтобы открыть приложение."
    )
    btn = "🟢 Ilovani ochish" if not ru else "🟢 Открыть приложение"
    kb = {"inline_keyboard": [[{"text": btn, "web_app": {"url": _webapp_url()}}]]}
    return text, kb


@router.post("/webhook")
async def merchant_bot_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
):
    token = (settings.MERCHANT_BOT_TOKEN or "").strip()
    if not token:
        return Response(status_code=503)

    secret = (settings.MERCHANT_BOT_WEBHOOK_SECRET or "").strip()
    if secret and x_telegram_bot_api_secret_token != secret:
        return Response(status_code=403)

    try:
        body = await request.json()
    except Exception:
        return Response()

    msg = body.get("message") or body.get("edited_message")
    if not msg or not msg.get("chat"):
        return Response()  # callback_query va h.k. — e'tiborsiz

    chat_id = msg["chat"]["id"]
    frm = msg.get("from") or {}
    lang = frm.get("language_code") or "uz"
    # Bot foydalanuvchisini qayd qilamiz (admin paneldagi ro'yxat uchun).
    await record_bot_user(
        db, "merchant", frm.get("id"),
        username=frm.get("username", "") or "",
        first_name=frm.get("first_name", "") or "",
        last_name=frm.get("last_name", "") or "",
        language_code=frm.get("language_code", "") or "",
    )
    text, kb = _reply_parts(lang)
    api = f"https://api.telegram.org/bot{token}"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            # Banner rasm + caption + inline web_app tugma.
            r = await client.post(f"{api}/sendPhoto", json={
                "chat_id": chat_id,
                "photo": _banner_url(),
                "caption": text,
                "parse_mode": "HTML",
                "reply_markup": kb,
            })
            ok = False
            try:
                ok = r.status_code == 200 and r.json().get("ok", False)
            except Exception:
                ok = False
            if not ok:
                # Rasm yetib bormasa — faqat matn + tugma.
                logger.warning(f"merchant-bot sendPhoto fallback: {r.status_code} {r.text[:200]}")
                await client.post(f"{api}/sendMessage", json={
                    "chat_id": chat_id, "text": text,
                    "parse_mode": "HTML", "reply_markup": kb,
                })
    except Exception as e:  # noqa: BLE001
        logger.warning(f"merchant-bot send xato: {e}")
    return Response()
