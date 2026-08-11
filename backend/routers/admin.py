"""
routers/admin.py
────────────────
Super-admin panel endpointlari (platforma egasi uchun).
Barcha /admin/* routerlari shu yerda yig'iladi.

Sub-routerlar:
  admin_users.py      — foydalanuvchilar boshqaruvi
  admin_merchants.py  — merchantlar boshqaruvi
  admin_analytics.py  — statistika va analitika
  admin_data.py       — kartalar, rewardlar, tranzaksiyalar
  admin_push_mgmt.py  — push bildirishnomalar
  admin_settings.py   — app sozlamalari, telegram, backup
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from core.login_security import (
    maybe_alert_new_device,
    record_login_attempt,
    safe_str_compare,
    safe_verify_password,
)
from core.security import create_admin_token
from database import get_db
from routers.admin_users import users_router
from routers.admin_merchants import merchants_router
from routers.admin_analytics import analytics_router
from routers.admin_data import data_router
from routers.admin_push_mgmt import push_router
from routers.admin_settings import settings_router

router = APIRouter(prefix="/admin", tags=["🔧 Admin"])

router.include_router(users_router)
router.include_router(merchants_router)
router.include_router(analytics_router)
router.include_router(data_router)
router.include_router(push_router)
router.include_router(settings_router)


@router.post("/login", summary="Admin login")
async def admin_login(request: Request, db: AsyncSession = Depends(get_db)):
    """JSON yoki form-urlencoded kiruvchi ma'lumotlarni qabul qiladi.

    Brute-force va account-enumeration himoyasi:
      - Constant-time string compare (timing-attack'dan himoya)
      - Audit log (har urinish — muvaffaqiyatli + muvaffaqiyatsiz)
      - Yangi qurilmadan login → admin email manzilga ogohlantirish
    """
    ctype = request.headers.get("content-type", "")
    try:
        if "application/json" in ctype:
            data = await request.json()
        else:
            form = await request.form()
            data = {"username": form.get("username", ""), "password": form.get("password", "")}
    except Exception:
        raise HTTPException(400, "Invalid request body")

    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    user_ok = safe_str_compare(username, settings.ADMIN_USERNAME)
    pw_ok = safe_str_compare(password, settings.ADMIN_PASSWORD)
    safe_verify_password(password, None)

    if not (user_ok and pw_ok):
        await record_login_attempt(
            db, identifier=username, role="admin",
            success=False, request=request,
            error_reason="bad_credentials",
        )
        logger.warning(f"Admin login muvaffaqiyatsiz: {username}")
        raise HTTPException(401, "Admin ma'lumotlari noto'g'ri")

    notify_to = (settings.ADMIN_ALERT_EMAIL or settings.SMTP_USER or "").strip()
    await maybe_alert_new_device(
        db,
        request=request,
        identifier=username,
        role="admin",
        user_id=None,
        notify_email=notify_to or None,
    )

    await record_login_attempt(
        db, identifier=username, role="admin",
        success=True, request=request,
    )

    token = create_admin_token({"sub": "admin", "role": "admin"})
    logger.success(f"Admin login: {username}")
    return {"access_token": token, "token_type": "bearer"}
