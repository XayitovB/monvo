from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.cache import cache_delete_prefix, cache_get, cache_set
from core.dependencies import get_current_admin
from database import get_db
from models import AppLinks

router = APIRouter(tags=["🔗 Links"])
_CACHE_KEY = "app_links:v1"


class LinksUpdate(BaseModel):
    android_url:  str = ""
    ios_url:      str = ""
    telegram_url: str = ""


async def _get_or_create(db: AsyncSession) -> AppLinks:
    result = await db.execute(select(AppLinks).limit(1))
    row = result.scalar_one_or_none()
    if not row:
        row = AppLinks(android_url="", ios_url="", telegram_url="")
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


@router.get("/links", summary="App download links (public)")
async def get_links(response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
    hit = await cache_get(_CACHE_KEY)
    if hit is not None:
        return hit
    row = await _get_or_create(db)
    data = {
        "android_url":  row.android_url  or "",
        "ios_url":      row.ios_url      or "",
        "telegram_url": row.telegram_url or "",
    }
    await cache_set(_CACHE_KEY, data, ttl=300)
    return data


@router.patch("/admin/links", summary="Update app links (admin)")
async def update_links(
    body: LinksUpdate,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await _get_or_create(db)
    row.android_url  = body.android_url
    row.ios_url      = body.ios_url
    row.telegram_url = body.telegram_url
    row.updated_by   = admin.get("sub", "admin")
    await db.commit()
    await cache_delete_prefix("app_links")
    return {"ok": True, "android_url": row.android_url, "ios_url": row.ios_url, "telegram_url": row.telegram_url}
