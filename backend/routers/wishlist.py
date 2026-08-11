"""
routers/wishlist.py
───────────────────
Mijoz reward'ni "keyinroqqa saqlab qo'yish" funksiyasi.

  POST   /wishlist            — reward qo'shish
  DELETE /wishlist/{reward_id} — o'chirish
  GET    /wishlist            — foydalanuvchi wishlist'i (reward + merchant ma'lumoti bilan)
"""
from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import delete, select, text as _text
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_user
from database import get_db
from models import Merchant, Reward, User, Wishlist

router = APIRouter(prefix="/wishlist", tags=["💝 Wishlist"])


class WishlistAdd(BaseModel):
    reward_id: int


# Process davomida bir marta — har so'rovda CREATE TABLE/INDEX ishlatmaslik.
_wishlist_ready = False


async def _ensure_table(db: AsyncSession) -> None:
    """Postgres'da wishlists jadvali yo'q bo'lsa yaratamiz (bir marta)."""
    global _wishlist_ready
    if _wishlist_ready:
        return
    stmts = [
        """
        CREATE TABLE IF NOT EXISTS wishlists (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_wishlist_user ON wishlists (user_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_wishlist_user_reward ON wishlists (user_id, reward_id)",
    ]
    ok = True
    for s in stmts:
        try:
            await db.execute(_text(s))
        except Exception as e:
            ok = False
            logger.warning(f"wishlist migration skip: {type(e).__name__}: {e}")
            try:
                await db.rollback()
            except Exception:
                pass
    try:
        await db.commit()
    except Exception:
        ok = False
        try:
            await db.rollback()
        except Exception:
            pass
    if ok:
        _wishlist_ready = True


@router.post("", status_code=201, summary="Wishlist'ga reward qo'shish")
async def add_to_wishlist(
    body: WishlistAdd,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_table(db)
    # Reward mavjudligini tekshiramiz
    reward = (await db.execute(
        select(Reward).where(Reward.id == body.reward_id)
    )).scalar_one_or_none()
    if not reward:
        raise HTTPException(404, "Reward topilmadi")

    existing = (await db.execute(
        select(Wishlist).where(
            Wishlist.user_id == user.id,
            Wishlist.reward_id == body.reward_id,
        )
    )).scalar_one_or_none()
    if existing:
        return {"id": existing.id, "reward_id": body.reward_id, "already_exists": True}

    w = Wishlist(user_id=user.id, reward_id=body.reward_id)
    db.add(w)
    await db.commit()
    await db.refresh(w)
    return {"id": w.id, "reward_id": body.reward_id, "already_exists": False}


@router.delete("/{reward_id}", summary="Wishlist'dan o'chirish")
async def remove_from_wishlist(
    reward_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_table(db)
    await db.execute(
        delete(Wishlist).where(
            Wishlist.user_id == user.id,
            Wishlist.reward_id == reward_id,
        )
    )
    await db.commit()
    return {"detail": "ok"}


@router.get("", summary="Foydalanuvchi wishlist'i (reward + merchant)")
async def list_wishlist(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_table(db)
    rows = (await db.execute(
        select(Wishlist, Reward, Merchant)
        .join(Reward, Reward.id == Wishlist.reward_id)
        .join(Merchant, Merchant.id == Reward.merchant_id)
        .where(Wishlist.user_id == user.id)
        .order_by(Wishlist.created_at.desc())
    )).all()

    return [
        {
            "id": w.id,
            "reward_id": r.id,
            "title": r.title,
            "description": r.description,
            "points_cost": r.points_cost,
            "image_url": r.image_url,
            "stock": r.stock,
            "is_active": r.is_active,
            "category": r.category,
            "min_tier": r.min_tier,
            "icon": r.icon,
            "color": r.color,
            "merchant_id": m.id,
            "merchant_name": m.business_name,
            "merchant_logo": m.logo_url,
            "brand_color": m.brand_color,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w, r, m in rows
    ]
