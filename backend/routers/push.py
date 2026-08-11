"""
routers/push.py
───────────────
POST   /push/register    — FCM token ro'yxatdan o'tkazish
DELETE /push/unregister  — FCM token o'chirish (logout)
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from models import FCMToken, User
from schemas import FCMTokenRegister

router = APIRouter(prefix="/push", tags=["🔔 Push"])


@router.post(
    "/register",
    summary="FCM token ro'yxatdan o'tkazish",
    description="Flutter ilova login bo'lgandan keyin FCM tokenni backendga yuboradi.",
    status_code=201,
)
async def register_fcm_token(
    body: FCMTokenRegister,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Foydalanuvchi qurilmasining FCM tokenini saqlaydi yoki yangilaydi.
    Bir foydalanuvchi bir necha qurilmadan kirishi mumkin.
    """
    existing = await db.execute(
        select(FCMToken).where(
            FCMToken.user_id == user.id,
            FCMToken.token == body.token,
        )
    )
    fcm = existing.scalar_one_or_none()
    if fcm:
        fcm.platform = body.platform
        fcm.updated_at = datetime.now(timezone.utc)
    else:
        db.add(FCMToken(
            user_id=user.id,
            token=body.token,
            platform=body.platform,
        ))
    await db.commit()
    logger.info(f"FCM token: user={user.email} platform={body.platform}")
    return {"message": "FCM token registered"}


@router.post("/debug", summary="Push diagnostika (vaqtinchalik)")
async def push_debug(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Ilova push registratsiyasi holatini yuboradi — server logiga yoziladi."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    logger.warning(f"📱 PUSH-DEBUG user={user.email} {data}")
    return {"ok": True}


@router.delete("/unregister", summary="FCM token o'chirish (logout)")
async def unregister_fcm_token(
    token: str = Query(..., description="O'chirilishi kerak bo'lgan FCM token"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FCMToken).where(
            FCMToken.user_id == user.id,
            FCMToken.token == token,
        )
    )
    fcm = result.scalar_one_or_none()
    if fcm:
        await db.delete(fcm)
        await db.commit()
    return {"message": "FCM token removed"}
