"""
core/loyalty_engine.py
──────────────────────
Merchantning yoqilgan LoyaltyRule'larini tranzaksiya paytida baholaydi.

Asosiy API:
  evaluate(merchant_id, card, amount, db) -> EvaluateResult
    - total_points: yakuniy qo'shiladigan ball
    - applied: qo'llangan qoidalar ro'yxati (UI uchun)
    - reward_title: maxsus sovg'a nomi (punch_card / spend_threshold bo'lsa)

Qo'llaniladigan mantiq:
  1. Barcha is_active qoidalar priority bo'yicha tartiblanadi
  2. Har biri alohida baholanadi, natijalar yig'iladi
  3. Multiplier qoidalar (happy_hour) — bazaviy ballni ko'paytiradi
  4. Counter qoidalar (punch_card / spend_threshold) — LoyaltyProgress yangilanadi

Agar merchantda biror qoida yo'q bo'lsa — fallback: 1000 so'm = 1 ball
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Card, LoyaltyProgress, LoyaltyRule, Transaction, User


# ── Rule type catalog (UI konstruktor uchun schema) ──────────────────────────
RULE_TYPES = {
    "classic_points": {
        "label": "Klassik ball tizimi",
        "description": "Har N so'mga 1 ball beriladi",
        "icon": "coins",
        "fields": [
            {"key": "amount_per_point", "label": "Necha so'm = 1 ball", "type": "number", "default": 1000, "min": 1},
        ],
        "defaults": {"amount_per_point": 1000},
    },
    "per_visit": {
        "label": "Har tashrif uchun ball",
        "description": "Summa muhim emas — har skan uchun aniq ball",
        "icon": "door",
        "fields": [
            {"key": "points_per_visit", "label": "Har tashrifga ball", "type": "number", "default": 1, "min": 1},
        ],
        "defaults": {"points_per_visit": 1},
    },
    "cashback_percent": {
        "label": "Foizli cashback",
        "description": "Xarid summasining %'i ball sifatida qaytadi",
        "icon": "percent",
        "fields": [
            {"key": "percent", "label": "Cashback foizi (%)", "type": "number", "default": 5, "min": 0.1, "step": 0.1},
        ],
        "defaults": {"percent": 5},
    },
    "tier_cashback": {
        "label": "Tier bo'yicha cashback",
        "description": "Bronze/Silver/Gold/Platinum uchun alohida foiz",
        "icon": "crown",
        "fields": [
            {"key": "tiers.bronze", "label": "Bronze %", "type": "number", "default": 2, "min": 0},
            {"key": "tiers.silver", "label": "Silver %", "type": "number", "default": 4, "min": 0},
            {"key": "tiers.gold", "label": "Gold %", "type": "number", "default": 6, "min": 0},
            {"key": "tiers.platinum", "label": "Platinum %", "type": "number", "default": 8, "min": 0},
        ],
        "defaults": {"tiers": {"bronze": 2, "silver": 4, "gold": 6, "platinum": 8}},
    },
    "punch_card": {
        "label": "Punch card (N+1 bepul)",
        "description": "Har N-tashrif uchun maxsus sovg'a yoki bonus ball",
        "icon": "ticket",
        "fields": [
            {"key": "threshold", "label": "Nechta tashrif kerak", "type": "number", "default": 10, "min": 2},
            {"key": "reward_points", "label": "Bonus ballar", "type": "number", "default": 500, "min": 0},
            {"key": "reward_title", "label": "Sovg'a nomi", "type": "text", "default": "Bepul mahsulot"},
        ],
        "defaults": {"threshold": 10, "reward_points": 500, "reward_title": "Bepul mahsulot"},
    },
    "spend_threshold": {
        "label": "Savdo chegarasi uchun sovg'a",
        "description": "Muayyan davr ichida N so'mga savdo qilsa — sovg'a",
        "icon": "gift",
        "fields": [
            {"key": "threshold_amount", "label": "Savdo chegarasi (so'm)", "type": "number", "default": 500000, "min": 1000},
            {"key": "period_days", "label": "Davr (kun)", "type": "number", "default": 30, "min": 1, "max": 365},
            {"key": "reward_points", "label": "Bonus ballar", "type": "number", "default": 2000, "min": 0},
            {"key": "reward_title", "label": "Sovg'a nomi", "type": "text", "default": "VIP sovg'a"},
        ],
        "defaults": {"threshold_amount": 500000, "period_days": 30, "reward_points": 2000, "reward_title": "VIP sovg'a"},
    },
    "happy_hour": {
        "label": "Happy hour (ball ko'paytiruvchi)",
        "description": "Belgilangan kun/soatlarda bazaviy ball ×2, ×3",
        "icon": "clock",
        "fields": [
            {"key": "multiplier", "label": "Multiplier (×)", "type": "number", "default": 2, "min": 1.1, "step": 0.1},
            {"key": "days", "label": "Kunlar (0=Du ... 6=Ya)", "type": "days", "default": [5, 6]},
            {"key": "start_hour", "label": "Boshlanish (0-23)", "type": "number", "default": 15, "min": 0, "max": 23},
            {"key": "end_hour", "label": "Tugash (0-23)", "type": "number", "default": 17, "min": 0, "max": 23},
        ],
        "defaults": {"multiplier": 2, "days": [5, 6], "start_hour": 15, "end_hour": 17},
    },
    "first_visit": {
        "label": "Birinchi tashrif bonusi",
        "description": "Yangi kartaning birinchi skanirovkasiga qo'shimcha ball",
        "icon": "sparkles",
        "fields": [
            {"key": "bonus_points", "label": "Bonus ballar", "type": "number", "default": 500, "min": 0},
        ],
        "defaults": {"bonus_points": 500},
    },
    "birthday_bonus": {
        "label": "Tug'ilgan kun bonusi",
        "description": "Tug'ilgan kun atrofida qo'shimcha ball yoki multiplier",
        "icon": "cake",
        "fields": [
            {"key": "window_days", "label": "Kunlar oynasi (oldin/keyin)", "type": "number", "default": 3, "min": 0, "max": 30},
            {"key": "multiplier", "label": "Bazaviy ball multiplier (×)", "type": "number", "default": 2, "min": 1, "step": 0.1},
            {"key": "bonus_points", "label": "Qo'shimcha bonus ball", "type": "number", "default": 500, "min": 0},
            {"key": "once_per_year", "label": "Yiliga 1 marta (1=ha, 0=yo'q)", "type": "number", "default": 1, "min": 0, "max": 1},
        ],
        "defaults": {"window_days": 3, "multiplier": 2, "bonus_points": 500, "once_per_year": 1},
    },
    "referral": {
        "label": "Do'st taklif qilish",
        "description": "Taklif qilgan va taklif qilingan ikkovi ham ball oladi",
        "icon": "users",
        "fields": [
            {"key": "referrer_points", "label": "Taklif qilganga", "type": "number", "default": 1000, "min": 0},
            {"key": "referee_points", "label": "Yangi mijozga", "type": "number", "default": 500, "min": 0},
        ],
        "defaults": {"referrer_points": 1000, "referee_points": 500},
    },
}


@dataclass
class AppliedRule:
    rule_id: int
    rule_type: str
    name: str
    points: int
    note: str = ""


@dataclass
class EvaluateResult:
    total_points: int
    applied: List[AppliedRule] = field(default_factory=list)
    reward_title: Optional[str] = None  # maxsus sovg'a (punch_card / spend_threshold)


# ── Yordamchi funksiyalar ────────────────────────────────────────────────────
async def _get_card_birthday(db: AsyncSession, card: Card) -> Optional[datetime]:
    """Avval card.holder_birth_date, bo'lmasa user.birth_date."""
    if card.holder_birth_date:
        return card.holder_birth_date
    if card.user_id:
        u = (await db.execute(
            select(User.birth_date).where(User.id == card.user_id)
        )).scalar_one_or_none()
        if u:
            return u
    return None


def _in_birthday_window(birth: datetime, now: datetime, window_days: int) -> bool:
    """Bugun tug'ilgan kundan ±window_days ichida bo'lsa True."""
    # Joriy yil uchun tug'ilgan sanani quramiz
    try:
        this_year_bday = birth.replace(year=now.year)
    except ValueError:
        # 29 fevral → 28 fevral
        this_year_bday = birth.replace(year=now.year, day=28)
    diff = abs((now.date() - this_year_bday.date()).days)
    # Yilning oxirida — keyingi yildagi tug'ilgan kun ham yaqin bo'lishi mumkin
    next_year_bday = this_year_bday.replace(year=now.year + 1)
    diff2 = abs((now.date() - next_year_bday.date()).days)
    return min(diff, diff2) <= window_days


def _happy_multiplier(rules: List[LoyaltyRule], now: datetime) -> float:
    """Barcha happy_hour qoidalarning eng kattasi (aralash emas, eng katta)."""
    best = 1.0
    for r in rules:
        if r.rule_type != "happy_hour":
            continue
        cfg = r.config or {}
        days = cfg.get("days") or []
        if days and now.weekday() not in days:
            continue
        start_h = int(cfg.get("start_hour", 0))
        end_h = int(cfg.get("end_hour", 23))
        hour = now.hour
        in_range = (start_h <= hour < end_h) if start_h <= end_h else (hour >= start_h or hour < end_h)
        if not in_range:
            continue
        mult = float(cfg.get("multiplier", 1))
        if mult > best:
            best = mult
    return best


async def _get_or_create_progress(
    db: AsyncSession, rule_id: int, card_id: int
) -> LoyaltyProgress:
    p = (await db.execute(
        select(LoyaltyProgress).where(
            LoyaltyProgress.rule_id == rule_id,
            LoyaltyProgress.card_id == card_id,
        )
    )).scalar_one_or_none()
    if p:
        return p
    p = LoyaltyProgress(rule_id=rule_id, card_id=card_id)
    db.add(p)
    await db.flush()
    return p


# ── Asosiy evaluator ─────────────────────────────────────────────────────────
async def evaluate(
    merchant_id: int,
    card: Card,
    amount: float,
    db: AsyncSession,
    now: Optional[datetime] = None,
) -> EvaluateResult:
    now = now or datetime.now(timezone.utc)
    amount = float(amount or 0)

    rules = (await db.execute(
        select(LoyaltyRule)
        .where(LoyaltyRule.merchant_id == merchant_id, LoyaltyRule.is_active.is_(True))
        .order_by(LoyaltyRule.priority.asc(), LoyaltyRule.id.asc())
    )).scalars().all()

    # Fallback: hech qanday qoida yo'q
    if not rules:
        pts = int(amount // 1000) if amount > 0 else 1
        return EvaluateResult(total_points=pts, applied=[
            AppliedRule(0, "classic_points", "Default (1000 so'm = 1 ball)", pts),
        ])

    result = EvaluateResult(total_points=0)
    base_points = 0  # cashback / classic natijasi — happy_hour ularga ta'sir qiladi

    # Birthday oynasida ekanligini oldindan hisoblab olamiz (har xil ruleda qayta tekshirmaslik uchun)
    card_bday = await _get_card_birthday(db, card)

    for r in rules:
        cfg = r.config or {}
        t = r.rule_type

        if t == "classic_points":
            per = float(cfg.get("amount_per_point") or 1000)
            if per > 0 and amount > 0:
                pts = int(amount // per)
                if pts > 0:
                    base_points += pts
                    result.applied.append(AppliedRule(r.id, t, r.name or "Klassik ball", pts))

        elif t == "per_visit":
            pts = int(cfg.get("points_per_visit") or 0)
            if pts > 0:
                base_points += pts
                result.applied.append(AppliedRule(r.id, t, r.name or "Tashrif ball", pts))

        elif t == "cashback_percent":
            pct = float(cfg.get("percent") or 0)
            if pct > 0 and amount > 0:
                pts = int(amount * pct / 100.0)
                if pts > 0:
                    base_points += pts
                    result.applied.append(AppliedRule(r.id, t, r.name or f"Cashback {pct}%", pts))

        elif t == "tier_cashback":
            tiers = cfg.get("tiers") or {}
            pct = float(tiers.get(card.tier or "bronze", 0) or 0)
            if pct > 0 and amount > 0:
                pts = int(amount * pct / 100.0)
                if pts > 0:
                    base_points += pts
                    result.applied.append(AppliedRule(
                        r.id, t, r.name or f"Tier cashback ({card.tier} {pct}%)", pts
                    ))

        elif t == "first_visit":
            # Oldin tranzaksiya bo'lmaganmi — tekshiramiz
            had_tx = (await db.execute(
                select(Transaction.id).where(Transaction.card_id == card.id).limit(1)
            )).scalar_one_or_none()
            if not had_tx:
                pts = int(cfg.get("bonus_points") or 0)
                if pts > 0:
                    result.total_points += pts  # happy_hour'dan mustaqil
                    result.applied.append(AppliedRule(r.id, t, r.name or "Salom bonus", pts))

        elif t == "birthday_bonus":
            if not card_bday:
                continue  # Tug'ilgan kuni kiritilmagan — o'tkazamiz
            window = int(cfg.get("window_days") or 3)
            if not _in_birthday_window(card_bday, now, window):
                continue

            once_per_year = int(cfg.get("once_per_year", 1) or 0) == 1
            if once_per_year:
                p = await _get_or_create_progress(db, r.id, card.id)
                if p.last_reward_at:
                    # Shu yil ichida ishlatilganmi?
                    last = p.last_reward_at
                    days_since = (now - last).days
                    if days_since < 365 - (2 * window):
                        result.applied.append(AppliedRule(
                            r.id, t, r.name or "Tug'ilgan kun bonusi", 0,
                            note="Bu yil foydalanilgan",
                        ))
                        continue
                p.last_reward_at = now

            multiplier = float(cfg.get("multiplier") or 1)
            flat_bonus = int(cfg.get("bonus_points") or 0)

            # Multiplier — base_points'ga qo'shimcha ta'sir (happy_hour kabi)
            # Ammo bu yerda bazaviy ball hali to'liq shakllanmagan. Biz buni
            # final bosqichda qo'llaymiz. Hozir flat_bonus'ni qo'shamiz va
            # multiplier'ni alohida ro'yxatga olamiz.
            if flat_bonus > 0:
                result.total_points += flat_bonus
                result.applied.append(AppliedRule(
                    r.id, t, r.name or "🎂 Tug'ilgan kun bonusi", flat_bonus,
                    note="Tabriklaymiz!",
                ))

            # Birthday multiplier'ni happy_hour'ga o'xshash saqlaymiz
            if multiplier > 1.0:
                # Keyingi bosqichda base_points'ga qo'llash uchun
                # result.applied'ga marker qo'yamiz va mult'ni birthday_mult_pending
                # orqali uzatamiz. Oddiy yechim — shu yerda bevosita alohida
                # tracking vars qo'shamiz.
                setattr(result, "_birthday_mult", max(getattr(result, "_birthday_mult", 1.0), multiplier))
                setattr(result, "_birthday_rule_id", r.id)
                setattr(result, "_birthday_rule_name", r.name or "🎂 Tug'ilgan kun")

        elif t == "punch_card":
            threshold = int(cfg.get("threshold") or 0)
            if threshold > 1:
                p = await _get_or_create_progress(db, r.id, card.id)
                p.progress_count = (p.progress_count or 0) + 1
                if p.progress_count >= threshold:
                    pts = int(cfg.get("reward_points") or 0)
                    title = str(cfg.get("reward_title") or "Bepul mahsulot")
                    p.progress_count = 0
                    p.last_reward_at = now
                    result.total_points += pts
                    result.reward_title = title
                    result.applied.append(AppliedRule(
                        r.id, t, r.name or "Punch card", pts,
                        note=f"{threshold}-tashrif: {title}",
                    ))
                else:
                    remaining = threshold - p.progress_count
                    result.applied.append(AppliedRule(
                        r.id, t, r.name or "Punch card", 0,
                        note=f"{p.progress_count}/{threshold} (yana {remaining} ta qoldi)",
                    ))

        elif t == "spend_threshold":
            threshold_amt = float(cfg.get("threshold_amount") or 0)
            period_days = int(cfg.get("period_days") or 30)
            if threshold_amt > 0:
                p = await _get_or_create_progress(db, r.id, card.id)
                # Davr tugagan bo'lsa — reset
                period_ts = p.period_start or now
                if (now - period_ts) > timedelta(days=period_days):
                    p.progress_amount = Decimal("0")
                    p.period_start = now
                p.progress_amount = (p.progress_amount or Decimal("0")) + Decimal(str(amount))
                if float(p.progress_amount) >= threshold_amt:
                    pts = int(cfg.get("reward_points") or 0)
                    title = str(cfg.get("reward_title") or "VIP sovg'a")
                    p.progress_amount = Decimal("0")
                    p.period_start = now
                    p.last_reward_at = now
                    result.total_points += pts
                    result.reward_title = title
                    result.applied.append(AppliedRule(
                        r.id, t, r.name or "Savdo chegarasi", pts,
                        note=f"{threshold_amt:,.0f} so'm chegarasi: {title}",
                    ))
                else:
                    remaining = threshold_amt - float(p.progress_amount)
                    result.applied.append(AppliedRule(
                        r.id, t, r.name or "Savdo chegarasi", 0,
                        note=f"{float(p.progress_amount):,.0f}/{threshold_amt:,.0f} so'm",
                    ))

        # happy_hour va referral bu yerda hisoblanmaydi (happy_hour multiplier keyin)

    # Happy hour multiplier — faqat base_points'ga ta'sir qiladi
    mult = _happy_multiplier(rules, now)
    if mult > 1.0 and base_points > 0:
        bonus = int(base_points * mult) - base_points
        if bonus > 0:
            result.applied.append(AppliedRule(
                0, "happy_hour", f"Happy hour ×{mult}", bonus,
            ))
            base_points += bonus

    # Birthday multiplier — base_points'ga
    bday_mult = getattr(result, "_birthday_mult", 1.0)
    if bday_mult > 1.0 and base_points > 0:
        bonus = int(base_points * bday_mult) - base_points
        if bonus > 0:
            result.applied.append(AppliedRule(
                getattr(result, "_birthday_rule_id", 0),
                "birthday_bonus",
                f"🎂 {getattr(result, '_birthday_rule_name', 'Tug''ilgan kun')} ×{bday_mult}",
                bonus,
            ))
            base_points += bonus

    result.total_points += base_points
    return result
