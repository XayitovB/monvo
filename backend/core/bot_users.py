"""
core/bot_users.py
─────────────────
Telegram bot foydalanuvchilarini qayd qilish (har ikki bot uchun yagona helper).
Webhook handlerlari har xabarda chaqiradi — upsert (first/last seen, count).
"""
from datetime import datetime, timezone


async def record_bot_user(
    db,
    bot: str,
    telegram_id,
    username: str = "",
    first_name: str = "",
    last_name: str = "",
    language_code: str = "",
) -> None:
    """`telegram_bot_users` jadvaliga upsert. Xato bo'lsa jim yutiladi —
    bot javobini bloklamasligi kerak."""
    from sqlalchemy import select
    from models import TelegramBotUser

    tid = str(telegram_id or "").strip()
    if not tid or bot not in ("customer", "merchant"):
        return
    try:
        row = (await db.execute(
            select(TelegramBotUser).where(
                TelegramBotUser.bot == bot,
                TelegramBotUser.telegram_id == tid,
            )
        )).scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if row is None:
            db.add(TelegramBotUser(
                bot=bot, telegram_id=tid,
                username=username or "", first_name=first_name or "",
                last_name=last_name or "", language_code=language_code or "",
                message_count=1, first_seen=now, last_seen=now,
            ))
        else:
            row.last_seen = now
            row.message_count = (row.message_count or 0) + 1
            if username:
                row.username = username
            if first_name:
                row.first_name = first_name
            if last_name:
                row.last_name = last_name
            if language_code:
                row.language_code = language_code
        await db.commit()
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
