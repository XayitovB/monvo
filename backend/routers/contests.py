"""
routers/contests.py
───────────────────
Contest endpoints — vaqt cheklangan musobaqalar.

Public (user):
  GET  /contests              — faol va yaqin musobaqalar
  GET  /contests/{id}         — tafsilot + my_rank
  POST /contests/{id}/join    — qo'shilish (auto_join=False bo'lganda)
  GET  /contests/{id}/leaderboard — reyting

Admin:
  POST   /admin/contests           — yaratish
  GET    /admin/contests           — list (status filter)
  PATCH  /admin/contests/{id}
  DELETE /admin/contests/{id}
  POST   /admin/contests/{id}/finalize — qo'lda yakunlash
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import (
    get_current_admin,
    get_current_user,
    require_admin_role,
)
from database import get_db
from models import Contest, ContestParticipant, User
from schemas import (
    ContestCreate,
    ContestOut,
    ContestUpdate,
    ContestWithMyRank,
    LeaderboardEntry,
    LeaderboardOut,
)

router = APIRouter(prefix="/contests", tags=["🏁 Contests"])
admin_router = APIRouter(prefix="/admin/contests", tags=["🏁 Admin / Contests"])


# ── Public (user) ─────────────────────────────────────────────────────────────
@router.get(
    "",
    response_model=list[ContestWithMyRank],
    summary="Faol va yaqin musobaqalar",
)
async def list_contests(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    merchant_id: Optional[int] = None,
    include_finished: bool = False,
):
    # Note: contest finalization is handled by the 15-min scheduler job
    # (core/scheduler.py). Doing it on every list call could lock the
    # request thread for tens of seconds after a server restart with
    # many expired contests piled up.

    statuses = ["active"]
    if include_finished:
        statuses.append("finished")
    q = select(Contest).where(Contest.status.in_(statuses))
    if merchant_id is not None:
        q = q.where(Contest.merchant_id == merchant_id)
    q = q.order_by(Contest.starts_at.desc()).limit(50)
    contests = (await db.execute(q)).scalars().all()
    if not contests:
        return []

    # Fetch my participation rows in one query
    contest_ids = [c.id for c in contests]
    my_parts = {
        cp.contest_id: cp
        for cp in (await db.execute(
            select(ContestParticipant).where(
                ContestParticipant.contest_id.in_(contest_ids),
                ContestParticipant.user_id == user.id,
            )
        )).scalars().all()
    }

    # Participant counts
    counts_rows = (await db.execute(
        select(ContestParticipant.contest_id, func.count(ContestParticipant.id))
        .where(ContestParticipant.contest_id.in_(contest_ids))
        .group_by(ContestParticipant.contest_id)
    )).all()
    counts = {cid: cnt for cid, cnt in counts_rows}

    is_ru = (user.language or "uz").lower() == "ru"

    def _t(default: str, alt: str | None) -> str:
        if is_ru and alt:
            return alt
        return default or ""

    out: list[ContestWithMyRank] = []
    for c in contests:
        mp = my_parts.get(c.id)
        my_rank = None
        if mp is not None and mp.score and mp.score > 0:
            higher = (await db.execute(
                select(func.count(ContestParticipant.id)).where(
                    ContestParticipant.contest_id == c.id,
                    ContestParticipant.score > mp.score,
                )
            )).scalar() or 0
            my_rank = int(higher) + 1
        out.append(ContestWithMyRank(
            id=c.id,
            title=_t(c.title, c.title_ru),
            description=_t(c.description or "", c.description_ru),
            title_ru=c.title_ru or "",
            description_ru=c.description_ru or "",
            icon=c.icon,
            banner_url=c.banner_url or "",
            contest_type=c.contest_type,
            merchant_id=c.merchant_id,
            status=c.status,
            starts_at=c.starts_at,
            ends_at=c.ends_at,
            prize_description=_t(c.prize_description or "", c.prize_description_ru),
            prize_description_ru=c.prize_description_ru or "",
            prize_xp=c.prize_xp,
            max_winners=c.max_winners,
            auto_join=c.auto_join,
            created_at=c.created_at,
            my_rank=my_rank,
            my_score=int(mp.score) if mp else 0,
            is_joined=mp is not None,
            participants_count=int(counts.get(c.id, 0)),
        ))
    return out


@router.get("/{contest_id}", response_model=ContestWithMyRank, summary="Bitta musobaqa tafsiloti")
async def get_contest(
    contest_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = (await db.execute(select(Contest).where(Contest.id == contest_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contest topilmadi")

    mp = (await db.execute(
        select(ContestParticipant).where(
            ContestParticipant.contest_id == contest_id,
            ContestParticipant.user_id == user.id,
        )
    )).scalar_one_or_none()

    my_rank = None
    if mp and mp.score and mp.score > 0:
        higher = (await db.execute(
            select(func.count(ContestParticipant.id)).where(
                ContestParticipant.contest_id == contest_id,
                ContestParticipant.score > mp.score,
            )
        )).scalar() or 0
        my_rank = int(higher) + 1

    count = (await db.execute(
        select(func.count(ContestParticipant.id)).where(
            ContestParticipant.contest_id == contest_id
        )
    )).scalar() or 0

    is_ru = (user.language or "uz").lower() == "ru"
    pick = lambda d, alt: alt if (is_ru and alt) else (d or "")

    return ContestWithMyRank(
        id=c.id,
        title=pick(c.title, c.title_ru),
        description=pick(c.description or "", c.description_ru),
        title_ru=c.title_ru or "",
        description_ru=c.description_ru or "",
        icon=c.icon,
        banner_url=c.banner_url or "",
        contest_type=c.contest_type,
        merchant_id=c.merchant_id,
        status=c.status,
        starts_at=c.starts_at,
        ends_at=c.ends_at,
        prize_description=pick(c.prize_description or "", c.prize_description_ru),
        prize_description_ru=c.prize_description_ru or "",
        prize_xp=c.prize_xp,
        max_winners=c.max_winners,
        auto_join=c.auto_join,
        created_at=c.created_at,
        my_rank=my_rank,
        my_score=int(mp.score) if mp else 0,
        is_joined=mp is not None,
        participants_count=int(count),
    )


@router.post("/{contest_id}/join", status_code=201, summary="Musobaqaga qo'shilish")
async def join_contest(
    contest_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    c = (await db.execute(select(Contest).where(Contest.id == contest_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contest topilmadi")
    if c.status != "active":
        raise HTTPException(400, "Musobaqa faol emas")
    now = datetime.now(timezone.utc)
    if c.ends_at < now:
        raise HTTPException(400, "Musobaqa tugagan")

    existing = (await db.execute(
        select(ContestParticipant).where(
            ContestParticipant.contest_id == contest_id,
            ContestParticipant.user_id == user.id,
        )
    )).scalar_one_or_none()
    if existing:
        return {"status": "already_joined", "score": existing.score}

    db.add(ContestParticipant(contest_id=contest_id, user_id=user.id, score=0))
    await db.commit()
    return {"status": "joined", "contest_id": contest_id}


@router.get(
    "/{contest_id}/leaderboard",
    response_model=LeaderboardOut,
    summary="Musobaqa reytingi",
)
async def contest_leaderboard(
    contest_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=500),
):
    c = (await db.execute(select(Contest).where(Contest.id == contest_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contest topilmadi")

    rows = (await db.execute(
        select(
            ContestParticipant.user_id,
            ContestParticipant.score,
            User.name,
        )
        .join(User, User.id == ContestParticipant.user_id)
        .where(ContestParticipant.contest_id == contest_id)
        .order_by(desc(ContestParticipant.score), ContestParticipant.joined_at.asc())
        .limit(limit)
    )).all()

    entries = [
        LeaderboardEntry(
            rank=idx,
            user_id=uid,
            user_name=name or "User",
            score=int(score or 0),
            is_me=(uid == user.id),
        )
        for idx, (uid, score, name) in enumerate(rows, start=1)
    ]
    my_rank = next((e.rank for e in entries if e.is_me), None)
    my_score = next((e.score for e in entries if e.is_me), None)
    if my_rank is None:
        mp = (await db.execute(
            select(ContestParticipant).where(
                ContestParticipant.contest_id == contest_id,
                ContestParticipant.user_id == user.id,
            )
        )).scalar_one_or_none()
        if mp:
            my_score = int(mp.score or 0)
            higher = (await db.execute(
                select(func.count(ContestParticipant.id)).where(
                    ContestParticipant.contest_id == contest_id,
                    ContestParticipant.score > (mp.score or 0),
                )
            )).scalar() or 0
            my_rank = int(higher) + 1

    total = (await db.execute(
        select(func.count(ContestParticipant.id)).where(
            ContestParticipant.contest_id == contest_id
        )
    )).scalar() or 0

    return LeaderboardOut(
        entries=entries,
        my_rank=my_rank,
        my_score=my_score,
        total_users=int(total),
    )


# ── Admin CRUD ────────────────────────────────────────────────────────────────
VALID_TYPES = {"top_scanner", "top_spender", "top_streak", "top_xp"}
VALID_STATUSES = {"draft", "active", "finished", "cancelled"}


@admin_router.post(
    "",
    response_model=ContestOut,
    status_code=201,
    summary="Musobaqa yaratish",
)
async def create_contest(
    body: ContestCreate,
    admin: dict = Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    if body.contest_type not in VALID_TYPES:
        raise HTTPException(400, f"contest_type noto'g'ri. Ruxsat: {sorted(VALID_TYPES)}")
    if body.status and body.status not in VALID_STATUSES:
        raise HTTPException(400, f"status noto'g'ri. Ruxsat: {sorted(VALID_STATUSES)}")
    if body.ends_at <= body.starts_at:
        raise HTTPException(400, "ends_at starts_at dan keyin bo'lishi kerak")

    c = Contest(
        title=body.title,
        description=body.description or "",
        title_ru=body.title_ru or "",
        description_ru=body.description_ru or "",
        icon=body.icon or "trophy",
        banner_url=body.banner_url or "",
        contest_type=body.contest_type,
        merchant_id=body.merchant_id,
        status=body.status or "draft",
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        prize_description=body.prize_description or "",
        prize_description_ru=body.prize_description_ru or "",
        prize_xp=body.prize_xp,
        max_winners=body.max_winners,
        auto_join=body.auto_join,
        created_by=str(admin.get("sub", "admin")),
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


@admin_router.get("", response_model=list[ContestOut], summary="Musobaqalar ro'yxati")
async def list_admin_contests(
    admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = None,
):
    q = select(Contest)
    if status:
        q = q.where(Contest.status == status)
    q = q.order_by(Contest.created_at.desc()).limit(200)
    return list((await db.execute(q)).scalars().all())


@admin_router.patch("/{contest_id}", response_model=ContestOut, summary="Musobaqa yangilash")
async def update_contest(
    contest_id: int,
    body: ContestUpdate,
    admin: dict = Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    c = (await db.execute(select(Contest).where(Contest.id == contest_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contest topilmadi")
    data = body.dict(exclude_unset=True)
    if "status" in data and data["status"] not in VALID_STATUSES:
        raise HTTPException(400, f"status noto'g'ri. Ruxsat: {sorted(VALID_STATUSES)}")
    for k, v in data.items():
        setattr(c, k, v)
    await db.commit()
    await db.refresh(c)
    return c


@admin_router.delete("/{contest_id}", status_code=204, summary="Musobaqa o'chirish")
async def delete_contest(
    contest_id: int,
    admin: dict = Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    c = (await db.execute(select(Contest).where(Contest.id == contest_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contest topilmadi")
    await db.delete(c)
    await db.commit()


@admin_router.post("/{contest_id}/finalize", summary="Musobaqani qo'lda yakunlash")
async def finalize_one(
    contest_id: int,
    admin: dict = Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    from core.gamification import get_or_create_stats, level_for_xp

    c = (await db.execute(select(Contest).where(Contest.id == contest_id))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Contest topilmadi")
    if c.status == "finished":
        return {"status": "already_finished"}

    parts = (await db.execute(
        select(ContestParticipant)
        .where(ContestParticipant.contest_id == contest_id)
        .order_by(ContestParticipant.score.desc(), ContestParticipant.joined_at.asc())
    )).scalars().all()

    winners = 0
    for idx, p in enumerate(parts, start=1):
        p.rank = idx
        if idx <= (c.max_winners or 0) and (p.score or 0) > 0:
            p.is_winner = True
            stats = await get_or_create_stats(p.user_id, db)
            stats.xp = (stats.xp or 0) + (c.prize_xp or 0)
            stats.level = level_for_xp(stats.xp)
            winners += 1

    c.status = "finished"
    await db.commit()
    return {"status": "finished", "winners": winners, "participants": len(parts)}
