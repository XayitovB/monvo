"""
routers/admin_settings.py
──────────────────────────
App sozlamalari, Telegram va backup endpointlari.

  GET   /admin/app-settings
  PATCH /admin/app-settings
  POST  /admin/telegram/test
  POST  /admin/backup/run-now
"""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from loguru import logger
from sqlalchemy import select, text as _text
from sqlalchemy.ext.asyncio import AsyncSession

from core.admin_audit import log_admin_action
from core.dependencies import get_current_admin
from database import get_db

settings_router = APIRouter(tags=["🔧 Admin"])


# Process davomida bir marta — har so'rovda ALTER TABLE (ACCESS EXCLUSIVE
# lock) ishlatib, lock navbatida app_settings'ni bloklab qo'ymasligi uchun.
_appset_columns_ready = False


async def _ensure_gamification_column(db: AsyncSession) -> None:
    global _appset_columns_ready
    if _appset_columns_ready:
        return
    # DDL cheksiz bloklanmasin — lock 3s ichida olinmasa o'tib ketadi.
    try:
        await db.execute(_text("SET LOCAL lock_timeout = '3s'"))
    except Exception:
        pass
    stmts = [
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "gamification_enabled BOOLEAN NOT NULL DEFAULT true",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "telegram_bot_token VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "telegram_chat_id VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "telegram_enabled BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "payme_merchant_id VARCHAR(100) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "payme_key VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "payme_test_key VARCHAR(200) NOT NULL DEFAULT ''",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "payme_test_mode BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS "
        "payme_checkout_url VARCHAR(200) NOT NULL DEFAULT 'https://checkout.paycom.uz'",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS update_latest_build_ios INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS update_min_build_ios INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS update_latest_build_android INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS update_min_build_android INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS merchant_update_latest_build_ios INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS merchant_update_min_build_ios INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS merchant_update_latest_build_android INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS merchant_update_min_build_android INTEGER NOT NULL DEFAULT 0",
    ]
    ok = True
    for sql in stmts:
        try:
            await db.execute(_text(sql))
            await db.commit()
        except Exception as e:
            ok = False
            logger.warning(f"ensure_app_settings_column skipped ({sql[:60]}…): {e}")
            try:
                await db.rollback()
            except Exception:
                pass
    if ok:
        _appset_columns_ready = True


def _mask(val: str) -> str:
    if not val:
        return ""
    tail = val[-4:] if len(val) >= 4 else val
    return f"••••{tail}"


def _serialize_app_settings(row) -> dict:
    raw_token = getattr(row, "telegram_bot_token", "") or ""
    raw_key = getattr(row, "payme_key", "") or ""
    raw_test_key = getattr(row, "payme_test_key", "") or ""
    return {
        "app_name": row.app_name,
        "logo_url": row.logo_url,
        "primary_color": row.primary_color,
        "gamification_enabled": getattr(row, "gamification_enabled", True),
        "telegram_enabled": bool(getattr(row, "telegram_enabled", False)),
        "telegram_chat_id": getattr(row, "telegram_chat_id", "") or "",
        "telegram_bot_token_masked": _mask(raw_token),
        "telegram_bot_token_set": bool(raw_token),
        "payme_merchant_id": getattr(row, "payme_merchant_id", "") or "",
        "payme_key_masked": _mask(raw_key),
        "payme_key_set": bool(raw_key),
        "payme_test_key_masked": _mask(raw_test_key),
        "payme_test_key_set": bool(raw_test_key),
        "payme_test_mode": bool(getattr(row, "payme_test_mode", False)),
        "payme_checkout_url": getattr(row, "payme_checkout_url", "https://checkout.paycom.uz") or "https://checkout.paycom.uz",
        "update_latest_build_ios": int(getattr(row, "update_latest_build_ios", 0) or 0),
        "update_min_build_ios": int(getattr(row, "update_min_build_ios", 0) or 0),
        "update_latest_build_android": int(getattr(row, "update_latest_build_android", 0) or 0),
        "update_min_build_android": int(getattr(row, "update_min_build_android", 0) or 0),
        "merchant_update_latest_build_ios": int(getattr(row, "merchant_update_latest_build_ios", 0) or 0),
        "merchant_update_min_build_ios": int(getattr(row, "merchant_update_min_build_ios", 0) or 0),
        "merchant_update_latest_build_android": int(getattr(row, "merchant_update_latest_build_android", 0) or 0),
        "merchant_update_min_build_android": int(getattr(row, "merchant_update_min_build_android", 0) or 0),
        "updated_at": row.updated_at,
    }


@settings_router.get("/app-settings", summary="App sozlamalari")
async def get_app_settings(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from models import AppSettings
    await _ensure_gamification_column(db)
    row = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
    if not row:
        row = AppSettings(id=1)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return _serialize_app_settings(row)


@settings_router.patch("/app-settings", summary="App sozlamalarini yangilash")
async def update_app_settings(body: dict, admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from models import AppSettings
    await _ensure_gamification_column(db)
    row = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
    if not row:
        row = AppSettings(id=1)
        db.add(row)
    if "app_name" in body and body["app_name"]:
        row.app_name = str(body["app_name"])[:100]
    if "logo_url" in body:
        row.logo_url = str(body["logo_url"])[:500]
    if "primary_color" in body:
        row.primary_color = str(body["primary_color"])[:10]
    if "gamification_enabled" in body:
        row.gamification_enabled = bool(body["gamification_enabled"])
    if "telegram_enabled" in body:
        row.telegram_enabled = bool(body["telegram_enabled"])
    if "telegram_chat_id" in body:
        row.telegram_chat_id = str(body["telegram_chat_id"] or "")[:100].strip()
    token_changed = False
    if "telegram_bot_token" in body:
        token_val = body["telegram_bot_token"]
        if token_val == "__clear__":
            row.telegram_bot_token = ""
            token_changed = True
        elif isinstance(token_val, str) and token_val.strip():
            row.telegram_bot_token = token_val.strip()[:200]
            token_changed = True
    if "payme_merchant_id" in body:
        row.payme_merchant_id = str(body["payme_merchant_id"] or "")[:100].strip()
    if "payme_key" in body:
        v = body["payme_key"]
        if v == "__clear__":
            row.payme_key = ""
        elif isinstance(v, str) and v.strip():
            row.payme_key = v.strip()[:200]
    if "payme_test_key" in body:
        v = body["payme_test_key"]
        if v == "__clear__":
            row.payme_test_key = ""
        elif isinstance(v, str) and v.strip():
            row.payme_test_key = v.strip()[:200]
    if "payme_test_mode" in body:
        row.payme_test_mode = bool(body["payme_test_mode"])
    if "payme_checkout_url" in body and body["payme_checkout_url"]:
        row.payme_checkout_url = str(body["payme_checkout_url"])[:200].strip()
    # Ilova yangilanish modali sozlamalari (build raqamlari)
    for fld in ("update_latest_build_ios", "update_min_build_ios",
                "update_latest_build_android", "update_min_build_android",
                "merchant_update_latest_build_ios", "merchant_update_min_build_ios",
                "merchant_update_latest_build_android", "merchant_update_min_build_android"):
        if fld in body:
            try:
                setattr(row, fld, max(0, int(body[fld] or 0)))
            except (TypeError, ValueError):
                pass
    row.updated_by = admin.get("sub", "admin")
    await db.commit()
    await db.refresh(row)
    from core.cache import cache_delete_prefix
    await cache_delete_prefix("app_config")

    # Token o'zgargan bo'lsa aiogram chatbot ni qayta tushir (yangi token bilan)
    if token_changed:
        try:
            from routers.telegram_bot import bot_reload
            await bot_reload()
        except Exception as e:
            from loguru import logger
            logger.warning(f"bot_reload xato: {e}")

    log_admin_action(admin, f"update_app_settings name={row.app_name} color={row.primary_color} gamification={getattr(row, 'gamification_enabled', True)} tg={getattr(row, 'telegram_enabled', False)}")
    return _serialize_app_settings(row)


@settings_router.post("/upload-image", summary="Rasm yuklash (push/banner) → https URL")
async def upload_image(file: UploadFile = File(...), admin=Depends(get_current_admin)):
    """Rasmni media papkaga saqlaydi va public https URL qaytaradi.
    Push banner (FCM image) https URL bo'lishi shart — shuning uchun base64 emas."""
    import os as _os
    import uuid as _uuid
    fname = file.filename or ""
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else "jpg"
    if ext not in ("jpg", "jpeg", "png", "webp", "gif"):
        raise HTTPException(400, "Faqat rasm: jpg, png, webp yoki gif")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Rasm 10 MB dan katta bo'lmasin")
    _os.makedirs("media/uploads", exist_ok=True)
    name = f"{_uuid.uuid4().hex}.{ext}"
    with open(f"media/uploads/{name}", "wb") as f:
        f.write(data)
    return {"url": f"https://monvo.uz/media/uploads/{name}"}


@settings_router.get("/telegram/bot-info", summary="Ulangan bot @username (getMe)")
async def telegram_bot_info(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from core.telegram import get_bot_username
    ok, info = await get_bot_username(db)
    return {"ok": ok, "username": info if ok else "", "error": "" if ok else info}


@settings_router.post("/telegram/test", summary="Telegramga test xabar yuborish")
async def telegram_test(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from core.telegram import send_telegram_message
    await _ensure_gamification_column(db)
    text = (
        "✅ <b>Monvo admin paneldan test xabar</b>\n\n"
        f"Kimdan: <code>{admin.get('sub', 'admin')}</code>\n"
        "Agar bu xabarni olsangiz — bot to'g'ri sozlangan."
    )
    ok, info = await send_telegram_message(db, text, force=True)
    return {"ok": ok, "info": info}


@settings_router.post("/backup/run-now", summary="DB backup'ni hozir yuborish (Telegram)")
async def backup_run_now(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    from core.db_backup import run_daily_backup
    ok, info = await run_daily_backup(db)
    return {"ok": ok, "info": info}
