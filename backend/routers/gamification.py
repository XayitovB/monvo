"""
routers/gamification.py
───────────────────────
User-facing gamification endpoints.

  GET  /gamification/me               — XP, level, streak, totals
  GET  /gamification/achievements     — barcha badge + olingan/olingan emas
  GET  /gamification/leaderboard      — global XP reytingi (top 100)
  GET  /gamification/leaderboard/merchant/{merchant_id} — merchant ichida reyting
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from core.gamification import get_or_create_stats, xp_progress
from database import get_db
from models import (
    Achievement,
    Card,
    Transaction,
    User,
    UserAchievement,
    UserStats,
)
from schemas import (
    AchievementWithStatus,
    LeaderboardEntry,
    LeaderboardOut,
    UserStatsOut,
)

router = APIRouter(prefix="/gamification", tags=["🏆 Gamification"])


# ── Profile / stats ───────────────────────────────────────────────────────────
@router.get("/me", response_model=UserStatsOut, summary="Mening XP, darajam va streak")
async def my_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stats = await get_or_create_stats(user.id, db)
    await db.commit()  # commit if a new row was created

    level, xp_to_next, percent = xp_progress(stats.xp or 0)
    return UserStatsOut(
        user_id=user.id,
        xp=stats.xp or 0,
        level=level,
        xp_to_next_level=xp_to_next,
        progress_percent=percent,
        total_scans=stats.total_scans or 0,
        total_redeems=stats.total_redeems or 0,
        total_spent=float(stats.total_spent or 0),
        unique_merchants=stats.unique_merchants or 0,
        streak_days=stats.streak_days or 0,
        longest_streak=stats.longest_streak or 0,
        last_activity_date=stats.last_activity_date,
    )


# ── Achievements ──────────────────────────────────────────────────────────────
@router.get(
    "/achievements",
    response_model=list[AchievementWithStatus],
    summary="Mening achievementlarim (olingan + olinmagan)",
)
async def my_achievements(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    category: Optional[str] = Query(None, description="Filter: scanner|spender|streak|explorer|general"),
):
    stats = await get_or_create_stats(user.id, db)
    await db.commit()

    q = select(Achievement).where(Achievement.is_active.is_(True))
    if category:
        q = q.where(Achievement.category == category)
    q = q.order_by(Achievement.sort_order.asc(), Achievement.id.asc())
    achievements = (await db.execute(q)).scalars().all()

    earned_map = {
        ach_id: earned_at
        for (ach_id, earned_at) in (await db.execute(
            select(UserAchievement.achievement_id, UserAchievement.earned_at)
            .where(UserAchievement.user_id == user.id)
        )).all()
    }

    def progress_for(criteria_type: str) -> int:
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

    # Pick title/description per user language with fallback to default (uz).
    is_ru = (user.language or "uz").lower() == "ru"

    def _t(default: str, alt: str | None) -> str:
        if is_ru and alt:
            return alt
        return default or ""

    return [
        AchievementWithStatus(
            id=a.id,
            code=a.code,
            title=_t(a.title, a.title_ru),
            description=_t(a.description or "", a.description_ru),
            title_ru=a.title_ru or "",
            description_ru=a.description_ru or "",
            icon=a.icon,
            color=a.color,
            category=a.category,
            criteria_type=a.criteria_type,
            criteria_threshold=a.criteria_threshold,
            xp_reward=a.xp_reward,
            sort_order=a.sort_order,
            is_earned=a.id in earned_map,
            earned_at=earned_map.get(a.id),
            progress_current=progress_for(a.criteria_type),
        )
        for a in achievements
    ]


# ── Global leaderboard (XP based) ─────────────────────────────────────────────
@router.get(
    "/leaderboard",
    response_model=LeaderboardOut,
    summary="Global reyting (XP bo'yicha top 100)",
)
async def global_leaderboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=500),
):
    # Top entries by XP
    rows = (await db.execute(
        select(UserStats.user_id, UserStats.xp, UserStats.level, User.name)
        .join(User, User.id == UserStats.user_id)
        .where(User.is_active.is_(True))
        .order_by(desc(UserStats.xp), UserStats.user_id.asc())
        .limit(limit)
    )).all()

    badge_counts = dict((await db.execute(
        select(UserAchievement.user_id, func.count(UserAchievement.id))
        .where(UserAchievement.user_id.in_([r[0] for r in rows]) if rows else [-1])
        .group_by(UserAchievement.user_id)
    )).all()) if rows else {}

    entries = [
        LeaderboardEntry(
            rank=idx,
            user_id=uid,
            user_name=name or "User",
            score=int(xp or 0),
            level=int(lvl or 1),
            badge_count=int(badge_counts.get(uid, 0) or 0),
            is_me=(uid == user.id),
        )
        for idx, (uid, xp, lvl, name) in enumerate(rows, start=1)
    ]

    # Find my rank if I'm not in top
    my_rank = next((e.rank for e in entries if e.is_me), None)
    my_score = next((e.score for e in entries if e.is_me), None)

    if my_rank is None:
        # Compute approximate rank by XP comparison
        my_stats_row = (await db.execute(
            select(UserStats.xp).where(UserStats.user_id == user.id)
        )).scalar_one_or_none()
        my_xp = int(my_stats_row or 0)
        my_score = my_xp
        higher_count = (await db.execute(
            select(func.count(UserStats.id)).where(UserStats.xp > my_xp)
        )).scalar() or 0
        my_rank = int(higher_count) + 1

    total_users = (await db.execute(
        select(func.count(UserStats.id))
    )).scalar() or 0

    return LeaderboardOut(
        entries=entries,
        my_rank=my_rank,
        my_score=my_score,
        total_users=int(total_users),
    )


# ── Per-merchant leaderboard (points-based) ───────────────────────────────────
@router.get(
    "/leaderboard/merchant/{merchant_id}",
    response_model=LeaderboardOut,
    summary="Merchant ichida reyting (kartadagi ball bo'yicha)",
)
async def merchant_leaderboard(
    merchant_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, le=200),
):
    # Aggregate points per user_id for this merchant (skip cards w/o user_id)
    rows = (await db.execute(
        select(
            Card.user_id,
            User.name,
            func.sum(Card.points).label("total_points"),
        )
        .join(User, User.id == Card.user_id)
        .where(
            Card.merchant_id == merchant_id,
            Card.is_active.is_(True),
            Card.user_id.is_not(None),
        )
        .group_by(Card.user_id, User.name)
        .order_by(desc("total_points"))
        .limit(limit)
    )).all()

    entries = [
        LeaderboardEntry(
            rank=idx,
            user_id=uid,
            user_name=name or "User",
            score=int(pts or 0),
            is_me=(uid == user.id),
        )
        for idx, (uid, name, pts) in enumerate(rows, start=1)
    ]

    my_rank = next((e.rank for e in entries if e.is_me), None)
    my_score = next((e.score for e in entries if e.is_me), None)

    if my_rank is None:
        my_pts_row = (await db.execute(
            select(func.coalesce(func.sum(Card.points), 0))
            .where(
                Card.merchant_id == merchant_id,
                Card.user_id == user.id,
                Card.is_active.is_(True),
            )
        )).scalar() or 0
        my_score = int(my_pts_row)
        if my_score > 0:
            higher = (await db.execute(
                select(func.count(func.distinct(Card.user_id)))
                .where(
                    Card.merchant_id == merchant_id,
                    Card.is_active.is_(True),
                    Card.user_id.is_not(None),
                )
            )).scalar() or 0
            my_rank = int(higher) + 1  # rough estimate

    total_count = (await db.execute(
        select(func.count(func.distinct(Card.user_id)))
        .where(
            Card.merchant_id == merchant_id,
            Card.is_active.is_(True),
            Card.user_id.is_not(None),
        )
    )).scalar() or 0

    return LeaderboardOut(
        entries=entries,
        my_rank=my_rank,
        my_score=my_score,
        total_users=int(total_count),
    )
