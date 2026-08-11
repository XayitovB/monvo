"""Kunlik DB backup → Telegram.

Strategiya:
  1. `pg_dump` orqali to'liq SQL dump (--clean --if-exists)
  2. gzip -9 bilan siqamiz (~10x compression)
  3. Telegram bot orqali admin chat'ga document sifatida yuboramiz

Telegram fayl chegaralari:
  - Bot API: 50 MiB upload (bizning hozirgi DB ~10 MB, yiliga ~100 MB
    bo'lishi mumkin — yetarli)
  - Premium akkountlar 2 GB gacha qabul qiladi (kelajakda kerak bo'lsa)

Backup nomi: `monvo_backup_YYYYMMDD_HHMMSS.sql.gz` (Tashkent vaqti)

Telegram sozlamalari `app_settings.telegram_*` ustunlarida — ya'ni
admin paneldan yoqib qo'yilgan bot/chat ishlatiladi (waitlist xabarlari
bilan bir xil).

Restore qilish uchun (server'da):
    gunzip -c monvo_backup_*.sql.gz | psql $DATABASE_URL
"""
from __future__ import annotations

import asyncio
import os
import tempfile
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings


# Telegram Bot API'dan document upload chegarasi (50 MiB).
# Premium bot'lar 2 GiB qabul qiladi, lekin oddiy bot uchun cheklov.
_MAX_TELEGRAM_BYTES = 50 * 1024 * 1024


def _libpq_url(url: str) -> str:
    """SQLAlchemy dialect prefiksini olib tashlab libpq formatga keltiradi."""
    for prefix in ("postgresql+asyncpg://", "postgres+asyncpg://"):
        if url.startswith(prefix):
            return "postgresql://" + url[len(prefix):]
    return url


async def _pg_dump_gzipped(out_path: str) -> int:
    """`pg_dump | gzip` — ikki subprocess'ni quvur orqali ulaymiz.

    Pure-Python gzip butun dump'ni xotirada saqlashni talab qilar edi
    (10-100 MB), bu esa worker'ni o'ldirishi mumkin. Subprocess pipe
    bilan oqim sifatida yozish — xotira-xavfsiz.

    Returns: yozilgan baytlar soni.
    """
    url = _libpq_url(settings.DATABASE_URL)

    # Output faylga `gzip -9` natijasini yo'naltiramiz.
    with open(out_path, "wb") as out_f:
        # pg_dump ➜ stdout (pipe) ➜ gzip stdin
        dump_proc = await asyncio.create_subprocess_exec(
            "pg_dump",
            "--no-owner",
            "--no-privileges",
            "--clean",
            "--if-exists",
            "--format=plain",
            url,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        gzip_proc = await asyncio.create_subprocess_exec(
            "gzip", "-9c",
            stdin=dump_proc.stdout,
            stdout=out_f,
            stderr=asyncio.subprocess.PIPE,
        )
        # Quvurda dump_proc.stdout endi gzip_proc'niki — biz ham yopamiz.
        if dump_proc.stdout:
            dump_proc.stdout.close()  # noqa: SLF001 (asyncio idiom)

        # Ikkala protsessning tugashini kutamiz.
        _, dump_err = await dump_proc.communicate()
        _, gzip_err = await gzip_proc.communicate()

        if dump_proc.returncode != 0:
            raise RuntimeError(
                f"pg_dump xato (rc={dump_proc.returncode}): "
                f"{(dump_err or b'')[:300].decode(errors='replace')}"
            )
        if gzip_proc.returncode != 0:
            raise RuntimeError(
                f"gzip xato (rc={gzip_proc.returncode}): "
                f"{(gzip_err or b'')[:300].decode(errors='replace')}"
            )

    return os.path.getsize(out_path)


async def _telegram_upload_document(
    *, token: str, chat_id: str, file_path: str, file_name: str, caption: str
) -> tuple[bool, str]:
    """Faylni Telegram chat'ga document sifatida yuklaydi."""
    api_url = f"https://api.telegram.org/bot{token}/sendDocument"
    timeout = httpx.Timeout(connect=10.0, read=180.0, write=180.0, pool=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            with open(file_path, "rb") as f:
                files = {"document": (file_name, f, "application/gzip")}
                data = {
                    "chat_id": chat_id,
                    "caption": caption,
                    "parse_mode": "HTML",
                }
                r = await client.post(api_url, data=data, files=files)
        if r.status_code != 200:
            return False, f"http_{r.status_code}: {r.text[:200]}"
        body = r.json()
        if not body.get("ok"):
            return False, f"telegram_api: {body.get('description', '?')[:200]}"
        return True, "ok"
    except Exception as e:  # noqa: BLE001
        return False, f"exception: {type(e).__name__}: {str(e)[:200]}"


def _human_bytes(n: int) -> str:
    if n >= 1024 * 1024:
        return f"{n / (1024 * 1024):.2f} MB"
    if n >= 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


def _tashkent_now() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=5)


async def run_daily_backup(db: AsyncSession) -> tuple[bool, str]:
    """`pg_dump` ➜ gzip ➜ Telegram. Returns (ok, info_string).

    Telegram sozlamalari `app_settings.telegram_*` da bo'lishi shart.
    Bo'sh bo'lsa skip qiladi (no-op), bu xato hisoblanmaydi.
    """
    from core.telegram import _load_settings  # noqa: PLC0415
    cfg = await _load_settings(db)
    if not cfg or not cfg["token"] or not cfg["chat_id"]:
        return False, "telegram_not_configured"
    # `enabled=False` bo'lsa ham backup yuboriladi (admin kritik infra).

    ts_local = _tashkent_now().strftime("%Y%m%d_%H%M%S")
    fname = f"monvo_backup_{ts_local}.sql.gz"

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".sql.gz", prefix="monvo_bk_")
    os.close(tmp_fd)

    try:
        size = await _pg_dump_gzipped(tmp_path)
        if size > _MAX_TELEGRAM_BYTES:
            # Telegram limit. Adminga ogohlantirish yuboramiz, lekin
            # backup mahalliy faylda saqlanmaydi (server diskini bosib
            # qolmasligi uchun). Real ish: S3 / Backblaze B2 ga ko'chish.
            return False, f"too_large_{_human_bytes(size)}"

        caption = (
            "💾 <b>Monvo DB Backup</b>\n"
            f"📅 {ts_local} (Asia/Tashkent)\n"
            f"📦 {_human_bytes(size)}\n"
            f"🌐 {settings.APP_ENV}\n"
            "🤖 Auto-daily"
        )
        ok, info = await _telegram_upload_document(
            token=cfg["token"],
            chat_id=cfg["chat_id"],
            file_path=tmp_path,
            file_name=fname,
            caption=caption,
        )
        if not ok:
            return False, info
        return True, f"sent_{_human_bytes(size)}"
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


async def notify_backup_failure(db: AsyncSession, reason: str) -> None:
    """Backup yiqilganda admin'ga ogohlantirish yuboradi (faylsiz xabar)."""
    try:
        from core.telegram import send_telegram_message
        text = (
            "🚨 <b>Backup MUVAFFAQIYATSIZ</b>\n"
            f"📅 {_tashkent_now().strftime('%Y-%m-%d %H:%M')} (Tashkent)\n"
            f"❌ Sabab: <code>{reason[:300]}</code>\n"
            "Iltimos serverda <code>pg_dump</code> va Telegram credentials'larni tekshiring."
        )
        await send_telegram_message(db, text, force=True)
    except Exception as e:  # noqa: BLE001
        logger.error(f"backup failure notify itself failed: {e}")
