"""
routers/admin_data.py
─────────────────────
Cards, rewards, transactions va CSV export endpointlari.

  GET   /admin/cards
  POST  /admin/cards/{card_uid}/adjust
  GET   /admin/rewards
  GET   /admin/transactions
  GET   /admin/cards/export
"""
import csv
import io
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from loguru import logger
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from core.tiers import apply_tier
from database import get_db
from models import Card, Merchant, MerchantBranch, MerchantStaff, Reward, Transaction, User

data_router = APIRouter(tags=["🔧 Admin"])


@data_router.get("/cards", summary="Barcha kartalar")
async def admin_get_cards(
    limit: int = Query(100, le=500),
    offset: int = 0,
    merchant_id: int | None = None,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Card, Merchant.business_name).join(
        Merchant, Merchant.id == Card.merchant_id
    )
    if merchant_id:
        q = q.where(Card.merchant_id == merchant_id)
    q = q.order_by(Card.issued_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(q)).all()
    return [
        {
            "id": c.id,
            "card_uid": c.card_uid,
            "merchant": name,
            "merchant_id": c.merchant_id,
            "holder_name": c.holder_name,
            "points": c.points,
            "tier": c.tier,
            "is_active": c.is_active,
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
        }
        for c, name in rows
    ]


@data_router.post("/cards/{card_uid}/adjust", summary="Admin: kartaga ball qo'shish/ayirish")
async def admin_adjust_card_balance(
    card_uid: str,
    points_delta: int,
    note: str = "Admin tuzatish",
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")

    card.points = (card.points or 0) + points_delta
    apply_tier(card, await db.get(Merchant, card.merchant_id))
    tx = Transaction(
        card_id=card.id,
        merchant_id=card.merchant_id,
        tx_type="earn" if points_delta > 0 else "redeem",
        points_delta=points_delta,
        amount=Decimal("0"),
        note=note[:300],
        applied_rules=[{"rule_type": "admin_adjust", "points": points_delta}],
        provider="admin",
        external_ref=f"admin-adjust:{card.id}",
    )
    db.add(tx)
    await db.commit()
    await db.refresh(card)
    return {"card_uid": card.card_uid, "new_balance": card.points, "delta": points_delta}


@data_router.get("/rewards", summary="Barcha rewardlar")
async def admin_get_rewards(
    limit: int = Query(100, le=500),
    offset: int = 0,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Reward, Merchant.business_name)
        .join(Merchant, Merchant.id == Reward.merchant_id)
        .order_by(Reward.id.desc())
        .limit(limit).offset(offset)
    )).all()
    return [
        {
            "id": r.id,
            "merchant": name,
            "merchant_id": r.merchant_id,
            "title": r.title,
            "points_cost": r.points_cost,
            "stock": r.stock,
            "is_active": r.is_active,
        }
        for r, name in rows
    ]


def _parse_day(s: str | None):
    """'YYYY-MM-DD' → UTC datetime (kun boshi). Xato bo'lsa None."""
    if not s:
        return None
    try:
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


@data_router.get("/transactions", summary="Barcha tranzaksiyalar")
async def admin_get_transactions(
    limit: int = Query(100, le=500),
    offset: int = 0,
    tx_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(
            Transaction, Merchant.business_name, Card.card_uid,
            Card.user_id, Card.holder_name, Card.holder_phone,
            User.name, User.phone,
        )
        .join(Merchant, Merchant.id == Transaction.merchant_id)
        .join(Card, Card.id == Transaction.card_id)
        .outerjoin(User, User.id == Card.user_id)
    )
    if tx_type in ("earn", "redeem"):
        q = q.where(Transaction.tx_type == tx_type)
    # Sana filtri (Bugun / 7 kun / ...). date_to kun OXIRIni o'z ichiga oladi.
    df = _parse_day(date_from)
    if df is not None:
        q = q.where(Transaction.created_at >= df)
    dt = _parse_day(date_to)
    if dt is not None:
        q = q.where(Transaction.created_at < dt + timedelta(days=1))
    q = q.order_by(Transaction.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(q)).all()
    return [
        {
            "id": t.id,
            "merchant": name,
            "card_uid": card_uid,
            "tx_type": t.tx_type,
            "points_delta": t.points_delta,
            "amount": float(t.amount or 0),
            "note": t.note,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            # Kimga berilgani — karta egasi (user) yoki holder ma'lumoti
            "user_id": uid,
            "recipient": uname or holder_name or uphone or holder_phone or "—",
            "recipient_phone": uphone or holder_phone or "",
        }
        for t, name, card_uid, uid, holder_name, holder_phone, uname, uphone in rows
    ]


@data_router.get("/transactions/{tx_id}", summary="Bitta tranzaksiya (batafsil)")
async def admin_get_transaction(
    tx_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(Transaction, Merchant, Card)
        .join(Merchant, Merchant.id == Transaction.merchant_id)
        .join(Card, Card.id == Transaction.card_id)
        .where(Transaction.id == tx_id)
    )).first()
    if not row:
        raise HTTPException(404, "Tranzaksiya topilmadi")
    t, merchant, card = row

    user = None
    if card.user_id:
        user = (await db.execute(select(User).where(User.id == card.user_id))).scalar_one_or_none()

    branch = None
    if t.branch_id:
        branch = (await db.execute(
            select(MerchantBranch).where(MerchantBranch.id == t.branch_id)
        )).scalar_one_or_none()

    staff = None
    if t.staff_id:
        staff = (await db.execute(
            select(MerchantStaff).where(MerchantStaff.id == t.staff_id)
        )).scalar_one_or_none()

    reward = None
    if t.reward_id:
        reward = (await db.execute(select(Reward).where(Reward.id == t.reward_id))).scalar_one_or_none()

    return {
        "id": t.id,
        "tx_type": t.tx_type,
        "points_delta": t.points_delta,
        "amount": float(t.amount or 0),
        "note": t.note or "",
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "applied_rules": t.applied_rules or [],
        "provider": t.provider,
        "external_ref": t.external_ref,
        "merchant": {"id": merchant.id, "business_name": merchant.business_name,
                     "logo_url": merchant.logo_url, "brand_color": merchant.brand_color},
        "card": {"id": card.id, "card_uid": card.card_uid, "points": card.points,
                 "tier": card.tier, "holder_name": card.holder_name, "holder_phone": card.holder_phone},
        "recipient": (
            {"id": user.id, "name": user.name, "phone": user.phone, "email": user.email}
            if user else
            ({"id": None, "name": card.holder_name or "—", "phone": card.holder_phone or "", "email": None})
        ),
        "branch": {"id": branch.id, "name": branch.name} if branch else None,
        "staff": {"id": staff.id, "username": staff.username,
                  "full_name": staff.full_name} if staff else None,
        "reward": {"id": reward.id, "title": reward.title} if reward else None,
    }


@data_router.get("/cards/export", summary="Cards CSV export")
async def export_cards(admin=Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Card).order_by(Card.id))).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "card_uid", "merchant_id", "holder_name", "holder_phone",
                "points", "tier", "is_active", "issued_at"])
    for c in rows:
        w.writerow([c.id, c.card_uid, c.merchant_id, c.holder_name, c.holder_phone,
                    c.points, c.tier, c.is_active,
                    c.issued_at.isoformat() if c.issued_at else ""])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=cards.csv"})


@data_router.get("/bot-users", summary="Telegram bot foydalanuvchilari (har ikki bot, yagona ro'yxat)")
async def admin_bot_users(
    bot: str = Query("", pattern="^(customer|merchant|all|)$"),  # bo'sh/all = ikkala bot
    search: str = "",
    limit: int = Query(500, le=1000),
    offset: int = 0,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import TelegramBotUser, User

    base = select(TelegramBotUser)
    cnt = select(sa_func.count()).select_from(TelegramBotUser)
    if bot in ("customer", "merchant"):
        base = base.where(TelegramBotUser.bot == bot)
        cnt = cnt.where(TelegramBotUser.bot == bot)
    s = search.strip()
    if s:
        like = f"%{s.lower()}%"
        cond = (
            sa_func.lower(TelegramBotUser.username).like(like)
            | sa_func.lower(TelegramBotUser.first_name).like(like)
            | TelegramBotUser.telegram_id.like(f"%{s}%")
        )
        base = base.where(cond)
        cnt = cnt.where(cond)
    try:
        total = (await db.execute(cnt)).scalar() or 0
        rows = (await db.execute(
            base.order_by(TelegramBotUser.last_seen.desc()).limit(limit).offset(offset)
        )).scalars().all()
    except Exception as e:
        # Jadval hali yaratilmagan bo'lsa (migration kutilmoqda) — bo'sh ro'yxat.
        logger.warning(f"bot-users query xato: {type(e).__name__}: {e}")
        try:
            await db.rollback()
        except Exception:
            pass
        return {"total": 0, "items": []}

    # Telefon raqamlarini User jadvalidan telegram_id bo'yicha bog'laymiz
    # (OTP orqali ro'yxatdan o'tganlarda telefon bor).
    tids = [r.telegram_id for r in rows if r.telegram_id]
    phone_by_tid: dict[str, str] = {}
    if tids:
        try:
            urows = (await db.execute(
                select(User.telegram_id, User.phone).where(User.telegram_id.in_(tids))
            )).all()
            phone_by_tid = {str(t): (p or "") for t, p in urows if p}
        except Exception:
            phone_by_tid = {}

    def _lang(code: str) -> str:
        # Ilova faqat uz/ru ni qo'llaydi — Telegram "en" va h.k. ni uz ga keltiramiz.
        return "ru" if (code or "").lower().startswith("ru") else "uz"

    return {
        "total": total,
        "items": [
            {
                "id": r.id,
                "bot": r.bot,
                "telegram_id": r.telegram_id,
                "username": r.username or None,
                "first_name": r.first_name or "",
                "last_name": r.last_name or "",
                "phone": phone_by_tid.get(str(r.telegram_id), ""),
                "language_code": _lang(r.language_code),
                "message_count": r.message_count,
                "first_seen": r.first_seen.isoformat() if r.first_seen else None,
                "last_seen": r.last_seen.isoformat() if r.last_seen else None,
            }
            for r in rows
        ],
    }


@data_router.get("/bot-users/{bot_user_id}", summary="Bitta bot foydalanuvchisi (detail)")
async def admin_bot_user_detail(
    bot_user_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    from models import TelegramBotUser, User, Card

    r = (await db.execute(
        select(TelegramBotUser).where(TelegramBotUser.id == bot_user_id)
    )).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Bot foydalanuvchisi topilmadi")

    def _lang(code: str) -> str:
        return "ru" if (code or "").lower().startswith("ru") else "uz"

    out = {
        "id": r.id,
        "bot": r.bot,
        "telegram_id": r.telegram_id,
        "username": r.username or None,
        "first_name": r.first_name or "",
        "last_name": r.last_name or "",
        "language_code": _lang(r.language_code),
        "message_count": r.message_count,
        "first_seen": r.first_seen.isoformat() if r.first_seen else None,
        "last_seen": r.last_seen.isoformat() if r.last_seen else None,
        "account": None,
        "stats": None,
    }

    # telegram_id bo'yicha bog'langan hisob (OTP orqali ro'yxatdan o'tgan bo'lsa)
    u = (await db.execute(
        select(User).where(User.telegram_id == str(r.telegram_id))
    )).scalar_one_or_none()
    if u:
        out["account"] = {
            "id": u.id,
            "name": u.name,
            "phone": u.phone or "",
            "email": u.email or "",
            "role": getattr(u, "role", "user"),
            "is_active": u.is_active,
            "language": getattr(u, "language", "uz"),
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        try:
            cards = (await db.execute(
                select(Card).where(Card.user_id == u.id)
            )).scalars().all()
            out["stats"] = {
                "cards": len(cards),
                "points": int(sum((c.points or 0) for c in cards)),
            }
        except Exception:
            out["stats"] = {"cards": 0, "points": 0}
    return out
