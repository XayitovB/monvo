"""
routers/admin_games.py
──────────────────────
Admin: Spin prize CRUD + game stats.

  GET    /admin/spin/prizes       — list
  POST   /admin/spin/prizes       — create
  PATCH  /admin/spin/prizes/{id}
  DELETE /admin/spin/prizes/{id}
  GET    /admin/games/stats       — aggregate (sessions, total XP awarded)
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, require_admin_role
from database import get_db
from models import GameSession, SpinHistory, SpinPrize
from schemas import SpinPrizeCreate, SpinPrizeOut, SpinPrizeUpdate

router = APIRouter(prefix="/admin/spin", tags=["🎮 Admin / Spin"])
games_router = APIRouter(prefix="/admin/games", tags=["🎮 Admin / Games"])


@router.get("/prizes", response_model=list[SpinPrizeOut], summary="Spin sovrinlari")
async def list_prizes(
    admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(SpinPrize).order_by(SpinPrize.sort_order.asc(), SpinPrize.id.asc())
    )).scalars().all()
    return list(rows)


@router.post("/prizes", response_model=SpinPrizeOut, status_code=201, summary="Yangi sovrin")
async def create_prize(
    body: SpinPrizeCreate,
    admin: dict = Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    p = SpinPrize(
        label=body.label,
        label_ru=body.label_ru or "",
        xp=body.xp,
        weight=body.weight,
        color=body.color or "#7C3AED",
        icon=body.icon or "gift",
        is_active=body.is_active if body.is_active is not None else True,
        sort_order=body.sort_order or 100,
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


@router.patch("/prizes/{prize_id}", response_model=SpinPrizeOut, summary="Sovrinni yangilash")
async def update_prize(
    prize_id: int,
    body: SpinPrizeUpdate,
    admin: dict = Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    p = (await db.execute(select(SpinPrize).where(SpinPrize.id == prize_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Sovrin topilmadi")
    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/prizes/{prize_id}", status_code=204, summary="Sovrinni o'chirish")
async def delete_prize(
    prize_id: int,
    admin: dict = Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    p = (await db.execute(select(SpinPrize).where(SpinPrize.id == prize_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Sovrin topilmadi")
    await db.delete(p)
    await db.commit()


# ── Stats ────────────────────────────────────────────────────────────────────
@games_router.get("/stats", summary="O'yinlar statistikasi")
async def games_stats(
    admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    cutoff_7d = datetime.now(timezone.utc) - timedelta(days=7)

    # Session counts per game
    rows = (await db.execute(
        select(
            GameSession.game_type,
            func.count(GameSession.id),
            func.coalesce(func.sum(GameSession.xp_earned), 0),
            func.coalesce(func.max(GameSession.score), 0),
        )
        .where(GameSession.status == "finished")
        .group_by(GameSession.game_type)
    )).all()

    games = [
        {
            "game_type": gt,
            "sessions": int(cnt),
            "total_xp_awarded": int(xp),
            "best_score": int(best),
        }
        for gt, cnt, xp, best in rows
    ]

    spins_7d = (await db.execute(
        select(func.count(SpinHistory.id), func.coalesce(func.sum(SpinHistory.xp_won), 0))
        .where(SpinHistory.won_at >= cutoff_7d)
    )).one()

    return {
        "games": games,
        "spins_last_7d": int(spins_7d[0]),
        "spin_xp_awarded_last_7d": int(spins_7d[1]),
    }
