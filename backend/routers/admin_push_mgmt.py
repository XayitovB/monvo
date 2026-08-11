"""
routers/admin_push_mgmt.py
──────────────────────────
Admin push notification endpointlari.

  POST  /admin/push/audience-count
  POST  /admin/push/send
  GET   /admin/push/logs
  GET   /admin/push/stats
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.admin_audit import log_admin_action
from core.dependencies import get_current_admin
from core.fcm import is_firebase_ready, send_fcm_multicast
from database import get_db
from models import FCMToken, Merchant, PushNotificationLog, User, UserNotification
from schemas import PushNotificationLogOut, PushSendRequest

push_router = APIRouter(tags=["🔧 Admin"])


async def _resolve_push_audience(body: PushSendRequest, db: AsyncSession):
    # "Yagona" — telefon raqam orqali (user_id o'rniga, qulayroq)
    if getattr(body, "user_phone", None):
        from core.pos_engine import normalize_phone
        ph = normalize_phone(body.user_phone) or body.user_phone.strip()
        uid = (await db.execute(
            select(User.id).where(User.phone == ph)
        )).scalar_one_or_none()
        if uid:
            return f"phone:{ph}", [uid]
        return f"phone:{ph}:topilmadi", []
    if body.user_id:
        return f"user:{body.user_id}", [body.user_id]

    audience = (body.audience or "all").lower()

    if audience == "merchants":
        q = (
            select(User.id)
            .join(Merchant, Merchant.id == User.merchant_account_id)
            .where(User.is_active.is_(True))
        )

        if body.tariff_id is not None:
            q = q.where(Merchant.tariff_id == body.tariff_id)

        ts = (body.tariff_status or "").lower()
        now = datetime.now(timezone.utc)
        if ts == "paid":
            q = q.where(
                Merchant.tariff_id.is_not(None),
                Merchant.tariff_expires_at.is_not(None),
                Merchant.tariff_expires_at > now,
            )
        elif ts == "unpaid":
            q = q.where(Merchant.tariff_id.is_(None))
        elif ts == "expired":
            q = q.where(
                Merchant.tariff_id.is_not(None),
                Merchant.tariff_expires_at.is_not(None),
                Merchant.tariff_expires_at <= now,
            )

        rows = (await db.execute(q)).scalars().all()
        label = f"merchants:{ts or 'all'}"
        if body.tariff_id is not None:
            label += f":t{body.tariff_id}"
        return label, list(rows)

    if audience == "users":
        role = (body.role or "user").lower()
        rows = (await db.execute(
            select(User.id).where(User.is_active.is_(True), User.role == role)
        )).scalars().all()
        return f"users:{role}", list(rows)

    rows = (await db.execute(
        select(User.id).where(User.is_active.is_(True))
    )).scalars().all()
    return "all", list(rows)


class _AudienceCountRequest(BaseModel):
    user_id: int | None = None
    user_phone: str | None = None
    audience: str | None = None
    role: str | None = None
    tariff_status: str | None = None
    tariff_id: int | None = None


@push_router.post("/push/audience-count", summary="Audience filterlari uchun olquvchi soni")
async def admin_push_audience_count(
    body: _AudienceCountRequest,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    fake = PushSendRequest(
        title="preview", body="preview",
        user_id=body.user_id, user_phone=body.user_phone,
        audience=body.audience, role=body.role,
        tariff_status=body.tariff_status, tariff_id=body.tariff_id,
    )
    label, user_ids = await _resolve_push_audience(fake, db)
    if not user_ids:
        return {"target": label, "user_count": 0, "token_count": 0}
    result = await db.execute(
        select(sa_func.count(FCMToken.id)).where(FCMToken.user_id.in_(user_ids))
    )
    token_count = int(result.scalar() or 0)
    return {"target": label, "user_count": len(user_ids), "token_count": token_count}


@push_router.post("/push/send", summary="Push bildirishnoma yuborish")
async def admin_send_push(
    body: PushSendRequest,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    target, user_ids = await _resolve_push_audience(body, db)
    if not user_ids:
        raise HTTPException(404, "Bu segmentda hech kim topilmadi")

    # Log yozuvini avval yaratamiz — uning id'si kampaniya (o'qilgan stats) uchun.
    log = PushNotificationLog(
        title=body.title, body=body.body, target=target,
        sent_count=0, failed_count=0, sent_by="admin",
    )
    db.add(log)
    await db.flush()  # log.id ni olamiz
    campaign_id = log.id

    # FCM data payload — bosilganda yo'naltirish uchun
    push_data = {k: str(v) for k, v in (body.data or {}).items()}
    push_data["category"] = body.category or "info"
    if body.route:
        push_data["route"] = body.route
    if body.route_id:
        push_data["route_id"] = body.route_id
    push_data["campaign_id"] = str(campaign_id)

    total_sent, total_failed = 0, 0
    if is_firebase_ready():
        result = await db.execute(
            select(FCMToken.token).where(FCMToken.user_id.in_(user_ids))
        )
        tokens = [r[0] for r in result.all()]
        BATCH = 500
        for i in range(0, len(tokens), BATCH):
            s, f = await send_fcm_multicast(
                tokens[i: i + BATCH],
                title=body.title,
                body=body.body,
                data=push_data,
                image=body.image_url or "",
            )
            total_sent += s
            total_failed += f
    log.sent_count = total_sent
    log.failed_count = total_failed

    # Ilova ichidagi "Bildirishnomalar" bo'limida ham ko'rinsin (push o'chiq
    # bo'lsa yoki token bo'lmasa ham — foydalanuvchi ilovani ochganda ko'radi).
    db.add_all([
        UserNotification(
            user_id=uid, title=body.title, body=body.body,
            category=body.category or "info", image_url=body.image_url or "",
            route=body.route or "", route_id=body.route_id or "",
            campaign_id=campaign_id,
        )
        for uid in user_ids
    ])
    await db.commit()
    log_admin_action(admin, f"push_send target={target} title={body.title[:50]} sent={total_sent} failed={total_failed}")
    return {
        "target": target, "recipients": len(user_ids),
        "sent": total_sent, "failed": total_failed, "campaign_id": campaign_id,
    }


@push_router.get("/push/logs", summary="Push tarixi (o'qilgan statistikasi bilan)")
async def admin_push_logs(
    limit: int = Query(100, le=500),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(PushNotificationLog).order_by(PushNotificationLog.sent_at.desc()).limit(limit)
    )).scalars().all()
    ids = [r.id for r in rows]
    recip_map: dict = {}
    read_map: dict = {}
    if ids:
        res = await db.execute(
            select(
                UserNotification.campaign_id,
                sa_func.count(UserNotification.id),
                sa_func.count().filter(UserNotification.is_read.is_(True)),
            )
            .where(UserNotification.campaign_id.in_(ids))
            .group_by(UserNotification.campaign_id)
        )
        for cid, total, readc in res.all():
            recip_map[cid] = int(total or 0)
            read_map[cid] = int(readc or 0)
    return [
        {
            "id": r.id, "title": r.title, "body": r.body, "target": r.target,
            "sent_count": r.sent_count, "failed_count": r.failed_count,
            "recipients": recip_map.get(r.id, 0),
            "read_count": read_map.get(r.id, 0),
            "sent_by": getattr(r, "sent_by", ""),
            "sent_at": r.sent_at.isoformat() if getattr(r, "sent_at", None) else None,
        }
        for r in rows
    ]


@push_router.get("/push/stats", summary="FCM token statistikasi")
async def admin_push_stats(
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(select(sa_func.count(FCMToken.id)))).scalar() or 0
    android = (await db.execute(
        select(sa_func.count(FCMToken.id)).where(FCMToken.platform == "android")
    )).scalar() or 0
    ios = (await db.execute(
        select(sa_func.count(FCMToken.id)).where(FCMToken.platform == "ios")
    )).scalar() or 0
    unique_users = (await db.execute(
        select(sa_func.count(sa_func.distinct(FCMToken.user_id)))
    )).scalar() or 0
    return {
        "total_tokens": total,
        "unique_users": unique_users,
        "android": android,
        "ios": ios,
        "web": total - android - ios,
        "firebase_enabled": is_firebase_ready(),
    }
