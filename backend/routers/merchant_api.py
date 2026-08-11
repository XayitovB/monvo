"""Public Merchant API — biznes egalari saytiga/botiga integratsiya uchun.

Auth: `Authorization: Bearer kar_live_<...>` header
Format: JSON request/response, REST stili

Endpointlar:
  GET  /api/v1/me                       — token tasdiqlash + merchant info
  GET  /api/v1/cards/lookup?phone=...   — telefon orqali karta topish
  POST /api/v1/cards                    — yangi mijoz/karta yaratish (phone, name, birthday, tags, notes, branch_id)
  GET  /api/v1/cards/{card_uid}         — karta ma'lumotlari + balans
  POST /api/v1/transactions/earn        — chek qabul qilish va ball berish
  GET  /api/v1/transactions             — tranzaksiyalar tarixi (pagination)
  GET  /api/v1/branches                 — filiallar ro'yxati
  GET  /api/v1/rewards                  — mukofotlar katalogi

Idempotency:
  `POST /transactions/earn` `external_ref` qabul qiladi — agar bir xil
  external_ref bilan qayta yuborilsa, mavjud tranzaksiya qaytariladi (yangi
  ball berilmaydi). Bu retry-safe integratsiya uchun.
"""
from __future__ import annotations

import asyncio
import hashlib
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from core.api_tokens import get_api_merchant
from core.tiers import apply_tier
from core import webhooks as wh
from core.pos_engine import (
    NormalizedSale,
    commit_pos_sale,
    compute_points,
    normalize_phone,
)
from database import get_db
from models import (
    Card,
    Merchant,
    MerchantApiToken,
    MerchantBranch,
    Reward,
    Transaction,
)


router = APIRouter(prefix="/api/v1", tags=["🔑 Merchant API (public)"])


# ── Helpers ─────────────────────────────────────────────────────────────────
def _new_card_uid() -> str:
    return "api_" + secrets.token_urlsafe(12).replace("_", "").replace("-", "")[:18]


def _serialize_card(c: Card) -> dict:
    return {
        "card_uid": c.card_uid,
        "merchant_id": c.merchant_id,
        "holder_name": c.holder_name or "",
        "holder_phone": c.holder_phone or "",
        "birthday": c.holder_birth_date.strftime("%Y-%m-%d") if c.holder_birth_date else None,
        "points": int(c.points or 0),
        "tier": c.tier or "bronze",
        "branch_id": c.branch_id,
        "tags": c.tags or [],
        "notes": c.notes or "",
        "is_active": bool(c.is_active),
        "issued_at": c.issued_at.isoformat() if c.issued_at else None,
        "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
    }


def _serialize_tx(t: Transaction) -> dict:
    return {
        "id": t.id,
        "card_id": t.card_id,
        "tx_type": t.tx_type,
        "points_delta": int(t.points_delta or 0),
        "amount": float(t.amount or 0),
        "reward_id": t.reward_id,
        "branch_id": t.branch_id,
        "note": t.note or "",
        "provider": t.provider or "api",
        "external_ref": t.external_ref or "",
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


# ── /me ────────────────────────────────────────────────────────────────────
@router.get("/me", summary="Merchant info + token tasdiqlash")
async def api_me(merchant: Merchant = Depends(get_api_merchant)):
    return {
        "id": merchant.id,
        "business_name": merchant.business_name,
        "email": merchant.email,
        "phone": merchant.phone or "",
        "is_active": bool(merchant.is_active),
    }


# ── /cards ─────────────────────────────────────────────────────────────────
@router.get("/cards/lookup", summary="Telefon orqali kartani topish")
async def api_card_lookup(
    phone: str = Query(..., description="E.164 yoki +998... ko'rinishida"),
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    p = normalize_phone(phone)
    if not p:
        raise HTTPException(400, "phone noto'g'ri")
    row = (await db.execute(
        select(Card).where(
            Card.merchant_id == merchant.id,
            Card.holder_phone == p,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Karta topilmadi")
    return _serialize_card(row)


@router.get("/cards/{card_uid}", summary="Karta ma'lumotlari")
async def api_card_get(
    card_uid: str,
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(Card).where(
            Card.card_uid == card_uid,
            Card.merchant_id == merchant.id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Karta topilmadi")
    return _serialize_card(row)


class RedeemCodeIn(BaseModel):
    code: str = Field(..., max_length=12,
                      description="Mijoz Monvo ilovasida yaratgan vaqtinchalik kod (3 daqiqa / 180 soniya)")


@router.post("/redeem-code/resolve",
             summary="Vaqtinchalik promokodni kartaga aylantirish (QR skaner muqobili)")
async def api_redeem_code_resolve(
    body: RedeemCodeIn,
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Mijoz Monvo ilovasida yaratgan 180 soniyalik (3 daqiqa) kodni kartaga
    aylantiradi — QR skanerlash imkoni bo'lmaganda. Qaytgan `card_uid` bilan keyin
    `/transactions/earn` (ball qo'shish) yoki balans yechish amalini bajaring.
    Kod faqat 3 daqiqa amal qiladi va bir marta ishlatilishi kerak."""
    from core.cache import cache_get

    code = (body.code or "").strip()
    if not code:
        raise HTTPException(400, "code majburiy")
    card_uid = await cache_get(f"redeem_code:{code}")
    if not card_uid:
        raise HTTPException(404, "Kod yaroqsiz yoki muddati tugagan")
    row = (await db.execute(
        select(Card).where(
            Card.card_uid == str(card_uid),
            Card.merchant_id == merchant.id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "Karta topilmadi")
    return _serialize_card(row)


class CardCreateIn(BaseModel):
    phone: str = Field(..., description="Mijoz telefon raqami (+998...)")
    name: str = Field("", max_length=150)
    branch_id: Optional[int] = None
    birthday: Optional[str] = Field(None, description="Tug'ilgan sana YYYY-MM-DD formatida (birthday bonus uchun)")
    tags: list[str] = Field(default_factory=list)
    notes: str = Field("", max_length=2000)


@router.post("/cards", status_code=201, summary="Yangi karta yaratish (mijoz registratsiyasi)")
async def api_card_create(
    body: CardCreateIn,
    response: Response,
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    p = normalize_phone(body.phone)
    if not p:
        raise HTTPException(400, "phone noto'g'ri")

    # Mavjud kartani qaytaradi (idempotent) — 200, yangi karta 201
    existing = (await db.execute(
        select(Card).where(
            Card.merchant_id == merchant.id,
            Card.holder_phone == p,
        )
    )).scalar_one_or_none()
    if existing is not None:
        response.status_code = 200
        return _serialize_card(existing)

    if body.branch_id is not None:
        branch = (await db.execute(
            select(MerchantBranch).where(
                MerchantBranch.id == body.branch_id,
                MerchantBranch.merchant_id == merchant.id,
            )
        )).scalar_one_or_none()
        if branch is None:
            raise HTTPException(400, "branch_id noto'g'ri")

    birth_dt = None
    if body.birthday:
        try:
            birth_dt = datetime.strptime(body.birthday.strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "birthday formati noto'g'ri — YYYY-MM-DD bo'lishi kerak")

    card = Card(
        merchant_id=merchant.id,
        user_id=None,
        card_uid=_new_card_uid(),
        holder_name=(body.name or "").strip()[:150],
        holder_phone=p,
        holder_birth_date=birth_dt,
        points=0,
        tags=[t for t in (body.tags or []) if isinstance(t, str)][:20],
        notes=(body.notes or "").strip()[:2000],
        branch_id=body.branch_id,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)

    # Webhook: card.created
    ids = await wh.enqueue(merchant.id, "card.created", {
        "card_uid": card.card_uid,
        "holder_name": card.holder_name,
        "holder_phone": card.holder_phone,
        "branch_id": card.branch_id,
        "points": 0,
        "tier": card.tier,
    }, db)
    for did in ids:
        asyncio.create_task(wh.dispatch(did, db))

    return _serialize_card(card)


# ── /transactions ──────────────────────────────────────────────────────────
class TxEarnIn(BaseModel):
    """Chek qabul qilish — ball berish.

    `card_uid` yoki `phone` dan kamida bittasi bo'lishi shart.
    `external_ref` — sizning POS/CRM tomonidagi unique chek ID. Idempotency
    uchun ishlatiladi (qayta yuborilsa qayta ball berilmaydi).
    """
    amount: float = Field(..., gt=0, description="To'lov summasi (so'm)")
    card_uid: Optional[str] = None
    phone: Optional[str] = None
    external_ref: str = Field(..., min_length=1, max_length=120)
    branch_id: Optional[int] = None
    note: str = Field("", max_length=300)


@router.post("/transactions/earn", summary="Chek qabul qilish (ball berish)")
async def api_transaction_earn(
    body: TxEarnIn,
    request: Request,
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    if not body.card_uid and not body.phone:
        raise HTTPException(400, "card_uid yoki phone berish kerak")

    # commit_pos_sale orqali — pos_engine'ning idempotent + lazy-enroll
    # mantig'idan foydalanamiz. Uchun "fake" PosIntegration kerak emas
    # (bizda integration tanasi yo'q); shunchaki provider="api" bilan
    # commit_pos_sale ichidagi ish bajariladi. Lekin commit_pos_sale
    # `integration` argument oladi — biz inline minimal flow yozamiz.

    # Idempotency
    existing = (await db.execute(
        select(Transaction).where(
            Transaction.merchant_id == merchant.id,
            Transaction.provider == "api",
            Transaction.external_ref == body.external_ref,
        )
    )).scalar_one_or_none()
    if existing is not None:
        card = await db.get(Card, existing.card_id) if existing.card_id else None
        return {
            "duplicate": True,
            "transaction": _serialize_tx(existing),
            "card": _serialize_card(card) if card else None,
        }

    # Karta topish
    card: Optional[Card] = None
    if body.card_uid:
        card = (await db.execute(
            select(Card).where(
                Card.card_uid == body.card_uid,
                Card.merchant_id == merchant.id,
            )
        )).scalar_one_or_none()
        if card is None:
            raise HTTPException(404, "card_uid noto'g'ri")
    else:
        p = normalize_phone(body.phone)
        if not p:
            raise HTTPException(400, "phone noto'g'ri")
        card = (await db.execute(
            select(Card).where(
                Card.merchant_id == merchant.id,
                Card.holder_phone == p,
            )
        )).scalar_one_or_none()
        if card is None:
            # Lazy enroll
            card = Card(
                merchant_id=merchant.id,
                card_uid=_new_card_uid(),
                holder_name="",
                holder_phone=p,
                points=0,
                branch_id=body.branch_id,
            )
            db.add(card)
            await db.flush()

    # ── Stamp (N+1) modeli ──────────────────────────────────────────────────
    # Merchant "stamp" turida bo'lsa — ball/cashback emas, SHTAMP qo'shamiz
    # (kassir /transactions/scan bilan bir xil mantiq). Oldin bu yo'q edi —
    # public API stamp merchant uchun ham cashback berib, shtampni oshirmasdi.
    if getattr(merchant, "loyalty_type", "cashback") == "stamp":
        threshold = max(2, int(getattr(merchant, "stamp_threshold", 7) or 7))
        # Karta to'lганда avtomatik bepul bermaymiz/reset qilmaymiz — mukofot
        # mijoz ilovasidagi PROMOKOD orqali beriladi. To'la kartaga shtamp
        # qo'shilmaydi (avval promokodni redeem qilish kerak).
        already_full = (card.stamp_count or 0) >= threshold
        if not already_full:
            card.stamp_count = (card.stamp_count or 0) + 1
        reward_ready = card.stamp_count >= threshold
        earned_free = False
        reward_title = None
        card.last_used_at = datetime.now(timezone.utc)

        note_parts = []
        if body.note:
            note_parts.append(body.note.strip())
        note_parts.append(f"api#{body.external_ref}")
        note_parts.append("⭐ to'la — mukofot tayyor (promokod)" if reward_ready
                          else f"⭐ {card.stamp_count}/{threshold}")
        note = " | ".join(note_parts)[:300]

        tx = Transaction(
            card_id=card.id,
            merchant_id=merchant.id,
            tx_type="earn",
            points_delta=0,
            amount=Decimal(str(body.amount)),
            note=note,
            branch_id=body.branch_id or card.branch_id,
            applied_rules=[],
            provider="api",
            external_ref=body.external_ref,
        )
        db.add(tx)
        await db.commit()
        await db.refresh(tx)
        await db.refresh(card)

        ids = await wh.enqueue(merchant.id, "transaction.earn", {
            "transaction_id": tx.id,
            "card_uid": card.card_uid,
            "holder_phone": card.holder_phone,
            "holder_name": card.holder_name,
            "points_delta": 0,
            "amount": float(tx.amount),
            "loyalty_type": "stamp",
            "stamp_count": card.stamp_count,
            "stamp_threshold": threshold,
            "earned_free": False,
            "reward_ready": reward_ready,
            "branch_id": tx.branch_id,
            "external_ref": tx.external_ref,
        }, db)
        for did in ids:
            asyncio.create_task(wh.dispatch(did, db))

        return {
            "duplicate": False,
            "transaction": _serialize_tx(tx),
            "card": _serialize_card(card),
            "loyalty_type": "stamp",
            "stamp_count": card.stamp_count,
            "stamp_threshold": threshold,
            "earned_free": False,
            "reward_ready": reward_ready,
            "reward_title": reward_title,
        }

    # Ball hisoblash (pos_engine bilan bir xil qoidalar)
    points, applied, reward_title = await compute_points(
        merchant=merchant, card=card, amount=body.amount, db=db,
    )
    if points <= 0:
        # Hech narsa berilmadi, lekin chek ro'yxatga olinadi (audit uchun)
        tx = Transaction(
            card_id=card.id,
            merchant_id=merchant.id,
            tx_type="earn",
            points_delta=0,
            amount=Decimal(str(body.amount)),
            note=(body.note or "")[:300] or "API earn (0 points)",
            branch_id=body.branch_id or card.branch_id,
            applied_rules=applied,
            provider="api",
            external_ref=body.external_ref,
        )
        db.add(tx)
        await db.commit()
        await db.refresh(tx)
        return {
            "duplicate": False,
            "transaction": _serialize_tx(tx),
            "card": _serialize_card(card),
        }

    # Karta + tx yangilash
    note_parts = []
    if body.note:
        note_parts.append(body.note.strip())
    note_parts.append(f"api#{body.external_ref}")
    if reward_title:
        note_parts.append(f"🎁 {reward_title}")
    note = " | ".join(note_parts)[:300]

    card.points = int(card.points or 0) + points
    card.last_used_at = datetime.now(timezone.utc)
    apply_tier(card, merchant)

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant.id,
        tx_type="earn",
        points_delta=points,
        amount=Decimal(str(body.amount)),
        note=note,
        branch_id=body.branch_id or card.branch_id,
        applied_rules=applied,
        provider="api",
        external_ref=body.external_ref,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    await db.refresh(card)

    # Webhook: transaction.earn
    ids = await wh.enqueue(merchant.id, "transaction.earn", {
        "transaction_id": tx.id,
        "card_uid": card.card_uid,
        "holder_phone": card.holder_phone,
        "holder_name": card.holder_name,
        "points_delta": tx.points_delta,
        "amount": float(tx.amount),
        "card_points": card.points,
        "card_tier": card.tier,
        "branch_id": tx.branch_id,
        "external_ref": tx.external_ref,
    }, db)
    for did in ids:
        asyncio.create_task(wh.dispatch(did, db))

    return {
        "duplicate": False,
        "transaction": _serialize_tx(tx),
        "card": _serialize_card(card),
    }


class TxRedeemIn(BaseModel):
    """Mukofot olish uchun ball yechish.

    Kartani aniqlash: `card_uid` yoki `phone`.
    `external_ref` qayta yuborilsa ikkinchi marta yechmaydi (idempotent).
    """
    reward_id: int = Field(..., description="Mukofot ID (GET /rewards dan)")
    card_uid: Optional[str] = None
    phone: Optional[str] = None
    external_ref: str = Field(..., min_length=1, max_length=120)
    branch_id: Optional[int] = None
    note: str = Field("", max_length=300)


@router.post("/transactions/redeem", summary="Mukofot olish (ball yechish)")
async def api_transaction_redeem(
    body: TxRedeemIn,
    request: Request,
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    if not body.card_uid and not body.phone:
        raise HTTPException(400, "card_uid yoki phone berish kerak")

    # Idempotency
    existing = (await db.execute(
        select(Transaction).where(
            Transaction.merchant_id == merchant.id,
            Transaction.provider == "api",
            Transaction.external_ref == body.external_ref,
        )
    )).scalar_one_or_none()
    if existing is not None:
        card = await db.get(Card, existing.card_id) if existing.card_id else None
        return {
            "duplicate": True,
            "transaction": _serialize_tx(existing),
            "card": _serialize_card(card) if card else None,
        }

    # Reward
    reward = (await db.execute(
        select(Reward).where(
            Reward.id == body.reward_id,
            Reward.merchant_id == merchant.id,
            Reward.is_active.is_(True),
        )
    )).scalar_one_or_none()
    if reward is None:
        raise HTTPException(404, "Mukofot topilmadi yoki aktiv emas")
    cost = int(reward.points_cost or 0)
    if cost <= 0:
        raise HTTPException(400, "Mukofot narxi noto'g'ri")

    # Karta topish — with_for_update() race condition'dan himoya qiladi
    card: Optional[Card] = None
    if body.card_uid:
        card = (await db.execute(
            select(Card).where(
                Card.card_uid == body.card_uid,
                Card.merchant_id == merchant.id,
            ).with_for_update()
        )).scalar_one_or_none()
    else:
        p = normalize_phone(body.phone)
        if not p:
            raise HTTPException(400, "phone noto'g'ri")
        card = (await db.execute(
            select(Card).where(
                Card.merchant_id == merchant.id,
                Card.holder_phone == p,
            ).with_for_update()
        )).scalar_one_or_none()
    if card is None:
        raise HTTPException(404, "Karta topilmadi")
    if int(card.points or 0) < cost:
        raise HTTPException(
            400,
            f"Yetarli ball yo'q (kerak: {cost}, mavjud: {int(card.points or 0)})",
        )

    note_parts = []
    if body.note:
        note_parts.append(body.note.strip())
    note_parts.append(f"api#{body.external_ref}")
    note_parts.append(f"🎁 {reward.title}")
    note = " | ".join(note_parts)[:300]

    card.points = int(card.points or 0) - cost
    card.last_used_at = datetime.now(timezone.utc)
    apply_tier(card, merchant)

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant.id,
        tx_type="redeem",
        points_delta=-cost,
        amount=Decimal("0"),
        note=note,
        branch_id=body.branch_id or card.branch_id,
        reward_id=reward.id,
        provider="api",
        external_ref=body.external_ref,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    await db.refresh(card)

    # Webhook: transaction.redeem
    ids = await wh.enqueue(merchant.id, "transaction.redeem", {
        "transaction_id": tx.id,
        "card_uid": card.card_uid,
        "holder_phone": card.holder_phone,
        "holder_name": card.holder_name,
        "points_delta": tx.points_delta,
        "card_points": card.points,
        "card_tier": card.tier,
        "reward_id": reward.id,
        "reward_title": reward.title,
        "branch_id": tx.branch_id,
        "external_ref": tx.external_ref,
    }, db)
    for did in ids:
        asyncio.create_task(wh.dispatch(did, db))

    return {
        "duplicate": False,
        "transaction": _serialize_tx(tx),
        "card": _serialize_card(card),
        "reward": {
            "id": reward.id,
            "title": reward.title,
            "points_cost": cost,
        },
    }


class TxSpendIn(BaseModel):
    """Erkin miqdorda ball yechish (Billz kabi POS terminallar uchun).

    `points` — necha ball yechish (1 ball = 1 so'm).
    `card_uid` yoki `phone` dan biri shart.
    `external_ref` — POS chek ID, idempotency kafolati.
    """
    points: int = Field(..., gt=0, description="Yechadigan ball miqdori")
    card_uid: Optional[str] = None
    phone: Optional[str] = None
    external_ref: str = Field(..., min_length=1, max_length=120)
    branch_id: Optional[int] = None
    note: str = Field("", max_length=300)


@router.post("/transactions/spend", summary="Ball yechish (POS checkout uchun)")
async def api_transaction_spend(
    body: TxSpendIn,
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Billz yoki boshqa POS checkout'da mijoz balansidan ball yechadi.

    Idempotent: bir xil `external_ref` qayta yuborilsa ikkinchi marta yechmaydi.
    Balans yetmasa 400 qaytaradi — POS to'lovni rad etishi kerak.
    """
    if not body.card_uid and not body.phone:
        raise HTTPException(400, "card_uid yoki phone berish kerak")

    idem_ref = f"spend:{body.external_ref}"

    # Idempotency
    existing = (await db.execute(
        select(Transaction).where(
            Transaction.merchant_id == merchant.id,
            Transaction.provider == "api",
            Transaction.external_ref == idem_ref,
        )
    )).scalar_one_or_none()
    if existing is not None:
        card = await db.get(Card, existing.card_id) if existing.card_id else None
        return {
            "duplicate": True,
            "transaction": _serialize_tx(existing),
            "card": _serialize_card(card) if card else None,
        }

    # Karta topish — with_for_update() race condition'dan himoya qiladi
    card: Optional[Card] = None
    if body.card_uid:
        card = (await db.execute(
            select(Card).where(
                Card.card_uid == body.card_uid,
                Card.merchant_id == merchant.id,
            ).with_for_update()
        )).scalar_one_or_none()
    else:
        p = normalize_phone(body.phone)
        if not p:
            raise HTTPException(400, "phone noto'g'ri")
        card = (await db.execute(
            select(Card).where(
                Card.merchant_id == merchant.id,
                Card.holder_phone == p,
            ).with_for_update()
        )).scalar_one_or_none()
    if card is None:
        raise HTTPException(404, "Karta topilmadi")

    available = int(card.points or 0)
    if available < body.points:
        raise HTTPException(
            400,
            f"Yetarli ball yo'q (kerak: {body.points}, mavjud: {available})",
        )

    card.points = available - body.points
    card.last_used_at = datetime.now(timezone.utc)
    apply_tier(card, merchant)

    note_parts = []
    if body.note:
        note_parts.append(body.note.strip())
    note_parts.append(f"spend#{body.external_ref}")
    note = " | ".join(note_parts)[:300]

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant.id,
        tx_type="redeem",
        points_delta=-body.points,
        amount=Decimal("0"),
        note=note,
        branch_id=body.branch_id or card.branch_id,
        applied_rules=[{"rule_type": "pos_spend", "name": "bonus sarflandi", "points": -body.points}],
        provider="api",
        external_ref=idem_ref,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    await db.refresh(card)

    # Webhook: transaction.spend
    ids = await wh.enqueue(merchant.id, "transaction.spend", {
        "transaction_id": tx.id,
        "card_uid": card.card_uid,
        "holder_phone": card.holder_phone,
        "holder_name": card.holder_name,
        "points_delta": tx.points_delta,
        "card_points": card.points,
        "card_tier": card.tier,
        "branch_id": tx.branch_id,
        "external_ref": tx.external_ref,
    }, db)
    for did in ids:
        asyncio.create_task(wh.dispatch(did, db))

    return {
        "duplicate": False,
        "transaction": _serialize_tx(tx),
        "card": _serialize_card(card),
        "spent_points": body.points,
    }


class TxBillzRedeemIn(BaseModel):
    """Monvo balllarini Billz sertifikatiga aylantirish.

    `points` — necha ball yechish (1 ball = 1 so'm sertifikat).
    `expire_date` — sertifikat muddati "dd.mm.yyyy" formatida (default: 90 kun).
    `card_uid` yoki `phone` dan biri shart.
    `external_ref` — idempotency uchun unique ID.
    """
    points: int = Field(..., gt=0)
    card_uid: Optional[str] = None
    phone: Optional[str] = None
    external_ref: str = Field(..., min_length=1, max_length=120)
    expire_date: Optional[str] = Field(None, description="dd.mm.yyyy, default 90 kun")
    branch_id: Optional[int] = None


@router.post("/transactions/billz-redeem", summary="Balllarni Billz sertifikatiga aylantirish")
async def api_billz_redeem(
    body: TxBillzRedeemIn,
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    """Mijozning Monvo balansidan `points` ball yechildi va Billz'da
    shu miqdordagi sertifikat yaratiladi. Sertifikat kodi qaytariladi —
    mijoz uni Billz terminalida to'lov sifatida ishlatishi mumkin.
    """
    from models import PosIntegration
    from integrations.billz import BillzApiError, BillzClient

    if not body.card_uid and not body.phone:
        raise HTTPException(400, "card_uid yoki phone berish kerak")

    idem_ref = f"billz-cert:{body.external_ref}"

    # Idempotency
    existing = (await db.execute(
        select(Transaction).where(
            Transaction.merchant_id == merchant.id,
            Transaction.provider == "api",
            Transaction.external_ref == idem_ref,
        )
    )).scalar_one_or_none()
    if existing is not None:
        card = await db.get(Card, existing.card_id) if existing.card_id else None
        cert_code = (existing.note or "").split("cert:")[-1].split("|")[0].strip()
        return {
            "duplicate": True,
            "certificate_code": cert_code,
            "transaction": _serialize_tx(existing),
            "card": _serialize_card(card) if card else None,
        }

    # Billz integratsiyasi mavjudligini tekshirish
    pos_row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == merchant.id,
            PosIntegration.provider == "billz",
            PosIntegration.is_active.is_(True),
        )
    )).scalar_one_or_none()
    if pos_row is None:
        raise HTTPException(400, "Billz integratsiyasi ulanmagan")

    secret_token = (pos_row.credentials or {}).get("secret_token") or \
                   (pos_row.credentials or {}).get("api_secret")
    if not secret_token:
        raise HTTPException(400, "Billz secret_token topilmadi")

    # Karta topish — with_for_update() race condition'dan himoya qiladi
    card: Optional[Card] = None
    if body.card_uid:
        card = (await db.execute(
            select(Card).where(
                Card.card_uid == body.card_uid,
                Card.merchant_id == merchant.id,
            ).with_for_update()
        )).scalar_one_or_none()
    else:
        p = normalize_phone(body.phone)
        if not p:
            raise HTTPException(400, "phone noto'g'ri")
        card = (await db.execute(
            select(Card).where(
                Card.merchant_id == merchant.id,
                Card.holder_phone == p,
            ).with_for_update()
        )).scalar_one_or_none()
    if card is None:
        raise HTTPException(404, "Karta topilmadi")

    available = int(card.points or 0)
    if available < body.points:
        raise HTTPException(
            400,
            f"Yetarli ball yo'q (kerak: {body.points}, mavjud: {available})",
        )

    # Sertifikat kodi: kriptografik random, MD5 emas
    import datetime as _dt
    cert_code = secrets.token_hex(7).upper()  # 14 hex belgi, ~56 bit entropy

    # Muddati
    if body.expire_date:
        expire_period = body.expire_date
    else:
        exp = _dt.date.today() + _dt.timedelta(days=365)
        expire_period = exp.strftime("%d.%m.%Y")

    # Billz'da voucher yaratish (VOUCHER+ABSOLUTE — testlangan kombinatsiya)
    try:
        async with BillzClient(secret_token=secret_token) as client:
            await client.create_gift_cards(
                cards=[{
                    "code": cert_code,
                    "amount": float(body.points),
                    "expire_period": expire_period,
                }],
            )
    except BillzApiError as e:
        raise HTTPException(502, f"Billz xatosi: {e}")
    except Exception as e:
        raise HTTPException(502, f"Billz ulanish xatosi: {e}")

    # Monvo balansidan yechish
    card.points = available - body.points
    card.last_used_at = _dt.datetime.now(_dt.timezone.utc)
    apply_tier(card, merchant)

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant.id,
        tx_type="redeem",
        points_delta=-body.points,
        amount=Decimal("0"),
        note=f"Billz sertifikat | cert:{cert_code} | api#{body.external_ref}",
        branch_id=body.branch_id or card.branch_id,
        applied_rules=[{
            "rule_type": "billz_certificate",
            "name": "Billz sertifikatiga aylantirildi",
            "points": -body.points,
        }],
        provider="api",
        external_ref=idem_ref,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    await db.refresh(card)

    return {
        "duplicate": False,
        "certificate_code": cert_code,
        "amount": body.points,
        "expire_date": expire_period,
        "transaction": _serialize_tx(tx),
        "card": _serialize_card(card),
    }


@router.get("/transactions", summary="Tranzaksiyalar tarixi")
async def api_transactions_list(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    card_uid: Optional[str] = None,
    date_from: Optional[str] = Query(None, description="ISO 8601 dan (masalan: 2026-01-01)"),
    date_to: Optional[str] = Query(None, description="ISO 8601 gacha (masalan: 2026-12-31)"),
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as _date
    q = select(Transaction).where(Transaction.merchant_id == merchant.id)
    if card_uid:
        card = (await db.execute(
            select(Card).where(
                Card.card_uid == card_uid,
                Card.merchant_id == merchant.id,
            )
        )).scalar_one_or_none()
        if card is None:
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
        q = q.where(Transaction.card_id == card.id)
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "date_from formati noto'g'ri (ISO 8601 kerak)")
        q = q.where(Transaction.created_at >= dt_from)
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(400, "date_to formati noto'g'ri (ISO 8601 kerak)")
        q = q.where(Transaction.created_at <= dt_to)

    total = (await db.execute(
        select(sa_func.count()).select_from(q.subquery())
    )).scalar() or 0
    rows = (await db.execute(
        q.order_by(Transaction.id.desc()).limit(limit).offset(offset)
    )).scalars().all()

    return {
        "items": [_serialize_tx(t) for t in rows],
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }


# ── /branches ──────────────────────────────────────────────────────────────
@router.get("/branches", summary="Filiallar ro'yxati")
async def api_branches_list(
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MerchantBranch).where(MerchantBranch.merchant_id == merchant.id)
        .order_by(MerchantBranch.id)
    )).scalars().all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "address": b.address or "",
            "phone": b.phone or "",
            "is_active": bool(b.is_active),
        }
        for b in rows
    ]


# ── /rewards ───────────────────────────────────────────────────────────────
@router.get("/rewards", summary="Mukofotlar katalogi")
async def api_rewards_list(
    merchant: Merchant = Depends(get_api_merchant),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Reward).where(
            Reward.merchant_id == merchant.id,
            Reward.is_active.is_(True),
        ).order_by(Reward.points_cost)
    )).scalars().all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "description": r.description or "",
            "points_cost": int(r.points_cost or 0),
            "min_tier": r.min_tier or "bronze",
            "is_active": bool(r.is_active),
        }
        for r in rows
    ]
