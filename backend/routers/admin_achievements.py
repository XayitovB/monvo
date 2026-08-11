"""
routers/admin_achievements.py
─────────────────────────────
Admin CRUD: Achievements (badges).

  GET    /admin/achievements
  POST   /admin/achievements
  PATCH  /admin/achievements/{id}
  DELETE /admin/achievements/{id}
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin, require_admin_role
from database import get_db
from models import Achievement
from schemas import AchievementCreate, AchievementOut, AchievementUpdate

router = APIRouter(prefix="/admin/achievements", tags=["🏆 Admin / Achievements"])

VALID_CRITERIA = {
    "total_scans",
    "unique_merchants",
    "total_spent",
    "total_redeems",
    "streak_days",
    "level_reached",
}


@router.get("", response_model=list[AchievementOut], summary="Barcha achievements")
async def list_all(
    admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Achievement).order_by(Achievement.sort_order.asc(), Achievement.id.asc())
    )).scalars().all()
    return list(rows)


@router.post("", response_model=AchievementOut, status_code=201, summary="Achievement yaratish")
async def create(
    body: AchievementCreate,
    admin: dict = Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    if body.criteria_type not in VALID_CRITERIA:
        raise HTTPException(400, f"criteria_type noto'g'ri. Ruxsat: {sorted(VALID_CRITERIA)}")

    exists = (await db.execute(
        select(Achievement.id).where(Achievement.code == body.code)
    )).scalar_one_or_none()
    if exists:
        raise HTTPException(409, f"Code '{body.code}' allaqachon mavjud")

    a = Achievement(
        code=body.code,
        title=body.title,
        description=body.description or "",
        title_ru=body.title_ru or "",
        description_ru=body.description_ru or "",
        icon=body.icon or "trophy",
        color=body.color or "#F59E0B",
        category=body.category or "general",
        criteria_type=body.criteria_type,
        criteria_threshold=body.criteria_threshold,
        xp_reward=body.xp_reward,
        is_active=body.is_active if body.is_active is not None else True,
        sort_order=body.sort_order or 100,
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return a


@router.patch("/{ach_id}", response_model=AchievementOut, summary="Achievement yangilash")
async def update(
    ach_id: int,
    body: AchievementUpdate,
    admin: dict = Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    a = (await db.execute(select(Achievement).where(Achievement.id == ach_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Achievement topilmadi")
    data = body.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(a, k, v)
    await db.commit()
    await db.refresh(a)
    return a


@router.delete("/{ach_id}", status_code=204, summary="Achievement o'chirish")
async def delete(
    ach_id: int,
    admin: dict = Depends(require_admin_role("super_admin")),
    db: AsyncSession = Depends(get_db),
):
    a = (await db.execute(select(Achievement).where(Achievement.id == ach_id))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Achievement topilmadi")
    await db.delete(a)
    await db.commit()
