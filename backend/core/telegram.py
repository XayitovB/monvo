"""
core/telegram.py
────────────────
Telegram bot orqali xabar yuborish.
Sozlamalar (token, chat_id, on/off) `app_settings` jadvalida saqlanadi va
admin panel orqali boshqariladi.
"""
import httpx
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import AppSettings


async def _load_settings(db: AsyncSession):
    row = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
    if not row:
        return None
    return {
        "enabled": bool(getattr(row, "telegram_enabled", False)),
        "token": (getattr(row, "telegram_bot_token", "") or "").strip(),
        "chat_id": (getattr(row, "telegram_chat_id", "") or "").strip(),
    }


async def send_telegram_message(db: AsyncSession, text: str, *, force: bool = False) -> tuple[bool, str]:
    """
    Telegramga xabar yuboradi. Returns (ok, info).

    `force=True` bo'lsa `enabled=False` bo'lsa ham yuboradi (test uchun).
    Token yoki chat_id bo'sh bo'lsa — hech qachon yubormaydi.
    """
    cfg = await _load_settings(db)
    if not cfg:
        return False, "settings_not_initialized"
    if not cfg["token"] or not cfg["chat_id"]:
        return False, "token_or_chat_id_missing"
    if not force and not cfg["enabled"]:
        return False, "telegram_disabled"

    url = f"https://api.telegram.org/bot{cfg['token']}/sendMessage"
    payload = {
        "chat_id": cfg["chat_id"],
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(url, json=payload)
        if r.status_code == 200 and r.json().get("ok"):
            return True, "sent"
        # Telegram API odatda xato sababi 'description' maydonida qaytaradi.
        try:
            desc = r.json().get("description", "")
        except Exception:
            desc = r.text[:200]
        logger.warning(f"telegram sendMessage failed: {r.status_code} {desc}")
        return False, f"telegram_api_error: {desc or r.status_code}"
    except Exception as e:
        logger.warning(f"telegram send exception: {e}")
        return False, f"exception: {e}"


async def get_bot_username(db: AsyncSession) -> tuple[bool, str]:
    """Saqlangan bot tokenidan @username oladi (Telegram getMe).
    (ok, username | error_reason) qaytaradi."""
    cfg = await _load_settings(db)
    if not cfg or not cfg["token"]:
        return False, "token_missing"
    url = f"https://api.telegram.org/bot{cfg['token']}/getMe"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(url)
        data = r.json()
        if r.status_code == 200 and data.get("ok"):
            return True, (data.get("result", {}).get("username") or "")
        return False, str(data.get("description") or r.status_code)
    except Exception as e:
        logger.warning(f"telegram getMe exception: {e}")
        return False, f"exception: {e}"


def format_demo_lead(lead) -> str:
    """Yangi demo zayafkasini Telegram uchun HTML formatda formatlash."""
    def esc(v: str) -> str:
        return (str(v or "—")
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;"))
    return (
        "🆕 <b>Yangi demo zayafka</b>\n\n"
        f"👤 <b>Ism:</b> {esc(lead.name)}\n"
        f"📱 <b>Telefon:</b> {esc(lead.phone)}\n"
        f"🏢 <b>Biznes:</b> {esc(lead.business_name)}\n"
        f"📂 <b>Tur:</b> {esc(lead.business_type)}\n"
        f"🔗 <b>Manba:</b> {esc(lead.source)}\n"
        f"🆔 ID: <code>{lead.id}</code>"
    )
