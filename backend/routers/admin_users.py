"""
routers/admin_users.py
─────────────────────
User management endpointlari (admin panel).

  GET    /admin/users
  GET    /admin/users/{user_id}
  PATCH  /admin/users/{user_id}/toggle
  DELETE /admin/users/{user_id}
  PATCH  /admin/users/{user_id}/role
  GET    /admin/users/export
"""
import csv
import io

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.admin_audit import log_admin_action
from core.dependencies import get_current_admin
from core.security import hash_password
from database import get_db
from models import AuditLog, Card, FCMToken, Merchant, Reward, Transaction, User

users_router = APIRouter(tags=["🔧 Admin"])


async def _admin_get_user_detail_impl(user_id: int, db: AsyncSession):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Foydalanuvchi topilmadi")

    card_rows = (await db.execute(
        select(Card, Merchant)
        .join(Merchant, Merchant.id == Card.merchant_id)
        .where(Card.user_id == user.id)
        .order_by(Card.issued_at.desc().nullslast())
    )).all()

    card_ids = [c.id for c, _ in card_rows]

    tx_rows = []
    if card_ids:
        tx_rows = (await db.execute(
            select(Transaction, Card, Merchant, Reward)
            .join(Card, Card.id == Transaction.card_id)
            .join(Merchant, Merchant.id == Transaction.merchant_id)
            .outerjoin(Reward, Reward.id == Transaction.reward_id)
            .where(Card.user_id == user.id)
            .order_by(Transaction.created_at.desc())
            .limit(200)
        )).all()

    # Bizneslar ro'yxati avval KARTALARDAN quriladi (har karta = shu biznesga
    # a'zolik). Aks holda tranzaksiyasi yo'q, lekin kartasi bor merchant
    # ko'rinmaydi — "0 biznes" degan noto'g'ri natija chiqadi.
    def _blank_merchant(mid, name, logo, brand, card_points=None):
        return {
            "merchant_id": mid,
            "merchant_name": name,
            "merchant_logo": logo,
            "brand_color": brand,
            "points_earned": 0,
            "points_redeemed": 0,
            "total_spend": 0.0,
            "tx_count": 0,
            "card_points": card_points,
            "first_tx": None,
            "last_tx": None,
        }

    by_merchant: dict[int, dict] = {}
    for c, mc in card_rows:
        by_merchant[mc.id] = _blank_merchant(
            mc.id, mc.business_name, mc.logo_url, mc.brand_color, c.points
        )

    for tx, card, merchant, reward in tx_rows:
        m = by_merchant.setdefault(
            merchant.id,
            _blank_merchant(merchant.id, merchant.business_name, merchant.logo_url, merchant.brand_color),
        )
        if tx.tx_type == "earn":
            m["points_earned"] += tx.points_delta
            m["total_spend"] += float(tx.amount or 0)
        else:
            m["points_redeemed"] += abs(tx.points_delta)
        m["tx_count"] += 1
        ts = tx.created_at.isoformat() if tx.created_at else None
        if ts and (m["first_tx"] is None or ts < m["first_tx"]):
            m["first_tx"] = ts
        if ts and (m["last_tx"] is None or ts > m["last_tx"]):
            m["last_tx"] = ts

    cards = [
        {
            "card_uid": c.card_uid,
            "points": c.points,
            "tier": c.tier,
            "is_active": c.is_active,
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
            "created_at": c.issued_at.isoformat() if c.issued_at else None,  # frontend mosligi
            "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
            "merchant": {
                "id": m.id,
                "business_name": m.business_name,
                "logo_url": m.logo_url,
                "brand_color": m.brand_color,
            },
        }
        for c, m in card_rows
    ]

    history = [
        {
            "id": tx.id,
            "card_uid": card.card_uid,
            "merchant_id": merchant.id,
            "merchant_name": merchant.business_name,
            "reward_title": reward.title if reward else None,
            "tx_type": tx.tx_type,
            "points_delta": tx.points_delta,
            "amount": float(tx.amount or 0),
            "note": tx.note or "",
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
        }
        for tx, card, merchant, reward in tx_rows
    ]

    audit_rows = (await db.execute(
        select(AuditLog)
        .where(AuditLog.user_id == user.id)
        .order_by(AuditLog.timestamp.desc())
        .limit(100)
    )).scalars().all()
    activity = [
        {
            "action": a.action,
            "actor": a.actor,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
            "ip": getattr(a, "ip", None) or None,
            "user_agent": getattr(a, "user_agent", None) or None,
            "platform": getattr(a, "platform", None) or None,
            "os_version": getattr(a, "os_version", None) or None,
            "app_version": getattr(a, "app_version", None) or None,
            "device_model": getattr(a, "device_model", None) or None,
            "device_uid": getattr(a, "device_uid", None) or None,
        }
        for a in audit_rows
    ]
    login_history = [a for a in activity if a["action"] in ("phone_auth", "google_auth", "login")]

    device_rows = (await db.execute(
        select(FCMToken).where(FCMToken.user_id == user.id)
    )).scalars().all()
    devices = [
        {
            "id": d.id,
            "platform": d.platform,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            "token_preview": (d.token[:12] + "…") if d.token else "",
            "source": "push",
        }
        for d in device_rows
    ]

    # Login audit'idagi qurilmalar (FCM token bo'lmasa ham foydalanuvchi qaysi
    # qurilmadan kirganini ko'rsatadi). device_uid bo'yicha dedup.
    _seen_uids: set[str] = set()
    for a in activity:
        duid = a.get("device_uid")
        if not duid or duid in _seen_uids:
            continue
        _seen_uids.add(duid)
        devices.append({
            "id": f"audit:{duid}",
            "platform": a.get("platform") or "unknown",
            "device_model": a.get("device_model"),
            "os_version": a.get("os_version"),
            "app_version": a.get("app_version"),
            "updated_at": a.get("timestamp"),
            "token_preview": "",
            "source": "login",
        })

    # Telegram bot — foydalanuvchi bot orqali kirgan bo'lsa, uni ham "qurilma"
    # (sessiya) sifatida ko'rsatamiz.
    if getattr(user, "telegram_id", None):
        from models import TelegramBotUser
        bot_rows = (await db.execute(
            select(TelegramBotUser).where(TelegramBotUser.telegram_id == str(user.telegram_id))
        )).scalars().all()
        for b in bot_rows:
            devices.append({
                "id": f"tg:{b.id}",
                "platform": "telegram",
                "device_model": "Monvo Business bot" if b.bot == "merchant" else "Monvo User bot",
                "os_version": (f"@{b.username}" if b.username else None),
                "app_version": f"{b.message_count or 0} xabar",
                "created_at": b.first_seen.isoformat() if b.first_seen else None,
                "updated_at": b.last_seen.isoformat() if b.last_seen else None,
                "token_preview": "",
                "source": "telegram",
            })

    total_earned = sum(m["points_earned"] for m in by_merchant.values())
    total_redeemed = sum(m["points_redeemed"] for m in by_merchant.values())
    total_spend = sum(m["total_spend"] for m in by_merchant.values())

    return {
        "user": {
            "id": user.id,
            "name": user.name,
            "phone": getattr(user, "phone", None),
            "email": user.email,
            "role": getattr(user, "role", "user"),
            "language": getattr(user, "language", "uz"),
            "auth_provider": getattr(user, "auth_provider", "phone"),
            "merchant_account_id": getattr(user, "merchant_account_id", None),
            "birth_date": user.birth_date.isoformat() if getattr(user, "birth_date", None) else None,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            # So'nggi kirish — login audit'idan (eng oxirgi phone/google/login).
            "last_login_at": (login_history[0]["timestamp"] if login_history else None),
        },
        "totals": {
            "cards_count": len(cards),
            "merchants_count": len(by_merchant),
            "points_earned": total_earned,
            "points_redeemed": total_redeemed,
            "points_balance": sum(c["points"] for c in cards),
            "total_spend": total_spend,
            "tx_count": len(history),
        },
        "cards": cards,
        "merchants": list(by_merchant.values()),
        "history": history,
        "devices": devices,
        "activity": activity,
        "login_history": login_history,
    }


@users_router.get("/users", summary="Customer foydalanuvchilar")
async def admin_get_users(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    search: str = Query(""),
    role: str = Query(""),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    base_q = select(User)
    if search.strip():
        like = f"%{search.strip()}%"
        base_q = base_q.where(
            (User.name.ilike(like)) | (User.email.ilike(like)) | (User.phone.ilike(like))
        )
    if role.strip() and role in ("user", "merchant", "admin"):
        base_q = base_q.where(User.role == role)

    total = (await db.execute(select(sa_func.count()).select_from(base_q.subquery()))).scalar_one()
    result = await db.execute(base_q.order_by(User.id.desc()).limit(limit).offset(offset))
    users = result.scalars().all()

    # So'nggi aktivlik — login audit + karta ishlatish maksimumi (2 group-by query).
    user_ids = [u.id for u in users]
    last_active: dict[int, "datetime"] = {}
    if user_ids:
        audit_rows = (await db.execute(
            select(AuditLog.user_id, sa_func.max(AuditLog.timestamp))
            .where(AuditLog.user_id.in_(user_ids))
            .group_by(AuditLog.user_id)
        )).all()
        for uid, ts in audit_rows:
            if ts:
                last_active[uid] = ts
        card_rows = (await db.execute(
            select(Card.user_id, sa_func.max(Card.last_used_at))
            .where(Card.user_id.in_(user_ids), Card.last_used_at.is_not(None))
            .group_by(Card.user_id)
        )).all()
        for uid, ts in card_rows:
            if ts and (uid not in last_active or ts > last_active[uid]):
                last_active[uid] = ts

    data = [
        {
            "id": u.id,
            "name": u.name,
            "phone": getattr(u, "phone", None),
            "email": u.email,
            "role": getattr(u, "role", "user"),
            "language": getattr(u, "language", "uz"),
            "region": getattr(u, "region", "") or "",
            "merchant_account_id": getattr(u, "merchant_account_id", None),
            "auth_provider": getattr(u, "auth_provider", "phone"),
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_active_at": last_active[u.id].isoformat() if u.id in last_active else None,
        }
        for u in users
    ]
    return JSONResponse(
        content=data,
        headers={
            "X-Total-Count": str(total),
            "X-Page-Limit": str(limit),
            "X-Page-Offset": str(offset),
        },
    )


@users_router.get("/users/export", summary="Users CSV export")
async def export_users(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(User).order_by(User.id))).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "name", "email", "auth_provider", "is_active", "created_at"])
    for u in rows:
        w.writerow([u.id, u.name, u.email, u.auth_provider, u.is_active, u.created_at.isoformat()])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=users.csv"})


@users_router.get("/users/{user_id}", summary="Foydalanuvchi batafsil")
async def admin_get_user_detail(
    user_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await _admin_get_user_detail_impl(user_id, db)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"user detail failed user_id={user_id}: {type(e).__name__}: {e}")
        raise HTTPException(500, f"Foydalanuvchi xatosi: {type(e).__name__}: {str(e)[:200]}")


class _AdminTxIn(BaseModel):
    card_uid: str = Field(min_length=1)
    tx_type: str = Field(pattern="^(earn|redeem)$")
    points: int = Field(gt=0, le=10_000_000)
    amount: float = Field(default=0, ge=0)
    note: str = Field(default="", max_length=300)  # izoh (comment)


@users_router.post("/users/{user_id}/transactions", status_code=201,
                   summary="Foydalanuvchiga qo'lda tranzaksiya qo'shish (izoh bilan)")
async def admin_add_transaction(
    user_id: int,
    body: _AdminTxIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin foydalanuvchining kartasiga qo'lda ball qo'shadi yoki ayiradi.

    Tier (daraja) tizimi ishlatilmaydi — faqat ball balansi o'zgaradi.
    """
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Foydalanuvchi topilmadi")

    card = (await db.execute(
        select(Card).where(Card.card_uid == body.card_uid, Card.user_id == user.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi yoki bu foydalanuvchiga tegishli emas")

    if body.tx_type == "earn":
        delta = body.points
        card.points = (card.points or 0) + body.points
    else:  # redeem
        if (card.points or 0) < body.points:
            raise HTTPException(400, "Kartada yetarli ball yo'q")
        delta = -body.points
        card.points = (card.points or 0) - body.points

    tx = Transaction(
        card_id=card.id,
        merchant_id=card.merchant_id,
        tx_type=body.tx_type,
        points_delta=delta,
        amount=body.amount or 0,
        note=body.note or "",
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)

    log_admin_action(
        admin,
        f"add_transaction user_id={user.id} card={body.card_uid} "
        f"type={body.tx_type} points={body.points}",
    )
    return {
        "id": tx.id,
        "tx_type": tx.tx_type,
        "points_delta": tx.points_delta,
        "card_points": card.points,
        "note": tx.note,
    }


@users_router.patch("/users/{user_id}/toggle", summary="User holatini o'zgartirish")
async def admin_toggle_user(
    user_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    user.is_active = not user.is_active
    await db.commit()
    log_admin_action(admin, f"toggle_user user_id={user.id} is_active={user.is_active}")
    return {"is_active": user.is_active}


@users_router.delete("/users/{user_id}", summary="User o'chirish")
async def admin_delete_user(
    user_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Foydalanuvchi topilmadi")
    log_admin_action(admin, f"delete_user user_id={user.id} phone={user.phone} email={user.email}")
    await db.delete(user)
    await db.commit()
    return {"message": "O'chirildi"}


@users_router.patch("/users/{user_id}/role", summary="User role o'zgartirish")
async def admin_change_role(
    user_id: int,
    role: str = Body(..., embed=True),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    new_role = role.strip()
    if new_role not in ("user", "admin"):
        raise HTTPException(400, "Role faqat: user yoki admin. Merchant rolini Merchants bo'limidan biznes orqali tayinlang.")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Foydalanuvchi topilmadi")

    if getattr(user, "role", "user") == "merchant" and new_role != "merchant":
        user.merchant_account_id = None

    user.role = new_role

    if new_role == "admin" and not getattr(user, "merchant_account_id", None):
        import uuid, hashlib
        biz_name = f"{user.name or user.phone or 'Biznes'} Shop"
        tmp_email = f"merchant_{user_id}_{uuid.uuid4().hex[:6]}@monvo.internal"
        tmp_hash = hashlib.sha256(uuid.uuid4().bytes).hexdigest()
        merchant = Merchant(
            business_name=biz_name,
            email=tmp_email,
            password_hash=tmp_hash,
            phone=user.phone or "",
        )
        db.add(merchant)
        await db.flush()
        user.merchant_account_id = merchant.id
        logger.success(f"Admin merchant akkaunt yaratildi: user_id={user_id}, merchant_id={merchant.id}")

    elif new_role == "user":
        user.merchant_account_id = None

    await db.commit()
    log_admin_action(admin, f"change_role user_id={user_id} new_role={new_role}")
    return {
        "user_id": user_id,
        "role": user.role,
        "merchant_account_id": getattr(user, "merchant_account_id", None),
    }
