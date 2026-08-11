"""
routers/announcements.py
────────────────────────
Platforma bannerlari — admin CRUD va public endpoint.

  GET    /admin/announcements           — admin: ro'yxat (barchasi)
  POST   /admin/announcements           — admin: yaratish
  PATCH  /admin/announcements/{id}
  DELETE /admin/announcements/{id}
  GET    /announcements/active          — public: hozir faol bannerlar
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel, Field
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from core.cache import cache_delete_prefix
from core.dependencies import get_current_admin, require_admin_role
from database import get_db
from models import Announcement

_CACHE_PREFIX = "ann:active:"

admin_router = APIRouter(prefix="/admin/announcements", tags=["📢 Announcements"])
public_router = APIRouter(prefix="/announcements", tags=["📢 Announcements"])


class _AnnIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = ""
    type: str = Field("info", pattern="^(info|warning|critical|success)$")
    target: str = Field("all", pattern="^(all|users|merchants|admin|landing)$")
    cta_label: str = ""
    cta_url: str = ""
    is_active: bool = True
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


@admin_router.get("", summary="Barcha bannerlar")
async def list_announcements(
    admin=Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Announcement).order_by(Announcement.id.desc())
    )).scalars().all()
    return [_serialize(a) for a in rows]


@admin_router.post("", status_code=201, summary="Yangi banner")
async def create_announcement(
    body: _AnnIn,
    admin=Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    a = Announcement(
        title=body.title.strip(),
        body=body.body,
        type=body.type,
        target=body.target,
        cta_label=body.cta_label,
        cta_url=body.cta_url,
        is_active=body.is_active,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        created_by=str(admin.get("sub", "admin")),
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    await cache_delete_prefix(_CACHE_PREFIX)
    logger.success(f"Banner yaratildi #{a.id}: {a.title}")
    return {"id": a.id}


@admin_router.patch("/{aid}", summary="Banner yangilash")
async def update_announcement(
    aid: int,
    body: dict,
    admin=Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    a = (await db.execute(select(Announcement).where(Announcement.id == aid))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Banner topilmadi")
    for k, v in (body or {}).items():
        if k in ("title", "body", "type", "target", "cta_label", "cta_url"):
            setattr(a, k, v)
        elif k == "is_active":
            a.is_active = bool(v)
        elif k in ("starts_at", "ends_at"):
            if not v:
                setattr(a, k, None)
            else:
                try:
                    setattr(a, k, datetime.fromisoformat(str(v).replace("Z", "+00:00")))
                except Exception:
                    pass
    await db.commit()
    await cache_delete_prefix(_CACHE_PREFIX)
    return {"ok": True}


@admin_router.delete("/{aid}", summary="Banner o'chirish")
async def delete_announcement(
    aid: int,
    admin=Depends(require_admin_role("super_admin", "marketing")),
    db: AsyncSession = Depends(get_db),
):
    a = (await db.execute(select(Announcement).where(Announcement.id == aid))).scalar_one_or_none()
    if not a:
        raise HTTPException(404, "Banner topilmadi")
    await db.delete(a)
    await db.commit()
    await cache_delete_prefix(_CACHE_PREFIX)
    return {"ok": True}


@public_router.get("/active", summary="Hozir faol bannerlar (public)")
async def active_announcements(
    target: str = "landing",
    db: AsyncSession = Depends(get_db),
):
    """
    target: landing | users | merchants | admin — agar banner all bo'lsa, barcha targetga mos keladi.
    Cached for 60s per target.
    """
    from core.cache import cache_get, cache_set
    cache_key = f"{_CACHE_PREFIX}{target}"
    hit = await cache_get(cache_key)
    if hit is not None:
        return hit

    now = datetime.now(timezone.utc)
    q = select(Announcement).where(
        Announcement.is_active.is_(True),
        Announcement.target.in_([target, "all"]),
        and_(
            (Announcement.starts_at.is_(None)) | (Announcement.starts_at <= now),
        ),
        and_(
            (Announcement.ends_at.is_(None)) | (Announcement.ends_at >= now),
        ),
    ).order_by(Announcement.id.desc())
    rows = (await db.execute(q)).scalars().all()
    data = [_serialize(a) for a in rows]
    await cache_set(cache_key, data, ttl=60)
    return data


def _serialize(a: Announcement) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "body": a.body,
        "type": a.type,
        "target": a.target,
        "cta_label": a.cta_label,
        "cta_url": a.cta_url,
        "is_active": a.is_active,
        "starts_at": a.starts_at.isoformat() if a.starts_at else None,
        "ends_at": a.ends_at.isoformat() if a.ends_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }
