"""
core/gamification.py
────────────────────
Gamification engine — XP, level, streak, achievement va contest progress.

Key entry points:
  - on_scan(user_id, merchant_id, amount, points, db) — scan event hook
  - on_redeem(user_id, db) — redeem event hook
  - get_or_create_stats(user_id, db) — UserStats row helper
  - level_for_xp(xp) — XP → level conversion
  - xp_for_level(level) — level → required XP
"""
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

from loguru import logger
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Achievement,
    Card,
    Contest,
    ContestParticipant,
    Transaction,
    UserAchievement,
    UserStats,
)


# ── Level system ──────────────────────────────────────────────────────────────
# Quadratic curve: level N requires 100 * N^2 XP cumulative.
# Level 1 → 0, Level 2 → 100, Level 3 → 400, Level 4 → 900, Level 5 → 1600, ...
def xp_for_level(level: int) -> int:
    """Total XP required to reach a given level."""
    if level <= 1:
        return 0
    return 100 * (level - 1) * (level - 1)


def level_for_xp(xp: int) -> int:
    """Calculate level from total XP."""
    if xp < 100:
        return 1
    # Solve 100*(L-1)^2 <= xp → L = floor(sqrt(xp/100)) + 1
    import math
    return int(math.floor(math.sqrt(xp / 100))) + 1


def xp_progress(xp: int) -> tuple[int, int, int]:
    """Returns (level, xp_to_next, percent_in_current_level)."""
    level = level_for_xp(xp)
    cur_threshold = xp_for_level(level)
    next_threshold = xp_for_level(level + 1)
    span = next_threshold - cur_threshold
    in_level = xp - cur_threshold
    percent = int((in_level / span) * 100) if span > 0 else 0
    return level, max(0, next_threshold - xp), max(0, min(100, percent))


# ── XP rewards (per action) ───────────────────────────────────────────────────
XP_PER_SCAN = 10              # base
XP_PER_THOUSAND_SOM = 1       # extra: 1 XP per 1k UZS spent
XP_PER_REDEEM = 25
XP_STREAK_BONUS_PER_DAY = 5   # +5 XP * streak_days on each scan


# ── Helpers ───────────────────────────────────────────────────────────────────
async def get_or_create_stats(user_id: int, db: AsyncSession) -> UserStats:
    row = (await db.execute(
        select(UserStats).where(UserStats.user_id == user_id)
    )).scalar_one_or_none()
    if row is None:
        row = UserStats(user_id=user_id)
        db.add(row)
        await db.flush()
    return row


def _today_utc() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _update_streak(stats: UserStats) -> None:
    """Update streak based on last_activity_date vs today."""
    today = _today_utc()
    last = stats.last_activity_date
    if last is None:
        stats.streak_days = 1
    else:
        last_day = last.replace(hour=0, minute=0, second=0, microsecond=0)
        delta = (today - last_day).days
        if delta == 0:
            return  # already counted today
        elif delta == 1:
            stats.streak_days = (stats.streak_days or 0) + 1
        else:
            stats.streak_days = 1
    stats.last_activity_date = datetime.now(timezone.utc)
    if stats.streak_days > (stats.longest_streak or 0):
        stats.longest_streak = stats.streak_days


# ── Achievement check ─────────────────────────────────────────────────────────
def _criteria_value(stats: UserStats, criteria_type: str) -> int:
    """Map criteria_type → current numeric value from stats."""
    if criteria_type == "total_scans":
        return stats.total_scans or 0
    if criteria_type == "unique_merchants":
        return stats.unique_merchants or 0
    if criteria_type == "total_spent":
        return int(stats.total_spent or 0)
    if criteria_type == "total_redeems":
        return stats.total_redeems or 0
    if criteria_type == "streak_days":
        return stats.streak_days or 0
    if criteria_type == "level_reached":
        return stats.level or 1
    return 0


async def check_and_award_achievements(
    user_id: int, stats: UserStats, db: AsyncSession
) -> list[Achievement]:
    """Walk through active achievements and award any newly-met ones.

    Returns the list of newly awarded Achievement rows so the caller can
    surface them (e.g. mobile toast: "Yangi achievement!").
    """
    earned_ids = {
        r for (r,) in (await db.execute(
            select(UserAchievement.achievement_id).where(UserAchievement.user_id == user_id)
        )).all()
    }
    achievements = (await db.execute(
        select(Achievement).where(Achievement.is_active.is_(True))
    )).scalars().all()

    newly_awarded: list[Achievement] = []
    for ach in achievements:
        if ach.id in earned_ids:
            continue
        current = _criteria_value(stats, ach.criteria_type)
        if current >= ach.criteria_threshold:
            db.add(UserAchievement(user_id=user_id, achievement_id=ach.id))
            stats.xp = (stats.xp or 0) + (ach.xp_reward or 0)
            newly_awarded.append(ach)
            logger.info(
                f"[gamification] user={user_id} earned '{ach.code}' (+{ach.xp_reward} XP)"
            )
    if newly_awarded:
        # Recompute level after XP boost
        stats.level = level_for_xp(stats.xp)
    return newly_awarded


# ── Contest progress ──────────────────────────────────────────────────────────
async def update_active_contests(
    user_id: int,
    *,
    scan_delta: int = 0,
    spent_delta: float = 0,
    streak_value: int = 0,
    xp_delta: int = 0,
    merchant_id: Optional[int] = None,
    db: AsyncSession,
) -> None:
    """Bump score for the user in any contest currently running.

    Auto-join if contest.auto_join is True. Contest types:
      - top_scanner: +scan_delta
      - top_spender: +spent_delta (rounded to int)
      - top_xp:      +xp_delta
      - top_streak:  set absolute streak_value (max of current vs new)
    """
    now = datetime.now(timezone.utc)
    q = select(Contest).where(
        Contest.status == "active",
        Contest.starts_at <= now,
        Contest.ends_at >= now,
    )
    contests = (await db.execute(q)).scalars().all()
    if not contests:
        return

    for contest in contests:
        # Merchant-scoped contest: only count events at this merchant
        if contest.merchant_id is not None:
            if merchant_id is None or merchant_id != contest.merchant_id:
                continue

        # Find or auto-create participant row
        part = (await db.execute(
            select(ContestParticipant).where(
                ContestParticipant.contest_id == contest.id,
                ContestParticipant.user_id == user_id,
            )
        )).scalar_one_or_none()

        if part is None:
            if not contest.auto_join:
                continue
            part = ContestParticipant(contest_id=contest.id, user_id=user_id, score=0)
            db.add(part)
            await db.flush()

        # Bump score by contest type
        if contest.contest_type == "top_scanner":
            part.score = (part.score or 0) + max(0, int(scan_delta))
        elif contest.contest_type == "top_spender":
            part.score = (part.score or 0) + max(0, int(spent_delta))
        elif contest.contest_type == "top_xp":
            part.score = (part.score or 0) + max(0, int(xp_delta))
        elif contest.contest_type == "top_streak":
            if streak_value > (part.score or 0):
                part.score = int(streak_value)


# ── Public hooks ──────────────────────────────────────────────────────────────
async def on_scan(
    *,
    user_id: Optional[int],
    merchant_id: int,
    amount: float,
    points: int,
    db: AsyncSession,
) -> dict:
    """Hook called from transactions.scan_earn AFTER the Transaction commits.

    The caller's session has already committed the scan (card.points changed,
    Transaction row written). We open a fresh session for gamification so a
    failure here cannot affect — or be affected by — that primary commit.

    Returns a dict with `xp_gained`, `level_up`, `new_achievements` so the
    caller can include it in the API response (mobile shows badge toast).

    Safe-by-default: if user_id is None (anonymous card with no linked user),
    silently no-ops.
    """
    if not user_id:
        return {"xp_gained": 0, "level_up": False, "new_achievements": []}

    from database import AsyncSessionLocal
    db = AsyncSessionLocal()  # noqa: F811 — shadow on purpose, isolated session

    try:
        stats = await get_or_create_stats(user_id, db)
        old_level = stats.level or 1

        # Update counters
        stats.total_scans = (stats.total_scans or 0) + 1
        stats.total_spent = (stats.total_spent or Decimal(0)) + Decimal(str(amount or 0))

        # Recompute unique_merchants by counting distinct merchant_id in user's cards
        # (Cheap when user has <100 cards; if it grows, cache this.)
        unique_count = (await db.execute(
            select(func.count(func.distinct(Card.merchant_id)))
            .where(Card.user_id == user_id)
        )).scalar() or 0
        stats.unique_merchants = int(unique_count)

        _update_streak(stats)

        # XP calculation
        xp_gained = XP_PER_SCAN
        xp_gained += int((amount or 0) // 1000) * XP_PER_THOUSAND_SOM
        xp_gained += (stats.streak_days or 0) * XP_STREAK_BONUS_PER_DAY
        stats.xp = (stats.xp or 0) + xp_gained
        stats.level = level_for_xp(stats.xp)

        # Achievements
        new_achs = await check_and_award_achievements(user_id, stats, db)

        # Contests
        await update_active_contests(
            user_id,
            scan_delta=1,
            spent_delta=float(amount or 0),
            streak_value=stats.streak_days or 0,
            xp_delta=xp_gained,
            merchant_id=merchant_id,
            db=db,
        )

        await db.commit()

        return {
            "xp_gained": xp_gained,
            "level_up": stats.level > old_level,
            "level": stats.level,
            "new_achievements": [
                {"code": a.code, "title": a.title, "icon": a.icon, "xp_reward": a.xp_reward}
                for a in new_achs
            ],
        }
    except Exception as exc:
        logger.warning(f"[gamification] on_scan failed user={user_id}: {exc}")
        try:
            await db.rollback()
        except Exception:
            pass
        return {"xp_gained": 0, "level_up": False, "new_achievements": []}
    finally:
        try:
            await db.close()
        except Exception:
            pass


async def on_redeem(*, user_id: Optional[int], db: AsyncSession) -> dict:
    """Hook called AFTER a successful redeem commits.

    Like on_scan, runs in a fresh session — caller's redeem is already
    permanent and cannot be unwound by a gamification error.
    """
    if not user_id:
        return {"xp_gained": 0, "new_achievements": []}
    from database import AsyncSessionLocal
    db = AsyncSessionLocal()  # noqa: F811 — shadow on purpose, isolated session
    try:
        stats = await get_or_create_stats(user_id, db)
        stats.total_redeems = (stats.total_redeems or 0) + 1
        stats.xp = (stats.xp or 0) + XP_PER_REDEEM
        stats.level = level_for_xp(stats.xp)
        new_achs = await check_and_award_achievements(user_id, stats, db)
        await update_active_contests(
            user_id,
            xp_delta=XP_PER_REDEEM,
            db=db,
        )
        await db.commit()
        return {
            "xp_gained": XP_PER_REDEEM,
            "level": stats.level,
            "new_achievements": [
                {"code": a.code, "title": a.title, "icon": a.icon}
                for a in new_achs
            ],
        }
    except Exception as exc:
        logger.warning(f"[gamification] on_redeem failed user={user_id}: {exc}")
        try:
            await db.rollback()
        except Exception:
            pass
        return {"xp_gained": 0, "new_achievements": []}
    finally:
        try:
            await db.close()
        except Exception:
            pass


# ── Background: finish expired contests ───────────────────────────────────────
async def finalize_expired_contests(db: AsyncSession) -> int:
    """Mark contests whose ends_at has passed as 'finished', compute ranks,
    flag winners, and award prize_xp to top max_winners.

    Returns count of newly finalized contests. Safe to call repeatedly.
    """
    now = datetime.now(timezone.utc)
    expired = (await db.execute(
        select(Contest).where(
            Contest.status == "active",
            Contest.ends_at < now,
        )
    )).scalars().all()

    finalized = 0
    for contest in expired:
        # Rank participants by score desc
        parts = (await db.execute(
            select(ContestParticipant)
            .where(ContestParticipant.contest_id == contest.id)
            .order_by(ContestParticipant.score.desc(), ContestParticipant.joined_at.asc())
        )).scalars().all()

        for idx, p in enumerate(parts, start=1):
            p.rank = idx
            if idx <= (contest.max_winners or 0) and (p.score or 0) > 0:
                p.is_winner = True
                # Award prize XP to user_stats
                stats = await get_or_create_stats(p.user_id, db)
                stats.xp = (stats.xp or 0) + (contest.prize_xp or 0)
                stats.level = level_for_xp(stats.xp)

        contest.status = "finished"
        finalized += 1

    if finalized:
        await db.commit()
        logger.info(f"[gamification] finalized {finalized} contests")
    return finalized
