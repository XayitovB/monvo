"""
routers/transactions.py
───────────────────────
Tranzaksiyalar: EARN (QR scan → ball) va REDEEM (reward almashinish).

Merchant (MerchantBearer):
  POST /transactions/scan      — QR kod skanerlab ball qo'shish
  POST /transactions/redeem    — reward uchun ball yechish
  GET  /transactions           — merchantning tarixi (cursor/offset)
  GET  /transactions/card/{card_uid} — aniq karta tarixi
"""
import csv
import io
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Header
from jose import JWTError

from core.dependencies import get_current_merchant, get_current_user
from core.gamification import on_redeem as gam_on_redeem, on_scan as gam_on_scan
from core.loyalty_engine import evaluate as evaluate_loyalty
from core.security import decode_merchant_token
from core.tiers import recompute_tier as _recompute_tier
from database import get_db
from models import Card, LoyaltyRule, Merchant, PointRule, Reward, Transaction, User
from schemas import RedeemRequest, ScanRequest, TransactionOut


def _extract_staff_info(authorization: str | None) -> tuple[int | None, int | None]:
    """Authorization header'dan staff_id va branch_id'ni oladi (bo'lsa)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None, None
    try:
        token = authorization.split(" ", 1)[1]
        payload = decode_merchant_token(token)
        return payload.get("staff_id"), payload.get("branch_id")
    except (JWTError, Exception):
        return None, None

router = APIRouter(prefix="/transactions", tags=["🔄 Transactions"])


def _calc_points(rule: PointRule, amount: float) -> int:
    if rule.rule_type == "per_visit":
        return int(rule.points_per_visit or 0)
    per = float(rule.amount_per_point or 0)
    if per <= 0:
        return 0
    return int(amount // per)




@router.post("/scan", status_code=201, summary="QR kod orqali ball qo'shish (earn)")
async def scan_earn(
    body: ScanRequest,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
):
    """
    1. Avval merchantda yangi LoyaltyRule'lar bormi — tekshiramiz va ulardan foydalanamiz.
    2. Aks holda — eski PointRule mexanizmiga qaytamiz (backward compatibility).
    """
    # Kartani topish (faqat ayni merchant kartalari).
    # with_for_update() — bir vaqtda kelgan ikki skaner balansni ustma-ust
    # yozib, ball yo'qolishining oldini oladi (redeem'da ham shunday).
    result = await db.execute(
        select(Card).where(
            Card.card_uid == body.card_uid, Card.merchant_id == merchant.id
        ).with_for_update()
    )
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")
    if not card.is_active:
        raise HTTPException(400, "Karta bloklangan")

    amount = float(body.amount or 0)

    # ── N+1 SHTAMP modeli ────────────────────────────────────────────────────
    # Biznes "stamp" turida bo'lsa — ball emas, shtamp qo'shamiz. N ta to'lganda
    # nol'ga qaytadi va bepul mahsulot beriladi.
    if getattr(merchant, "loyalty_type", "cashback") == "stamp":
        threshold = max(2, int(getattr(merchant, "stamp_threshold", 7) or 7))
        # Karta to'lганда AVTOMATIK bepul bermaymiz va reset qilmaymiz — mukofot
        # mijoz ilovasidagi PROMOKOD orqali beriladi (kassir kodni redeem qiladi).
        # To'la kartaga yana skanerlasa — shtamp qo'shilmaydi (avval mukofotni
        # promokod bilan oling).
        already_full = (card.stamp_count or 0) >= threshold
        if not already_full:
            card.stamp_count = (card.stamp_count or 0) + 1
        reward_ready = card.stamp_count >= threshold
        card.last_used_at = datetime.now(timezone.utc)

        note_parts = []
        if body.note:
            note_parts.append(body.note)
        note_parts.append("⭐ to'la — mukofot tayyor (promokod)" if reward_ready
                          else f"⭐ {card.stamp_count}/{threshold}")
        final_note = " | ".join(note_parts)[:300]

        staff_id, branch_id = _extract_staff_info(authorization)
        if branch_id is None and card.branch_id:
            branch_id = card.branch_id

        tx = Transaction(
            card_id=card.id, merchant_id=merchant.id, tx_type="earn",
            points_delta=0, amount=Decimal(str(amount)), note=final_note,
            staff_id=staff_id, branch_id=branch_id, applied_rules=[],
        )
        db.add(tx)
        await db.commit()
        await db.refresh(tx)

        gam = await gam_on_scan(
            user_id=card.user_id, merchant_id=merchant.id,
            amount=amount, points=0, db=db,
        )
        return {
            "id": tx.id, "card_id": tx.card_id, "merchant_id": tx.merchant_id,
            "tx_type": tx.tx_type, "points_delta": 0, "amount": float(tx.amount or 0),
            "note": tx.note, "staff_id": tx.staff_id, "branch_id": tx.branch_id,
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
            "card_points": card.points, "card_tier": card.tier,
            "applied": None, "reward_title": None, "gamification": gam,
            "loyalty_type": "stamp", "stamp_count": card.stamp_count,
            "stamp_threshold": threshold, "earned_free": False,
            "reward_ready": reward_ready, "already_full": already_full,
        }

    # Biznes "spend" turida — har xaridning summasini umumiy progressга qo'shamiz.
    # Maqsad summaga yetganda sovg'a beriladi va qoldiq keyingi davrga o'tadi.
    if getattr(merchant, "loyalty_type", "cashback") == "spend":
        goal = max(1000, int(getattr(merchant, "spend_goal", 1000000) or 1000000))
        card.spend_progress = (card.spend_progress or 0) + int(amount)
        earned_free = card.spend_progress >= goal
        reward_title = None
        if earned_free:
            card.spend_progress = card.spend_progress - goal  # qoldiq saqlanadi
            reward_title = getattr(merchant, "stamp_reward_title", "") or "Bepul mahsulot"
        card.last_used_at = datetime.now(timezone.utc)

        note_parts = []
        if body.note:
            note_parts.append(body.note)
        note_parts.append(f"🎁 {reward_title}" if earned_free
                          else f"💰 {card.spend_progress}/{goal}")
        final_note = " | ".join(note_parts)[:300]

        staff_id, branch_id = _extract_staff_info(authorization)
        if branch_id is None and card.branch_id:
            branch_id = card.branch_id

        tx = Transaction(
            card_id=card.id, merchant_id=merchant.id, tx_type="earn",
            points_delta=0, amount=Decimal(str(amount)), note=final_note,
            staff_id=staff_id, branch_id=branch_id, applied_rules=[],
        )
        db.add(tx)
        await db.commit()
        await db.refresh(tx)

        gam = await gam_on_scan(
            user_id=card.user_id, merchant_id=merchant.id,
            amount=amount, points=0, db=db,
        )
        return {
            "id": tx.id, "card_id": tx.card_id, "merchant_id": tx.merchant_id,
            "tx_type": tx.tx_type, "points_delta": 0, "amount": float(tx.amount or 0),
            "note": tx.note, "staff_id": tx.staff_id, "branch_id": tx.branch_id,
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
            "card_points": card.points, "card_tier": card.tier,
            "applied": None, "reward_title": reward_title, "gamification": gam,
            "loyalty_type": "spend", "spend_progress": card.spend_progress,
            "spend_goal": goal, "earned_free": earned_free,
        }

    # Yangi loyalty konstruktor qoidalari mavjudmi?
    has_new_rules = (await db.execute(
        select(LoyaltyRule.id).where(
            LoyaltyRule.merchant_id == merchant.id,
            LoyaltyRule.is_active.is_(True),
        ).limit(1)
    )).scalar_one_or_none() is not None

    applied_info = None
    reward_title = None

    if has_new_rules:
        eval_result = await evaluate_loyalty(merchant.id, card, amount, db)
        points = eval_result.total_points
        applied_info = [
            {"rule_type": a.rule_type, "name": a.name, "points": a.points, "note": a.note}
            for a in eval_result.applied
        ]
        reward_title = eval_result.reward_title
    else:
        # Backward-compat: eski PointRule mexanizmi
        rule_q = select(PointRule).where(PointRule.merchant_id == merchant.id)
        if body.rule_id:
            rule_q = rule_q.where(PointRule.id == body.rule_id)
        else:
            rule_q = rule_q.where(PointRule.is_active.is_(True)).limit(1)
        rule = (await db.execute(rule_q)).scalar_one_or_none()

        if rule is None:
            points = int(amount // 1000) if amount > 0 else 1
        else:
            points = _calc_points(rule, amount)

    if points <= 0:
        raise HTTPException(400, "Ball hisoblanmadi (summa yoki qoida noto'g'ri)")

    card.points += points
    card.tier = _recompute_tier(card.points, merchant)
    card.last_used_at = datetime.now(timezone.utc)

    note_parts = []
    if body.note:
        note_parts.append(body.note)
    if reward_title:
        note_parts.append(f"🎁 {reward_title}")
    final_note = " | ".join(note_parts)[:300]

    staff_id, branch_id = _extract_staff_info(authorization)
    # Branch fallback: kartaning o'z branch_id'si bo'lsa
    if branch_id is None and card.branch_id:
        branch_id = card.branch_id

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant.id,
        tx_type="earn",
        points_delta=points,
        amount=Decimal(str(amount)),
        note=final_note,
        staff_id=staff_id,
        branch_id=branch_id,
        applied_rules=applied_info or [],
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)

    # Gamification: XP, achievement, contest progress (no-op for unlinked cards)
    gam = await gam_on_scan(
        user_id=card.user_id,
        merchant_id=merchant.id,
        amount=amount,
        points=points,
        db=db,
    )

    return {
        "id": tx.id,
        "card_id": tx.card_id,
        "merchant_id": tx.merchant_id,
        "tx_type": tx.tx_type,
        "points_delta": tx.points_delta,
        "amount": float(tx.amount or 0),
        "note": tx.note,
        "staff_id": tx.staff_id,
        "branch_id": tx.branch_id,
        "created_at": tx.created_at.isoformat() if tx.created_at else None,
        "card_points": card.points,
        "card_tier": card.tier,
        "applied": applied_info,
        "reward_title": reward_title,
        "gamification": gam,
    }


@router.post("/redeem", response_model=TransactionOut, status_code=201,
             summary="Reward uchun ball yechish (redeem)")
async def redeem(
    body: RedeemRequest,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    # Row-level locks: prevent concurrent double-spend of points/stock.
    card = (await db.execute(
        select(Card).where(
            Card.card_uid == body.card_uid, Card.merchant_id == merchant.id
        ).with_for_update()
    )).scalar_one_or_none()
    if not card or not card.is_active:
        raise HTTPException(404, "Karta topilmadi")

    reward = (await db.execute(
        select(Reward).where(
            Reward.id == body.reward_id, Reward.merchant_id == merchant.id
        ).with_for_update()
    )).scalar_one_or_none()
    if not reward or not reward.is_active:
        raise HTTPException(404, "Reward mavjud emas")

    if card.points < reward.points_cost:
        raise HTTPException(400, "Yetarli ball yo'q")
    if reward.stock == 0:
        raise HTTPException(400, "Reward tugagan")

    card.points -= reward.points_cost
    card.tier = _recompute_tier(card.points, merchant)
    card.last_used_at = datetime.now(timezone.utc)
    if reward.stock > 0:
        reward.stock -= 1

    tx = Transaction(
        card_id=card.id,
        merchant_id=merchant.id,
        reward_id=reward.id,
        tx_type="redeem",
        points_delta=-reward.points_cost,
        amount=Decimal("0"),
        note=f"Redeem: {reward.title}",
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)

    # Gamification: XP + achievements (silent — merchant scanner doesn't show this)
    await gam_on_redeem(user_id=card.user_id, db=db)

    return tx


@router.get("", summary="Merchant tarixi")
async def merchant_history(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=500),
    offset: int = 0,
    tx_type: str | None = None,
    from_date: str | None = Query(None, description="ISO8601 lower bound (inclusive)"),
    to_date: str | None = Query(None, description="ISO8601 upper bound (exclusive)"),
    q: str | None = Query(None, description="Search by customer name/phone/note"),
):
    try:
        # Joins needed by the merchant transactions screen + detail sheet:
        # - Card/User: customer name & phone
        # - Reward: redeem detail ("what was redeemed")
        # - Branch/Staff: where the sale happened, who rang it up
        # All LEFT OUTER so anonymous / un-linked rows still appear.
        from datetime import datetime as _dt
        from models import MerchantBranch, MerchantStaff
        query = (
            select(Transaction, Card, User, Reward, MerchantBranch, MerchantStaff)
            .select_from(Transaction)
            .outerjoin(Card, Card.id == Transaction.card_id)
            .outerjoin(User, User.id == Card.user_id)
            .outerjoin(Reward, Reward.id == Transaction.reward_id)
            .outerjoin(MerchantBranch, MerchantBranch.id == Transaction.branch_id)
            .outerjoin(MerchantStaff, MerchantStaff.id == Transaction.staff_id)
            .where(Transaction.merchant_id == merchant.id)
        )
        if tx_type in ("earn", "redeem", "refund", "manual"):
            query = query.where(Transaction.tx_type == tx_type)
        if from_date:
            try:
                query = query.where(Transaction.created_at >= _dt.fromisoformat(from_date.replace("Z", "+00:00")))
            except ValueError:
                pass
        if to_date:
            try:
                query = query.where(Transaction.created_at < _dt.fromisoformat(to_date.replace("Z", "+00:00")))
            except ValueError:
                pass
        if q:
            like = f"%{q.strip()}%"
            query = query.where(
                (User.name.ilike(like)) | (User.phone.ilike(like)) | (Transaction.note.ilike(like))
            )
        query = query.order_by(Transaction.created_at.desc()).limit(limit).offset(offset)
        rows = (await db.execute(query)).all()
        return [
            {
                "id": t.id,
                "card_id": t.card_id,
                "card_uid": c.card_uid if c else None,
                "merchant_id": t.merchant_id,
                "tx_type": t.tx_type,
                "points_delta": t.points_delta,
                "amount": float(t.amount or 0),
                "note": t.note or "",
                "reward_id": t.reward_id,
                "reward_title": r.title if r else None,
                "branch_id": getattr(t, "branch_id", None),
                "branch_name": b.name if b else None,
                "staff_id": getattr(t, "staff_id", None),
                "staff_name": s.full_name if s else None,
                "provider": getattr(t, "provider", None),
                "external_ref": getattr(t, "external_ref", None),
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "customer_name": u.name if u else None,
                "customer_phone": u.phone if u else None,
            }
            for t, c, u, r, b, s in rows
        ]
    except Exception as e:
        from loguru import logger
        logger.error(f"merchant_history failed merchant_id={merchant.id}: {type(e).__name__}: {e}")
        # Fallback: enrichment join failed (column missing on a stale deploy,
        # SQL ambiguity, etc.). Return the bare transaction list so the merchant
        # dashboard never goes blank — detail sheet just shows fewer fields.
        try:
            simple_q = (
                select(Transaction)
                .where(Transaction.merchant_id == merchant.id)
                .order_by(Transaction.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            rows = (await db.execute(simple_q)).scalars().all()
            return [
                {
                    "id": t.id,
                    "card_id": t.card_id,
                    "card_uid": None,
                    "merchant_id": t.merchant_id,
                    "tx_type": t.tx_type,
                    "points_delta": t.points_delta,
                    "amount": float(t.amount or 0),
                    "note": t.note or "",
                    "reward_id": t.reward_id,
                    "reward_title": None,
                    "branch_id": getattr(t, "branch_id", None),
                    "branch_name": None,
                    "staff_id": getattr(t, "staff_id", None),
                    "staff_name": None,
                    "provider": getattr(t, "provider", None),
                    "external_ref": getattr(t, "external_ref", None),
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                    "customer_name": None,
                    "customer_phone": None,
                }
                for t in rows
            ]
        except Exception as e2:
            logger.error(f"merchant_history fallback also failed: {type(e2).__name__}: {e2}")
            raise HTTPException(500, f"Tarix xatosi: {type(e).__name__}: {str(e)[:200]}")


@router.get("/card/{card_uid}", response_model=list[TransactionOut],
            summary="Aniq karta tarixi")
async def card_history(
    card_uid: str,
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    card = (await db.execute(
        select(Card).where(
            Card.card_uid == card_uid, Card.merchant_id == merchant.id
        )
    )).scalar_one_or_none()
    if not card:
        raise HTTPException(404, "Karta topilmadi")
    q = (
        select(Transaction)
        .where(Transaction.card_id == card.id)
        .order_by(Transaction.created_at.desc())
        .limit(200)
    )
    return list((await db.execute(q)).scalars().all())


@router.get("/mine", summary="Foydalanuvchi tarixi (barcha kartalari bo'yicha)")
async def my_transactions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=500),
    offset: int = 0,
):
    rows = (await db.execute(
        select(Transaction, Card, Merchant, Reward)
        .join(Card, Card.id == Transaction.card_id)
        .join(Merchant, Merchant.id == Transaction.merchant_id)
        .outerjoin(Reward, Reward.id == Transaction.reward_id)
        .where(Card.user_id == user.id)
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )).all()

    # Determine reward unit per merchant: "som" if cashback-like, else "ball".
    # Cashback signals:
    #   - LoyaltyRule.rule_type in {cashback_percent, tier_cashback}
    #   - LoyaltyRule(classic_points) with amount_per_point <= 100 (1 ball ≈ 1 so'm)
    #   - PointRule(per_amount) with amount_per_point <= 100
    merchant_ids = {tx.merchant_id for tx, _, _, _ in rows}
    kind_by_merchant: dict[int, str] = {}
    if merchant_ids:
        loyalty_rows = (await db.execute(
            select(LoyaltyRule.merchant_id, LoyaltyRule.rule_type, LoyaltyRule.config)
            .where(LoyaltyRule.merchant_id.in_(merchant_ids))
            .where(LoyaltyRule.is_active.is_(True))
        )).all()
        for mid, rtype, cfg in loyalty_rows:
            if rtype in ("cashback_percent", "tier_cashback"):
                kind_by_merchant[mid] = "som"
            elif rtype == "classic_points":
                per = float((cfg or {}).get("amount_per_point") or 0)
                if 0 < per <= 100:
                    kind_by_merchant[mid] = "som"

        point_rule_rows = (await db.execute(
            select(PointRule.merchant_id, PointRule.amount_per_point)
            .where(PointRule.merchant_id.in_(merchant_ids))
            .where(PointRule.is_active.is_(True))
            .where(PointRule.rule_type == "per_amount")
        )).all()
        for mid, per in point_rule_rows:
            if mid in kind_by_merchant:
                continue
            per_f = float(per or 0)
            if 0 < per_f <= 100:
                kind_by_merchant[mid] = "som"

    return [
        {
            "id": tx.id,
            "card_id": tx.card_id,
            "card_uid": card.card_uid,
            "merchant_id": tx.merchant_id,
            "merchant_name": merchant.business_name,
            "merchant_logo": merchant.logo_url,
            "brand_color": merchant.brand_color,
            "reward_id": tx.reward_id,
            "reward_title": reward.title if reward else None,
            "tx_type": tx.tx_type,
            "points_delta": tx.points_delta,
            "amount": float(tx.amount or 0),
            "note": tx.note or "",
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
            "reward_kind": kind_by_merchant.get(tx.merchant_id, "ball"),
        }
        for tx, card, merchant, reward in rows
    ]


# ── Bugungi statistika ────────────────────────────────────────────────────────
@router.get("/today-stats", summary="Merchant: bugungi statistika")
async def merchant_today_stats(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
):
    from models import MerchantBranch
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    scans_today = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.merchant_id == merchant.id,
            Transaction.tx_type == "earn",
            Transaction.created_at >= today_start,
        )
    )).scalar_one() or 0

    redeems_today = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.merchant_id == merchant.id,
            Transaction.tx_type == "redeem",
            Transaction.created_at >= today_start,
        )
    )).scalar_one() or 0

    new_cards_today = (await db.execute(
        select(func.count(Card.id)).where(
            Card.merchant_id == merchant.id,
            Card.created_at >= today_start,
        )
    )).scalar_one() or 0

    revenue_today = (await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.merchant_id == merchant.id,
            Transaction.tx_type == "earn",
            Transaction.created_at >= today_start,
        )
    )).scalar_one() or 0

    return {
        "scans_today": int(scans_today),
        "redeems_today": int(redeems_today),
        "new_customers_today": int(new_cards_today),
        "revenue_today": float(revenue_today),
        "date": today_start.date().isoformat(),
    }


# ── CSV Export ────────────────────────────────────────────────────────────────
@router.get("/export", summary="Merchant tranzaksiyalarini CSV yuklash")
async def export_transactions_csv(
    merchant: Merchant = Depends(get_current_merchant),
    db: AsyncSession = Depends(get_db),
    from_date: str | None = Query(None),
    to_date: str | None = Query(None),
    tx_type: str | None = Query(None),
):
    from datetime import datetime as _dt
    from models import MerchantBranch, MerchantStaff

    query = (
        select(Transaction, Card, User, Reward, MerchantBranch, MerchantStaff)
        .select_from(Transaction)
        .outerjoin(Card, Card.id == Transaction.card_id)
        .outerjoin(User, User.id == Card.user_id)
        .outerjoin(Reward, Reward.id == Transaction.reward_id)
        .outerjoin(MerchantBranch, MerchantBranch.id == Transaction.branch_id)
        .outerjoin(MerchantStaff, MerchantStaff.id == Transaction.staff_id)
        .where(Transaction.merchant_id == merchant.id)
    )
    if tx_type in ("earn", "redeem", "refund", "manual"):
        query = query.where(Transaction.tx_type == tx_type)
    if from_date:
        try:
            query = query.where(Transaction.created_at >= _dt.fromisoformat(from_date.replace("Z", "+00:00")))
        except ValueError:
            pass
    if to_date:
        try:
            query = query.where(Transaction.created_at < _dt.fromisoformat(to_date.replace("Z", "+00:00")))
        except ValueError:
            pass
    query = query.order_by(Transaction.created_at.desc()).limit(10000)
    rows = (await db.execute(query)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Sana", "Tur", "Mijoz ismi", "Telefon", "Ball", "Summa",
        "Mukofot", "Filial", "Kassir", "Izoh"
    ])
    for t, c, u, r, b, s in rows:
        writer.writerow([
            t.created_at.strftime("%Y-%m-%d %H:%M") if t.created_at else "",
            t.tx_type,
            u.name if u else "",
            u.phone if u else "",
            t.points_delta,
            float(t.amount or 0),
            r.title if r else "",
            b.name if b else "",
            s.full_name if s else "",
            t.note or "",
        ])

    output.seek(0)
    filename = f"monvo-transactions-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
