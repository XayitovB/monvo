"""
routers/merchant_crm.py
───────────────────────
Customer CRM — Merchant har mijoz haqida ma'lumot ko'radi, tag va note qo'yadi.

  POST  /merchants/me/customers                 — yangi mijoz yaratish
  GET   /merchants/me/customers                 — mijozlar ro'yxati (cards ko'rinishida)
  GET   /merchants/me/customers/{card_uid}      — tafsilot (tarix, tags, notes)
  PATCH /merchants/me/customers/{card_uid}      — tags/notes yangilash
  POST  /merchants/me/customers/{card_uid}/adjust — ball qo'shish/ayirish
  POST  /merchants/me/customers/{card_uid}/note — note qo'shish (prepend)
"""
import secrets as _secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_merchant
from core.tiers import apply_tier
from database import get_db
from models import Card, Merchant, TelegramBotUser, Transaction, User

router = APIRouter(prefix="/merchants/me/customers", tags=["👥 Customer CRM"])


class _TagsUpdate(BaseModel):
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    branch_id: Optional[int] = None


class _CustomerCreate(BaseModel):
    name: str = Field(..., max_length=150)
    phone: str
    birthday: Optional[str] = Field(None, description="YYYY-MM-DD")
    branch_id: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    notes: str = Field("", max_length=2000)


class _PointsAdjust(BaseModel):
    delta: int
    note: str = Field("", max_length=200)


class _RedeemCodeIn(BaseModel):
    code: str = Field(..., max_length=12)


@router.post("/redeem-code/resolve", summary="Promokod orqali karta topish (kassir)")
async def resolve_redeem_code(
    body: _RedeemCodeIn,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Mijoz aytgan vaqtinchalik promokodni (180s / 3 daqiqa) kartaga aylantiradi. Kassir
    keyin `/merchants/me/customers/{card_uid}/adjust` orqali ball qo'shadi/yechadi."""
    from core.cache import cache_get

    code = (body.code or "").strip()
    if not code:
        raise HTTPException(400, "Kod kiritilmagan")
    card_uid = await cache_get(f"redeem_code:{code}")
    if not card_uid:
        raise HTTPException(404, "Kod yaroqsiz yoki muddati tugagan")
    card = (await db.execute(
        select(Card).where(
            Card.card_uid == str(card_uid), Card.merchant_id == merchant.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Bu karta sizning biznesingizga tegishli emas")
    return {
        "card_uid": card.card_uid,
        "holder_name": card.holder_name or "",
        "holder_phone": card.holder_phone or "",
        "points": card.points,
        "tier": card.tier,
    }


@router.post("", status_code=201, summary="Yangi mijoz qo'shish")
async def create_customer(
    body: _CustomerCreate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    from core.pos_engine import normalize_phone
    phone = normalize_phone(body.phone)
    if not phone:
        raise HTTPException(400, "Telefon raqam noto'g'ri")

    existing = (await db.execute(
        select(Card).where(Card.merchant_id == merchant.id, Card.holder_phone == phone)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Bu telefon bilan mijoz allaqachon mavjud")

    birth_dt = None
    if body.birthday:
        try:
            birth_dt = datetime.strptime(body.birthday.strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "birthday formati noto'g'ri (YYYY-MM-DD)")

    uid = "crm_" + _secrets.token_urlsafe(12).replace("_", "").replace("-", "")[:18]
    card = Card(
        merchant_id=merchant.id,
        user_id=None,
        card_uid=uid,
        holder_name=body.name.strip()[:150],
        holder_phone=phone,
        holder_birth_date=birth_dt,
        points=0,
        tags=[str(t).strip()[:40] for t in (body.tags or []) if str(t).strip()][:20],
        notes=(body.notes or "").strip()[:2000],
        branch_id=body.branch_id or None,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {
        "card_uid": card.card_uid,
        "holder_name": card.holder_name,
        "holder_phone": card.holder_phone,
        "points": card.points,
        "tier": card.tier,
        "tags": card.tags or [],
        "notes": card.notes or "",
        "visits": 0,
        "last_visit_at": None,
        "issued_at": card.issued_at.isoformat() if card.issued_at else None,
    }


@router.get("", summary="Mijozlar ro'yxati")
async def list_customers(
    search: str = "",
    tag: str = "",
    tier: str = "",
    segment: str = "",
    inactive_days: int = Query(0, ge=0),
    limit: int = Query(100, le=500),
    offset: int = 0,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import or_
    from datetime import timedelta as _td
    _now = datetime.now(timezone.utc)
    d30 = _now - _td(days=30)
    d90 = _now - _td(days=90)

    q = select(Card).where(Card.merchant_id == merchant.id, Card.is_active.is_(True))
    if search.strip():
        like = f"%{search.strip()}%"
        q = q.where((Card.holder_name.ilike(like)) | (Card.holder_phone.ilike(like)))
    if tier:
        q = q.where(Card.tier == tier)
    if inactive_days > 0:
        cutoff = _now - _td(days=inactive_days)
        q = q.where(or_(Card.last_used_at < cutoff, Card.last_used_at.is_(None)))
    elif segment == "active":
        q = q.where(Card.last_used_at >= d30)
    elif segment == "sleeping":
        q = q.where(Card.last_used_at < d30, Card.last_used_at >= d90)
    elif segment == "churned":
        q = q.where(or_(Card.last_used_at < d90, Card.last_used_at.is_(None)))

    total = (await db.execute(select(sa_func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(
        q.order_by(Card.last_used_at.desc().nullslast(), Card.issued_at.desc())
        .limit(limit).offset(offset)
    )).scalars().all()

    # Har bir karta uchun tashriflar soni va oxirgi tashrif sanasini bir so'rovda olamiz
    card_ids = [c.id for c in rows]
    visit_map: dict = {}
    if card_ids:
        visit_rows = (await db.execute(
            select(
                Transaction.card_id,
                sa_func.count(Transaction.id).label("cnt"),
                sa_func.max(Transaction.created_at).label("last_at"),
                sa_func.coalesce(sa_func.sum(Transaction.amount), 0).label("rev"),
            )
            .where(
                Transaction.card_id.in_(card_ids),
                Transaction.tx_type == "earn",
            )
            .group_by(Transaction.card_id)
        )).all()
        visit_map = {
            row.card_id: (int(row.cnt), row.last_at, int(row.rev or 0))
            for row in visit_rows
        }

    # Telegram ulanishi: card.user_id → User.telegram_id → BotUser.username
    user_ids = list({c.user_id for c in rows if c.user_id})
    tg_map: dict = {}      # user_id -> telegram_id
    uname_map: dict = {}   # telegram_id -> username
    if user_ids:
        urows = (await db.execute(
            select(User.id, User.telegram_id).where(
                User.id.in_(user_ids), User.telegram_id.isnot(None)
            )
        )).all()
        tg_map = {r.id: r.telegram_id for r in urows if r.telegram_id}
        tg_ids = list(tg_map.values())
        if tg_ids:
            brows = (await db.execute(
                select(TelegramBotUser.telegram_id, TelegramBotUser.username).where(
                    TelegramBotUser.bot == "customer", TelegramBotUser.telegram_id.in_(tg_ids)
                )
            )).all()
            uname_map = {r.telegram_id: r.username for r in brows if r.username}

    # Teg filter client-side (JSON'da)
    result = []
    for c in rows:
        card_tags = c.tags or []
        if tag and tag not in card_tags:
            continue
        visits, last_visit, total_rev = visit_map.get(c.id, (0, None, 0))
        # Segment classification
        if c.last_used_at:
            lua = c.last_used_at.replace(tzinfo=timezone.utc) if c.last_used_at.tzinfo is None else c.last_used_at
            if lua >= d30:
                card_segment = "active"
            elif lua >= d90:
                card_segment = "sleeping"
            else:
                card_segment = "churned"
        else:
            card_segment = "churned"
        result.append({
            "card_uid": c.card_uid,
            "holder_name": c.holder_name,
            "holder_phone": c.holder_phone,
            "points": c.points,
            "stamp_count": c.stamp_count or 0,
            "total_revenue": total_rev,
            "tier": c.tier,
            "is_active": c.is_active,
            "tags": card_tags,
            "notes": (c.notes or "")[:200],
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
            "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
            "visits": visits,
            "last_visit_at": last_visit.isoformat() if last_visit else None,
            "segment": card_segment,
            "has_telegram": bool(tg_map.get(c.user_id)),
            "telegram_username": (uname_map.get(tg_map.get(c.user_id)) or "") if c.user_id else "",
        })

    # Loyalty modeli — stamp bo'lsa frontend balans o'rniga shtamp (X/N) ko'rsatadi.
    # Cashback ballari Card.points'da saqlanib qoladi (stamp rejimida o'zgarmaydi),
    # shuning uchun qayta cashback'ga o'tilganda yana ko'rinadi (arxivlangan).
    return {
        "total": total,
        "customers": result,
        "loyalty_type": getattr(merchant, "loyalty_type", "cashback") or "cashback",
        "stamp_threshold": int(getattr(merchant, "stamp_threshold", 7) or 7),
    }


@router.get("/{card_uid}", summary="Mijoz profili (tarix bilan)")
async def customer_detail(
    card_uid: str,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Mijoz topilmadi")

    txs = (await db.execute(
        select(Transaction)
        .where(Transaction.card_id == card.id)
        .order_by(Transaction.created_at.desc())
        .limit(100)
    )).scalars().all()

    # KPI
    totals = (await db.execute(
        select(
            sa_func.count(Transaction.id).label("cnt"),
            sa_func.coalesce(sa_func.sum(Transaction.amount), 0).label("rev"),
        ).where(
            Transaction.card_id == card.id,
            Transaction.tx_type == "earn",
        )
    )).first()

    return {
        "card": {
            "card_uid": card.card_uid,
            "holder_name": card.holder_name,
            "holder_phone": card.holder_phone,
            "holder_birth_date": card.holder_birth_date.isoformat() if card.holder_birth_date else None,
            "tier": card.tier,
            "points": card.points,
            "tags": card.tags or [],
            "notes": card.notes or "",
            "branch_id": card.branch_id,
            "issued_at": card.issued_at.isoformat() if card.issued_at else None,
            "last_used_at": card.last_used_at.isoformat() if card.last_used_at else None,
        },
        "stats": {
            "total_visits": int(totals.cnt or 0),
            "total_revenue": float(totals.rev or 0),
            "avg_check": round(float(totals.rev) / int(totals.cnt)) if totals.cnt else None,
        },
        "transactions": [
            {
                "id": t.id,
                "tx_type": t.tx_type,
                "points_delta": t.points_delta,
                "amount": float(t.amount or 0),
                "note": t.note,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in txs
        ],
    }


@router.patch("/{card_uid}", summary="Tags / notes yangilash")
async def update_customer(
    card_uid: str,
    body: _TagsUpdate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Mijoz topilmadi")

    if body.tags is not None:
        cleaned = [str(t).strip()[:40] for t in body.tags if str(t).strip()]
        card.tags = cleaned[:20]
    if body.notes is not None:
        card.notes = str(body.notes)[:2000]
    if body.branch_id is not None:
        card.branch_id = body.branch_id or None

    await db.commit()
    await db.refresh(card)
    return {"card_uid": card.card_uid, "tags": card.tags, "notes": card.notes}


@router.post("/{card_uid}/adjust", summary="Ball qo'shish yoki ayirish")
async def adjust_points(
    card_uid: str,
    body: _PointsAdjust,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    if body.delta == 0:
        raise HTTPException(400, "Delta 0 bo'lmasligi kerak")

    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Mijoz topilmadi")

    new_points = card.points + body.delta
    if new_points < 0:
        raise HTTPException(400, f"Balans yetarli emas. Joriy balans: {card.points}")

    card.points = new_points
    apply_tier(card, merchant)
    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant.id,
        tx_type="manual",
        points_delta=body.delta,
        amount=0,
        note=body.note or ("Ball qo'shildi" if body.delta > 0 else "Ball ayirildi"),
        provider="merchant_crm",
        created_at=datetime.now(timezone.utc),
    )
    db.add(tx)
    await db.commit()
    await db.refresh(card)
    return {"card_uid": card.card_uid, "points": card.points, "delta": body.delta}
