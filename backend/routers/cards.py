"""
routers/cards.py
────────────────
Loyalty kartalar boshqaruvi.

Merchant endpoints (MerchantBearer):
  POST   /cards                 — yangi karta generatsiya qilish (QR + UID)
  GET    /cards                 — merchantning barcha kartalari
  GET    /cards/{card_uid}      — karta tafsilotlari (balans + tarix)
  PATCH  /cards/{card_uid}      — karta profilini yangilash
  DELETE /cards/{card_uid}      — kartani bloklash

Public / Mobile endpoint:
  GET /cards/public/{card_uid}  — foydalanuvchi mobil ilovasida karta holati
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_merchant, get_current_user
from core.tiers import apply_tier
from database import get_db
from models import Card, Merchant, Transaction, User
from schemas import CardCreate, CardOut, CardQR, CardUpdate


def _merchant_active(m) -> bool:
    """Merchant obunasi (tariff) to'langan va faolmi — aks holda karta 'faol emas'."""
    if not m:
        return False
    exp = getattr(m, "tariff_expires_at", None)
    if not exp:
        return False
    try:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return exp > datetime.now(timezone.utc)
    except Exception:
        return False

router = APIRouter(prefix="/cards", tags=["💳 Cards"])


def _qr_payload(card_uid: str) -> str:
    return f"monvo://card/{card_uid}"


@router.post("", response_model=CardOut, status_code=201,
             summary="Yangi loyalty karta yaratish")
async def create_card(
    body: CardCreate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    card = Card(
        merchant_id=merchant.id,
        user_id=body.user_id,
        card_uid=uuid.uuid4().hex,
        holder_name=body.holder_name or "",
        holder_phone=body.holder_phone or "",
        holder_birth_date=body.holder_birth_date,
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card


@router.get("", response_model=list[CardOut],
            summary="Merchantning barcha kartalari")
async def list_cards(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=500),
    offset: int = 0,
    active_only: bool = False,
):
    q = select(Card).where(Card.merchant_id == merchant.id)
    if active_only:
        q = q.where(Card.is_active.is_(True))
    q = q.order_by(Card.issued_at.desc()).limit(limit).offset(offset)
    result = await db.execute(q)
    return list(result.scalars().all())


# ── User (mobil ilova) — foydalanuvchining barcha kartalari ──────────────────
# MUHIM: /my va /public/... routlari /{card_uid} dan OLDIN bo'lishi shart,
# aks holda FastAPI "my" ni card_uid sifatida tutib get_current_merchant chaqiradi.
@router.get("/my", summary="Foydalanuvchining barcha loyalty kartalari (barcha biznes)")
async def my_cards(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Bitta foydalanuvchi bir nechta merchant'ning kartalarini ochishi mumkin.
    Bu endpoint barcha kartalarni merchant ma'lumoti bilan birga qaytaradi.

    Agar merchant API orqali karta user_id=NULL bilan yaratilgan bo'lsa,
    holder_phone orqali topib user_id ni avtomatik bog'laymiz.
    """
    # Telefon bo'yicha user_id=NULL kartalarni ulash (link)
    if user.phone:
        unlinked = (await db.execute(
            select(Card).where(
                Card.holder_phone == user.phone,
                Card.user_id.is_(None),
            )
        )).scalars().all()
        for c in unlinked:
            c.user_id = user.id
        if unlinked:
            await db.commit()

    rows = (await db.execute(
        select(Card, Merchant)
        .join(Merchant, Merchant.id == Card.merchant_id)
        .where(Card.user_id == user.id)
        .order_by(Card.last_used_at.desc().nullslast(), Card.issued_at.desc())
    )).all()

    return [
        {
            "card_uid": c.card_uid,
            "points": c.points,
            "tier": c.tier,
            "is_active": c.is_active,
            "merchant_active": _merchant_active(m),
            "loyalty_type": getattr(m, "loyalty_type", "cashback"),
            "stamp_count": getattr(c, "stamp_count", 0) or 0,
            "stamp_threshold": getattr(m, "stamp_threshold", 7),
            "stamp_reward_title": getattr(m, "stamp_reward_title", "") or "Bepul mahsulot",
            "stamp_icon": getattr(m, "stamp_icon", "coffee") or "coffee",
            "spend_progress": getattr(c, "spend_progress", 0) or 0,
            "spend_goal": int(getattr(m, "spend_goal", 1000000) or 1000000),
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
            "last_used_at": c.last_used_at.isoformat() if c.last_used_at else None,
            "merchant": {
                "id": m.id,
                "business_name": m.business_name,
                "business_type": getattr(m, "business_type", "other"),
                "logo_url": m.logo_url,
                "brand_color": m.brand_color,
                "card_design": {**(m.card_design or {})},
            },
        }
        for c, m in rows
    ]


# ── Public (mobil ilova / foydalanuvchi) ─────────────────────────────────────
@router.get("/public/{card_uid}", summary="Karta holati (public, mobil ilova)")
async def public_card(
    card_uid: str,
    db: AsyncSession = Depends(get_db),
):
    """
    QR kodi skanerlanganidan so'ng mobil ilova karta va uning merchanti haqida
    public ma'lumot oladi. Tarix / parol talab qilinmaydi.
    """
    result = await db.execute(select(Card).where(Card.card_uid == card_uid))
    card = result.scalar_one_or_none()
    if not card or not card.is_active:
        raise HTTPException(404, "Karta topilmadi yoki bloklangan")

    merchant_row = await db.execute(select(Merchant).where(Merchant.id == card.merchant_id))
    merchant = merchant_row.scalar_one_or_none()

    return {
        "card_uid": card.card_uid,
        "points": card.points,
        "tier": card.tier,
        "holder_name": card.holder_name,
        "merchant_active": _merchant_active(merchant),
        "loyalty_type": getattr(merchant, "loyalty_type", "cashback") if merchant else "cashback",
        "stamp_count": getattr(card, "stamp_count", 0) or 0,
        "stamp_threshold": getattr(merchant, "stamp_threshold", 7) if merchant else 7,
        "stamp_reward_title": (getattr(merchant, "stamp_reward_title", "") or "Bepul mahsulot") if merchant else "Bepul mahsulot",
        "stamp_icon": (getattr(merchant, "stamp_icon", "coffee") or "coffee") if merchant else "coffee",
        "spend_progress": getattr(card, "spend_progress", 0) or 0,
        "spend_goal": (int(getattr(merchant, "spend_goal", 1000000) or 1000000)) if merchant else 1000000,
        "merchant": {
            "id": merchant.id if merchant else None,
            "business_name": merchant.business_name if merchant else "",
            "logo_url": merchant.logo_url if merchant else "",
            "brand_color": merchant.brand_color if merchant else "#0B2545",
            # IMPORTANT: include card_design so the user app can render the
            # merchant's chosen background image / colors. Without this the
            # card always falls back to the default Monvo green gradient.
            "card_design": dict(merchant.card_design or {}) if merchant else {},
        } if merchant else None,
    }


# ── Self-signup via merchant QR (mobil ilova) ────────────────────────────────
@router.post("/signup-by-merchant/{merchant_id}",
             summary="Foydalanuvchi merchant QR'ini skanerlab karta oladi")
async def signup_by_merchant(
    merchant_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Merchant `monvo://signup/<id>` QR kodini skanerlagan foydalanuvchi shu
    merchant uchun yangi karta oladi. Agar foydalanuvchida bu merchant uchun
    karta allaqachon mavjud bo'lsa — eski karta UID qaytariladi (idempotent).
    """
    merchant = (await db.execute(
        select(Merchant).where(Merchant.id == merchant_id)
    )).scalar_one_or_none()
    if not merchant or not getattr(merchant, "is_active", True):
        raise HTTPException(404, "Merchant topilmadi yoki nofaol")

    existing = (await db.execute(
        select(Card).where(
            Card.user_id == user.id,
            Card.merchant_id == merchant_id,
        )
    )).scalar_one_or_none()
    if existing:
        return {
            "card_uid": existing.card_uid,
            "already": True,
            "merchant_name": merchant.business_name,
        }

    card = Card(
        merchant_id=merchant_id,
        user_id=user.id,
        card_uid=uuid.uuid4().hex,
        holder_name=getattr(user, "name", "") or "",
        holder_phone=getattr(user, "phone", "") or "",
    )
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return {
        "card_uid": card.card_uid,
        "already": False,
        "merchant_name": merchant.business_name,
    }


# ── Billz Voucher (user) ──────────────────────────────────────────────────────
@router.post("/my/{card_uid}/billz-voucher",
             summary="Billz voucheri generatsiya qilish (1 daqiqalik kod)")
async def generate_billz_voucher(
    card_uid: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Billz voucheri generatsiya qiladi — Monvo balansiga TEGMAYDI.
    Voucher faqat Billz terminalida ishlatilganda balans kamayadi (polling orqali).
    Har daqiqada yangi kod so'ralishi mumkin.
    """
    import hashlib
    import datetime as _dt
    from decimal import Decimal
    from sqlalchemy import func as sa_func
    from models import PosIntegration

    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.user_id == user.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")

    # One-time compensation for wrong deductions made before the fix.
    # We count prev wrong deductions and subtract already-issued refunds.
    wrong_deducted = sum(
        abs(t.points_delta or 0)
        for t in (await db.execute(
            select(Transaction).where(
                Transaction.card_id == card.id,
                Transaction.external_ref.like("billz-voucher:%"),
                Transaction.tx_type == "redeem",
            )
        )).scalars().all()
    )
    already_refunded = sum(
        (t.points_delta or 0)
        for t in (await db.execute(
            select(Transaction).where(
                Transaction.card_id == card.id,
                Transaction.external_ref.like("voucher-refund:%"),
                Transaction.tx_type == "earn",
            )
        )).scalars().all()
    )
    net_refund = wrong_deducted - already_refunded
    if net_refund > 0:
        card.points = (card.points or 0) + net_refund
        apply_tier(card, await db.get(Merchant, card.merchant_id))
        db.add(Transaction(
            card_id=card.id,
            merchant_id=card.merchant_id,
            tx_type="earn",
            points_delta=net_refund,
            amount=Decimal("0"),
            note="REFUND: voucher generatsiya xatosi qaytarildi",
            applied_rules=[{"rule_type": "voucher_refund", "points": net_refund}],
            provider="system",
            external_ref=f"voucher-refund:{card.id}",
        ))
        await db.commit()
        await db.refresh(card)

    # Billz integratsiyasini AVVAL tekshiramiz — aks holda non-Billz
    # merchant + 0 balans holatida "Balans yetarli emas" qaytib, ilova uni
    # Billz merchant deb o'ylab voucher oynasini ko'rsatardi.
    pos_row = (await db.execute(
        select(PosIntegration).where(
            PosIntegration.merchant_id == card.merchant_id,
            PosIntegration.provider == "billz",
            PosIntegration.is_active.is_(True),
        )
    )).scalar_one_or_none()
    if not pos_row:
        raise HTTPException(400, "Bu merchant Billz bilan ulangan emas")

    if (card.points or 0) <= 0:
        raise HTTPException(400, "Balans yetarli emas")

    secret_token = (pos_row.credentials or {}).get("secret_token") or \
                   (pos_row.credentials or {}).get("api_secret")
    if not secret_token:
        raise HTTPException(400, "Billz token topilmadi")

    amount = int(card.points)
    now_ts = int(_dt.datetime.now(_dt.timezone.utc).timestamp())
    raw = f"{card.id}-{amount}-{now_ts}"
    voucher_code = str(int(hashlib.md5(raw.encode()).hexdigest(), 16) % 1_000_000).zfill(6)
    expire_date = (_dt.date.today() + _dt.timedelta(days=1)).strftime("%d.%m.%Y")

    from integrations.billz import BillzApiError, BillzClient
    try:
        async with BillzClient(secret_token=secret_token) as client:
            await client.create_gift_cards(
                cards=[{"code": voucher_code, "amount": float(amount), "expire_period": expire_date}],
            )
    except BillzApiError as e:
        raise HTTPException(502, f"Billz xatosi: {e}")
    except Exception as e:
        raise HTTPException(502, f"Billz ulanish xatosi: {e}")

    return {
        "voucher_code": voucher_code,
        "amount": amount,
        "expire_date": expire_date,
        "refreshes_in": 60,
    }


# ── Merchant: card_uid parametrik routlari (/{card_uid} dan KEYIN bo'lishi shart) ──
@router.get("/{card_uid}", response_model=CardOut,
            summary="Karta tafsilotlari (merchant)")
async def get_card(
    card_uid: str,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")
    return card


@router.post("/my/{card_uid}/redeem-code",
             summary="Vaqtinchalik promokod (180s) — QR o'rniga kassirga aytish uchun")
async def generate_redeem_code(
    card_uid: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mijoz QR ko'rsatolmasa: 6 xonali vaqtinchalik kod yaratadi (180 soniya / 3 daqiqa).
    Mijoz kodni kassirga aytadi, kassir uni kiritib ball qo'shadi/yechadi.
    Kod Redis'da TTL bilan saqlanadi (avtomatik o'chadi)."""
    import secrets
    from core.cache import cache_get, cache_set

    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.user_id == user.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")

    code = None
    for _ in range(6):
        c = f"{secrets.randbelow(900000) + 100000}"  # 100000..999999
        if await cache_get(f"redeem_code:{c}") is None:
            code = c
            break
    code = code or f"{secrets.randbelow(900000) + 100000}"
    await cache_set(f"redeem_code:{code}", card.card_uid, ttl=180)
    return {"code": code, "expires_in": 180}


# ── Stamp (N+1) mukofot promokodi ───────────────────────────────────────────
# Karta to'lганда (stamp_count >= threshold) mijoz bir martalik PROMOKOD oladi.
# Kassir kodni redeem qiladi → bepul beriladi, kod o'chiriladi, hisob 0 ga reset.
_STAMP_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # noaniq belgilarsiz


@router.post("/my/{card_uid}/stamp-reward-code",
             summary="Stamp mukofoti promokodi (karta to'la bo'lganda)")
async def stamp_reward_code(
    card_uid: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import secrets
    from core.cache import cache_get, cache_set

    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.user_id == user.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")
    merchant = (await db.execute(
        select(Merchant).where(Merchant.id == card.merchant_id)
    )).scalar_one_or_none()
    if not merchant or getattr(merchant, "loyalty_type", "") != "stamp":
        raise HTTPException(400, "Bu karta shtamp modelida emas")
    threshold = max(2, int(getattr(merchant, "stamp_threshold", 7) or 7))
    if (card.stamp_count or 0) < threshold:
        raise HTTPException(400, "Karta hali to'lmagan")

    reward_title = getattr(merchant, "stamp_reward_title", "") or "Bepul mahsulot"
    # Idempotent — bitta to'la kartaga bitta faol kod.
    existing = await cache_get(f"stamp_reward_card:{card.card_uid}")
    if existing:
        return {"code": existing, "reward_title": reward_title}

    code = None
    for _ in range(6):
        c = "".join(secrets.choice(_STAMP_CODE_ALPHABET) for _ in range(6))
        if await cache_get(f"stamp_reward:{c}") is None:
            code = c
            break
    code = code or "".join(secrets.choice(_STAMP_CODE_ALPHABET) for _ in range(6))
    await cache_set(f"stamp_reward:{code}", card.card_uid, ttl=86400)
    await cache_set(f"stamp_reward_card:{card.card_uid}", code, ttl=86400)
    return {"code": code, "reward_title": reward_title}


class _StampRewardRedeem(BaseModel):
    code: str


@router.post("/stamp-reward/redeem",
             summary="Stamp mukofot promokodini redeem (kassir/merchant)")
async def redeem_stamp_reward(
    body: _StampRewardRedeem,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    from decimal import Decimal
    from core.cache import cache_get, cache_delete_prefix

    raw = (body.code or "").strip().upper()
    # "monvo://reward/XXXX" yoki "FREE-XXXX" formatlarini tozalaymiz.
    if "REWARD/" in raw:
        raw = raw.split("REWARD/")[-1]
    raw = raw.replace("FREE-", "").replace("-", "").strip()
    if not raw:
        raise HTTPException(400, "Promokod bo'sh")

    card_uid = await cache_get(f"stamp_reward:{raw}")
    if not card_uid:
        raise HTTPException(404, "Promokod yaroqsiz yoki muddati tugagan")
    card = (await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")
    threshold = max(2, int(getattr(merchant, "stamp_threshold", 7) or 7))
    if (card.stamp_count or 0) < threshold:
        # Allaqachon berilgan/reset bo'lgan — kodni tozalaymiz.
        await cache_delete_prefix(f"stamp_reward:{raw}")
        raise HTTPException(400, "Mukofot allaqachon berilgan")

    reward_title = getattr(merchant, "stamp_reward_title", "") or "Bepul mahsulot"
    card.stamp_count = 0
    card.last_used_at = datetime.now(timezone.utc)
    db.add(Transaction(
        card_id=card.id, merchant_id=merchant.id, tx_type="redeem",
        points_delta=0, amount=Decimal("0"),
        note=f"🎁 {reward_title} (promokod)", applied_rules=[],
    ))
    await db.commit()
    # Kodni iste'mol qilamiz (qayta ishlatib bo'lmaydi).
    await cache_delete_prefix(f"stamp_reward:{raw}")
    await cache_delete_prefix(f"stamp_reward_card:{card.card_uid}")
    return {
        "ok": True,
        "reward_title": reward_title,
        "holder_name": card.holder_name or "",
        "card_uid": card.card_uid,
        "stamp_count": 0,
    }


@router.get("/{card_uid}/qr", response_model=CardQR,
            summary="Karta QR payload (client QR generatsiyasi uchun)")
async def card_qr(
    card_uid: str,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")
    return CardQR(card_uid=card.card_uid, qr_payload=_qr_payload(card.card_uid))


@router.patch("/{card_uid}", response_model=CardOut, summary="Karta yangilash")
async def update_card(
    card_uid: str,
    body: CardUpdate,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")
    if body.holder_name is not None:
        card.holder_name = body.holder_name
    if body.holder_phone is not None:
        card.holder_phone = body.holder_phone
    if body.holder_birth_date is not None:
        card.holder_birth_date = body.holder_birth_date
    await db.commit()
    await db.refresh(card)
    return card


@router.delete("/{card_uid}", status_code=204, summary="Kartani bloklash")
async def deactivate_card(
    card_uid: str,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Card).where(Card.card_uid == card_uid, Card.merchant_id == merchant.id)
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")
    card.is_active = False
    await db.commit()
    return None
