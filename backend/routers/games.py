"""
routers/games.py
────────────────
Mini games endpoints — Clicker, 2048, Daily Spin.

Anti-cheat:
  - /games/start issues a session_token bound to (user, game_type, time)
  - /games/finish must arrive within game's time window with a score
    inside that game's plausible bounds; otherwise marked invalid
  - daily attempt limit per game prevents farming

Scoring:
  - clicker: 30s, max 200 taps; XP = score / 2 (capped at 100)
  - 2048:    no time cap, max 999_999 score; XP = score / 50 (capped at 200)
  - spin:    1 per 24h, server picks weighted random prize from spin_prizes

Leaderboard endpoint reads game_sessions where status='finished'.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from core.gamification import (
    check_and_award_achievements,
    get_or_create_stats,
    level_for_xp,
    update_active_contests,
)

# Cryptographic RNG so prizes can't be predicted via Mersenne Twister state.
_secure_rng = secrets.SystemRandom()
from database import get_db
from models import (
    GameSession,
    SpinHistory,
    SpinPrize,
    User,
)
from schemas import (
    GameFinishRequest,
    GameFinishResponse,
    GameStartRequest,
    GameStartResponse,
    LeaderboardEntry,
    LeaderboardOut,
    SpinPrizeOut,
    SpinResultResponse,
    SpinStatusResponse,
)

router = APIRouter(prefix="/games", tags=["🎮 Games"])

# ── Per-game config ──────────────────────────────────────────────────────────
GAME_CONFIG = {
    "clicker": {
        "max_seconds": 60,        # session expires after 60s (real game is 30s)
        "min_seconds": 5,         # under 5s of play is suspicious
        "max_score": 250,         # >250 taps in 30s ≈ 8/sec, beyond human
        "xp_per_score": 0.5,      # XP = score * 0.5
        "max_xp_per_game": 100,
        "daily_limit": 5,
    },
    "2048": {
        "max_seconds": 1800,      # 30 min cap
        "min_seconds": 10,        # under 10s is impossible
        "max_score": 999999,
        "xp_per_score": 0.02,     # XP = score * 0.02 (so 5000 score = 100 XP)
        "max_xp_per_game": 200,
        "daily_limit": 3,
    },
}

SPIN_COOLDOWN_HOURS = 24


def _today_window():
    """Return (start, end) of current UTC day."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


async def _daily_attempts_used(user_id: int, game_type: str, db: AsyncSession) -> int:
    start, end = _today_window()
    count = (await db.execute(
        select(func.count(GameSession.id)).where(
            GameSession.user_id == user_id,
            GameSession.game_type == game_type,
            GameSession.started_at >= start,
            GameSession.started_at < end,
            GameSession.status.in_(("started", "finished")),
        )
    )).scalar() or 0
    return int(count)


# ── Clicker / 2048 ───────────────────────────────────────────────────────────
@router.post("/start", response_model=GameStartResponse, summary="O'yin sessiyasini boshlash")
async def start_game(
    body: GameStartRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = GAME_CONFIG.get(body.game_type)
    if not cfg:
        raise HTTPException(400, f"Noto'g'ri game_type. Ruxsat: {list(GAME_CONFIG.keys())}")

    # Race-safe: lock the user's row so two parallel /start calls serialise.
    # SELECT FOR UPDATE on the user row is enough — Postgres holds the row
    # lock until commit/rollback, blocking the second insert from undercount.
    await db.execute(
        select(User.id).where(User.id == user.id).with_for_update()
    )

    used = await _daily_attempts_used(user.id, body.game_type, db)
    if used >= cfg["daily_limit"]:
        await db.commit()  # release the user row lock
        raise HTTPException(429, f"Kunlik limit tugadi ({cfg['daily_limit']} marta). Ertaga qaytadan urinib ko'ring.")

    token = secrets.token_urlsafe(32)
    session = GameSession(
        user_id=user.id,
        game_type=body.game_type,
        session_token=token,
        status="started",
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return GameStartResponse(
        session_token=token,
        started_at=session.started_at,
        daily_attempts_remaining=cfg["daily_limit"] - used - 1,
    )


@router.get("/quota", summary="Kunlik o'yin attempt'lari qoldig'i")
async def games_quota(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hub ekrani uchun — har 3 ta o'yin va spin uchun nechta attempt qolgan."""
    out: dict = {}
    for game_type, cfg in GAME_CONFIG.items():
        used = await _daily_attempts_used(user.id, game_type, db)
        out[game_type] = {
            "daily_limit": cfg["daily_limit"],
            "used": used,
            "remaining": max(0, cfg["daily_limit"] - used),
        }

    # Spin: based on last spin time
    last = (await db.execute(
        select(SpinHistory.won_at)
        .where(SpinHistory.user_id == user.id)
        .order_by(SpinHistory.won_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    can_spin = True
    seconds_until = 0
    if last:
        next_at = last + timedelta(hours=SPIN_COOLDOWN_HOURS)
        now = datetime.now(timezone.utc)
        if next_at > now:
            can_spin = False
            seconds_until = int((next_at - now).total_seconds())
    out["spin"] = {"can_spin": can_spin, "seconds_until_next": seconds_until}
    return out


@router.post("/finish", response_model=GameFinishResponse, summary="O'yin sessiyasini yakunlash")
async def finish_game(
    body: GameFinishRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = (await db.execute(
        select(GameSession).where(
            GameSession.session_token == body.session_token,
            GameSession.user_id == user.id,
        )
    )).scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Sessiya topilmadi")
    if session.status != "started":
        raise HTTPException(400, f"Sessiya allaqachon yakunlangan ({session.status})")

    cfg = GAME_CONFIG[session.game_type]

    now = datetime.now(timezone.utc)
    elapsed = (now - session.started_at).total_seconds()
    score = max(0, int(body.score))

    # Anti-cheat checks
    invalid = False
    reason = None
    if elapsed > cfg["max_seconds"]:
        invalid, reason = True, f"timeout ({elapsed:.0f}s > {cfg['max_seconds']}s)"
    elif elapsed < cfg["min_seconds"]:
        invalid, reason = True, f"too fast ({elapsed:.1f}s < {cfg['min_seconds']}s)"
    elif score > cfg["max_score"]:
        invalid, reason = True, f"score over cap ({score} > {cfg['max_score']})"

    session.score = score
    session.duration_seconds = int(elapsed)
    session.finished_at = now

    if invalid:
        session.status = "invalid"
        session.xp_earned = 0
        await db.commit()
        logger.warning(f"[games] invalid session user={user.id} game={session.game_type} reason={reason}")
        return GameFinishResponse(
            accepted=False,
            score=score,
            xp_earned=0,
            new_total_xp=0,
            new_level=1,
            new_achievements=[],
        )

    # Compute XP
    xp = min(int(score * cfg["xp_per_score"]), cfg["max_xp_per_game"])
    session.xp_earned = xp
    session.status = "finished"

    # Award XP to UserStats
    stats = await get_or_create_stats(user.id, db)
    stats.xp = (stats.xp or 0) + xp
    stats.level = level_for_xp(stats.xp)

    new_achs = await check_and_award_achievements(user.id, stats, db)

    # Update any active contests (top_xp contests will count this XP)
    await update_active_contests(user.id, xp_delta=xp, db=db)

    await db.commit()

    return GameFinishResponse(
        accepted=True,
        score=score,
        xp_earned=xp,
        new_total_xp=stats.xp,
        new_level=stats.level,
        new_achievements=[
            {"code": a.code, "title": a.title, "icon": a.icon, "xp_reward": a.xp_reward}
            for a in new_achs
        ],
    )


@router.get(
    "/leaderboard",
    response_model=LeaderboardOut,
    summary="O'yin reytingi (best score)",
)
async def game_leaderboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    game: str = Query(..., description="clicker | 2048"),
    period: str = Query("weekly", description="daily | weekly | alltime"),
    limit: int = Query(50, le=200),
):
    if game not in GAME_CONFIG:
        raise HTTPException(400, "Noto'g'ri game")
    if period not in ("daily", "weekly", "alltime"):
        raise HTTPException(400, "period: daily|weekly|alltime")

    now = datetime.now(timezone.utc)
    cutoff = None
    if period == "daily":
        cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        # Monday 00:00 UTC of current week
        cutoff = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

    q = (
        select(
            GameSession.user_id,
            User.name,
            func.max(GameSession.score).label("best_score"),
        )
        .join(User, User.id == GameSession.user_id)
        .where(
            GameSession.game_type == game,
            GameSession.status == "finished",
        )
        .group_by(GameSession.user_id, User.name)
        .order_by(desc("best_score"))
        .limit(limit)
    )
    if cutoff:
        q = q.where(GameSession.finished_at >= cutoff)

    rows = (await db.execute(q)).all()

    entries = [
        LeaderboardEntry(
            rank=idx,
            user_id=uid,
            user_name=name or "User",
            score=int(score or 0),
            is_me=(uid == user.id),
        )
        for idx, (uid, name, score) in enumerate(rows, start=1)
    ]
    my_rank = next((e.rank for e in entries if e.is_me), None)
    my_score = next((e.score for e in entries if e.is_me), None)

    return LeaderboardOut(
        entries=entries,
        my_rank=my_rank,
        my_score=my_score,
        total_users=len(entries),
    )


# ── Daily Spin ───────────────────────────────────────────────────────────────
async def _last_spin_at(user_id: int, db: AsyncSession) -> Optional[datetime]:
    row = (await db.execute(
        select(SpinHistory.won_at)
        .where(SpinHistory.user_id == user_id)
        .order_by(SpinHistory.won_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    return row


def _next_spin_time(last: Optional[datetime]) -> Optional[datetime]:
    if last is None:
        return None
    return last + timedelta(hours=SPIN_COOLDOWN_HOURS)


@router.get("/spin/status", response_model=SpinStatusResponse, summary="Spin holati va sovrinlar")
async def spin_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    prizes = (await db.execute(
        select(SpinPrize)
        .where(SpinPrize.is_active.is_(True))
        .order_by(SpinPrize.sort_order.asc(), SpinPrize.id.asc())
    )).scalars().all()

    last = await _last_spin_at(user.id, db)
    now = datetime.now(timezone.utc)
    can_spin = True
    next_at = None
    seconds = 0
    if last:
        next_at = _next_spin_time(last)
        if next_at and next_at > now:
            can_spin = False
            seconds = int((next_at - now).total_seconds())

    return SpinStatusResponse(
        can_spin=can_spin,
        next_available_at=next_at,
        seconds_until_next=seconds,
        prizes=[SpinPrizeOut.model_validate(p) for p in prizes],
    )


@router.post("/spin", response_model=SpinResultResponse, summary="G'ildirakni aylantirish")
async def spin(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    last = await _last_spin_at(user.id, db)
    now = datetime.now(timezone.utc)
    if last:
        next_at = _next_spin_time(last)
        if next_at and next_at > now:
            seconds = int((next_at - now).total_seconds())
            raise HTTPException(429, f"Hali erta — {seconds // 3600}s {(seconds % 3600) // 60}d kutib turing")

    prizes = (await db.execute(
        select(SpinPrize).where(SpinPrize.is_active.is_(True))
    )).scalars().all()
    if not prizes:
        raise HTTPException(503, "Hozircha sovrinlar sozlanmagan")

    # Weighted random pick — cryptographic RNG (not predictable)
    total_weight = sum(max(1, p.weight or 1) for p in prizes)
    r = _secure_rng.uniform(0, total_weight)
    upto = 0.0
    chosen: SpinPrize = prizes[0]
    for p in prizes:
        upto += max(1, p.weight or 1)
        if r <= upto:
            chosen = p
            break

    # Award + record
    stats = await get_or_create_stats(user.id, db)
    stats.xp = (stats.xp or 0) + (chosen.xp or 0)
    stats.level = level_for_xp(stats.xp)
    new_achs = await check_and_award_achievements(user.id, stats, db)
    if chosen.xp:
        await update_active_contests(user.id, xp_delta=chosen.xp, db=db)

    db.add(SpinHistory(
        user_id=user.id,
        prize_id=chosen.id,
        prize_label=chosen.label,
        xp_won=chosen.xp or 0,
    ))
    await db.commit()

    # Pick localized label by user.language
    label = chosen.label
    if (user.language or "uz").lower() == "ru" and chosen.label_ru:
        label = chosen.label_ru

    return SpinResultResponse(
        prize_id=chosen.id,
        label=label,
        xp_won=chosen.xp or 0,
        new_total_xp=stats.xp,
        new_level=stats.level,
        new_achievements=[
            {"code": a.code, "title": a.title, "icon": a.icon}
            for a in new_achs
        ],
        next_available_at=now + timedelta(hours=SPIN_COOLDOWN_HOURS),
    )
