"""
routers/notifications.py
─────────────────────────
Foydalanuvchi bildirishnomalari (in-app, FCM emas).

GET    /notifications              — mening bildirishnomalarim
PATCH  /notifications/{id}/read    — bitta o'qilgan deb belgilash
POST   /notifications/read-all     — barchasini o'qilgan deb belgilash
DELETE /notifications/{id}         — o'chirish
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from models import User, UserNotification

router = APIRouter(prefix="/notifications", tags=["🔔 Notifications"])


@router.get("", summary="Mening bildirishnomalarim")
async def list_notifications(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    """User ga yo'naltirilgan + broadcast (user_id=null) bildirishnomalar."""
    q = (
        select(UserNotification)
        .where(or_(UserNotification.user_id == user.id, UserNotification.user_id.is_(None)))
        .order_by(UserNotification.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "body": n.body,
            "icon": n.icon,
            "category": getattr(n, "category", "info") or "info",
            "image_url": getattr(n, "image_url", "") or "",
            "route": getattr(n, "route", "") or "",
            "route_id": getattr(n, "route_id", "") or "",
            "is_read": n.is_read,
            "is_broadcast": n.user_id is None,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]


@router.patch("/{notif_id}/read", summary="Bitta o'qilgan")
async def mark_read(
    notif_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    n = (await db.execute(
        select(UserNotification).where(UserNotification.id == notif_id)
    )).scalar_one_or_none()
    if not n:
        raise HTTPException(404, "Topilmadi")
    # Faqat o'zining yoki broadcast bo'lgan
    if n.user_id is not None and n.user_id != user.id:
        raise HTTPException(403, "Ruxsat yo'q")
    n.is_read = True
    await db.commit()
    return {"ok": True}


@router.post("/read-all", summary="Hammasi o'qilgan")
async def mark_all_read(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(UserNotification)
        .where(or_(UserNotification.user_id == user.id, UserNotification.user_id.is_(None)))
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


@router.delete("/{notif_id}", status_code=204, summary="O'chirish")
async def delete_notif(
    notif_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    n = (await db.execute(
        select(UserNotification).where(UserNotification.id == notif_id)
    )).scalar_one_or_none()
    if not n:
        raise HTTPException(404, "Topilmadi")
    if n.user_id is not None and n.user_id != user.id:
        raise HTTPException(403, "Ruxsat yo'q")
    await db.delete(n)
    await db.commit()
    return None
