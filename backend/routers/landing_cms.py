"""
routers/landing_cms.py
──────────────────────
Landing page CMS — admin paneldan logolar va sharhlarni boshqarish.

Public:
  GET  /landing-logos           — aktiv logolar (cache, hreflang-neutral)
  GET  /landing-reviews         — aktiv sharhlar (cache; quote/role tildan oladi)

Admin:
  GET    /admin/landing-logos
  POST   /admin/landing-logos
  PATCH  /admin/landing-logos/{id}
  DELETE /admin/landing-logos/{id}
  POST   /admin/landing-logos/reorder

  GET    /admin/landing-reviews
  POST   /admin/landing-reviews
  PATCH  /admin/landing-reviews/{id}
  DELETE /admin/landing-reviews/{id}
  POST   /admin/landing-reviews/reorder

Image inputlar: HTTP(S) URL yoki data:image/... base64 (≤ 600KB).
"""
import re
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.admin_audit import log_admin_action
from core.cache import cache_delete_prefix, cache_get, cache_set
from core.dependencies import get_current_admin
from database import get_db
from models import LandingLogo, LandingReview, LandingSocialLink

router = APIRouter(tags=["🖼️  Landing CMS"])

_LOGOS_CACHE_PREFIX = "landing_logos"
_REVIEWS_CACHE_PREFIX = "landing_reviews"
_URL_RE = re.compile(r"^https?://", re.I)
_DATA_RE = re.compile(r"^data:image/(png|jpe?g|svg\+xml|webp|gif);base64,", re.I)
_MAX_IMG_LEN = 800_000  # ~600 KB base64 → ~450 KB binary


def _validate_image(value: str, *, allow_empty: bool = False) -> str:
    v = (value or "").strip()
    if not v:
        if allow_empty:
            return ""
        raise HTTPException(400, "image_url bo'sh bo'lmasin")
    if len(v) > _MAX_IMG_LEN:
        raise HTTPException(413, f"Rasm juda katta (>{_MAX_IMG_LEN // 1000}KB)")
    if not (_URL_RE.match(v) or _DATA_RE.match(v)):
        raise HTTPException(400, "image_url URL yoki data:image bo'lishi kerak")
    return v


# ════════════════════════════════════════════════════════════════════════════
# LOGOS
# ════════════════════════════════════════════════════════════════════════════

_ALLOWED_CATEGORIES = {"partner", "pos"}


def _logo_serialize(row: LandingLogo) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "image_url": row.image_url,
        "href": row.href or "",
        "category": (row.category or "partner"),
        "sort_order": row.sort_order,
        "is_active": row.is_active,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _validate_category(value: Optional[str], default: str = "partner") -> str:
    v = (value or default).strip().lower()
    if v not in _ALLOWED_CATEGORIES:
        raise HTTPException(400, f"category {v!r} noto'g'ri (qabul: partner, pos)")
    return v


class LogoIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    image_url: str
    href: str = ""
    category: str = "partner"
    sort_order: int = 0
    is_active: bool = True


class LogoPatch(BaseModel):
    name: Optional[str] = None
    image_url: Optional[str] = None
    href: Optional[str] = None
    category: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@router.get("/landing-logos", summary="Logolar (public, cached, ?category=partner|pos)")
async def public_logos(
    response: Response,
    category: str = "partner",
    db: AsyncSession = Depends(get_db),
):
    cat = _validate_category(category)
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=900"
    cache_key = f"{_LOGOS_CACHE_PREFIX}:public:{cat}:v2"
    hit = await cache_get(cache_key)
    if hit is not None:
        return hit
    rows = (await db.execute(
        select(LandingLogo)
        .where(
            LandingLogo.is_active.is_(True),
            LandingLogo.category == cat,
        )
        .order_by(LandingLogo.sort_order, LandingLogo.id)
    )).scalars().all()
    out = [_logo_serialize(r) for r in rows]
    await cache_set(cache_key, out, ttl=300)
    return out


@router.get("/admin/landing-logos", summary="Hamma logolar (admin, ?category= ixtiyoriy)")
async def admin_logos_list(
    category: Optional[str] = None,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(LandingLogo).order_by(LandingLogo.sort_order, LandingLogo.id)
    if category:
        q = q.where(LandingLogo.category == _validate_category(category))
    rows = (await db.execute(q)).scalars().all()
    return [_logo_serialize(r) for r in rows]


@router.post("/admin/landing-logos", summary="Yangi logo qo'shish")
async def admin_logos_create(
    payload: LogoIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    image = _validate_image(payload.image_url)
    row = LandingLogo(
        name=payload.name.strip()[:100],
        image_url=image,
        href=(payload.href or "").strip()[:500],
        category=_validate_category(payload.category),
        sort_order=int(payload.sort_order or 0),
        is_active=bool(payload.is_active),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await cache_delete_prefix(_LOGOS_CACHE_PREFIX)
    log_admin_action(admin, f"create_landing_logo id={row.id} cat={row.category} name={row.name}")
    return _logo_serialize(row)


@router.patch("/admin/landing-logos/{logo_id}", summary="Logoni tahrirlash")
async def admin_logos_update(
    logo_id: int,
    payload: LogoPatch,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(LandingLogo).where(LandingLogo.id == logo_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Logo topilmadi")
    if payload.name is not None:
        n = payload.name.strip()[:100]
        if n:
            row.name = n
    if payload.image_url is not None:
        row.image_url = _validate_image(payload.image_url)
    if payload.href is not None:
        row.href = payload.href.strip()[:500]
    if payload.category is not None:
        row.category = _validate_category(payload.category)
    if payload.sort_order is not None:
        row.sort_order = int(payload.sort_order)
    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)
    await db.commit()
    await db.refresh(row)
    await cache_delete_prefix(_LOGOS_CACHE_PREFIX)
    log_admin_action(admin, f"update_landing_logo id={row.id}")
    return _logo_serialize(row)


@router.delete("/admin/landing-logos/{logo_id}", summary="Logoni o'chirish")
async def admin_logos_delete(
    logo_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(LandingLogo).where(LandingLogo.id == logo_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Logo topilmadi")
    await db.delete(row)
    await db.commit()
    await cache_delete_prefix(_LOGOS_CACHE_PREFIX)
    log_admin_action(admin, f"delete_landing_logo id={logo_id}")
    return {"ok": True}


@router.post("/admin/landing-logos/reorder", summary="Tartibni belgilash")
async def admin_logos_reorder(
    body: dict = Body(..., example={"order": [3, 1, 2]}),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    ids = body.get("order")
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        raise HTTPException(400, "order: int massiv bo'lishi kerak")
    rows = (await db.execute(
        select(LandingLogo).where(LandingLogo.id.in_(ids))
    )).scalars().all()
    by_id = {r.id: r for r in rows}
    for idx, lid in enumerate(ids):
        r = by_id.get(lid)
        if r is not None:
            r.sort_order = idx
    await db.commit()
    await cache_delete_prefix(_LOGOS_CACHE_PREFIX)
    log_admin_action(admin, f"reorder_landing_logos count={len(ids)}")
    return {"ok": True, "count": len(ids)}


# ════════════════════════════════════════════════════════════════════════════
# REVIEWS
# ════════════════════════════════════════════════════════════════════════════

def _review_serialize(row: LandingReview) -> dict:
    return {
        "id": row.id,
        "quote_uz": row.quote_uz,
        "quote_ru": row.quote_ru or "",
        "author_name": row.author_name,
        "author_role_uz": row.author_role_uz or "",
        "author_role_ru": row.author_role_ru or "",
        "avatar_url": row.avatar_url or "",
        "rating": int(row.rating or 5),
        "sort_order": row.sort_order,
        "is_active": row.is_active,
        "is_featured": row.is_featured,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _review_public(row: LandingReview, lang: str) -> dict:
    """Public payload — bitta tilda quote/role tanlanadi (RU bo'sh bo'lsa UZ fallback)."""
    use_ru = (lang == "ru") and bool(row.quote_ru)
    return {
        "id": row.id,
        "quote": row.quote_ru if use_ru else row.quote_uz,
        "author_name": row.author_name,
        "author_role": (row.author_role_ru if use_ru else row.author_role_uz) or "",
        "avatar_url": row.avatar_url or "",
        "rating": int(row.rating or 5),
        "is_featured": row.is_featured,
    }


class ReviewIn(BaseModel):
    quote_uz: str = Field(..., min_length=1, max_length=2000)
    quote_ru: str = ""
    author_name: str = Field(..., min_length=1, max_length=120)
    author_role_uz: str = ""
    author_role_ru: str = ""
    avatar_url: str = ""
    rating: int = Field(5, ge=1, le=5)
    sort_order: int = 0
    is_active: bool = True
    is_featured: bool = False


class ReviewPatch(BaseModel):
    quote_uz: Optional[str] = None
    quote_ru: Optional[str] = None
    author_name: Optional[str] = None
    author_role_uz: Optional[str] = None
    author_role_ru: Optional[str] = None
    avatar_url: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None


@router.get("/landing-reviews", summary="Sharhlar (public, cached)")
async def public_reviews(
    response: Response,
    lang: str = Query("uz", pattern="^(uz|ru|en)$"),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=900"
    cache_key = f"{_REVIEWS_CACHE_PREFIX}:public:{lang}:v1"
    hit = await cache_get(cache_key)
    if hit is not None:
        return hit
    rows = (await db.execute(
        select(LandingReview)
        .where(LandingReview.is_active.is_(True))
        .order_by(LandingReview.sort_order, LandingReview.id)
    )).scalars().all()
    out = [_review_public(r, lang) for r in rows]
    await cache_set(cache_key, out, ttl=300)
    return out


@router.get("/admin/landing-reviews", summary="Hamma sharhlar (admin)")
async def admin_reviews_list(
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(LandingReview).order_by(LandingReview.sort_order, LandingReview.id)
    )).scalars().all()
    return [_review_serialize(r) for r in rows]


@router.post("/admin/landing-reviews", summary="Yangi sharh qo'shish")
async def admin_reviews_create(
    payload: ReviewIn,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    avatar = _validate_image(payload.avatar_url, allow_empty=True)
    row = LandingReview(
        quote_uz=payload.quote_uz.strip()[:2000],
        quote_ru=(payload.quote_ru or "").strip()[:2000],
        author_name=payload.author_name.strip()[:120],
        author_role_uz=(payload.author_role_uz or "").strip()[:160],
        author_role_ru=(payload.author_role_ru or "").strip()[:160],
        avatar_url=avatar,
        rating=int(payload.rating),
        sort_order=int(payload.sort_order or 0),
        is_active=bool(payload.is_active),
        is_featured=bool(payload.is_featured),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await cache_delete_prefix(_REVIEWS_CACHE_PREFIX)
    log_admin_action(admin, f"create_landing_review id={row.id} author={row.author_name}")
    return _review_serialize(row)


@router.patch("/admin/landing-reviews/{review_id}", summary="Sharhni tahrirlash")
async def admin_reviews_update(
    review_id: int,
    payload: ReviewPatch,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(LandingReview).where(LandingReview.id == review_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Sharh topilmadi")
    if payload.quote_uz is not None:
        q = payload.quote_uz.strip()[:2000]
        if q:
            row.quote_uz = q
    if payload.quote_ru is not None:
        row.quote_ru = payload.quote_ru.strip()[:2000]
    if payload.author_name is not None:
        n = payload.author_name.strip()[:120]
        if n:
            row.author_name = n
    if payload.author_role_uz is not None:
        row.author_role_uz = payload.author_role_uz.strip()[:160]
    if payload.author_role_ru is not None:
        row.author_role_ru = payload.author_role_ru.strip()[:160]
    if payload.avatar_url is not None:
        row.avatar_url = _validate_image(payload.avatar_url, allow_empty=True)
    if payload.rating is not None:
        row.rating = max(1, min(5, int(payload.rating)))
    if payload.sort_order is not None:
        row.sort_order = int(payload.sort_order)
    if payload.is_active is not None:
        row.is_active = bool(payload.is_active)
    if payload.is_featured is not None:
        row.is_featured = bool(payload.is_featured)
    await db.commit()
    await db.refresh(row)
    await cache_delete_prefix(_REVIEWS_CACHE_PREFIX)
    log_admin_action(admin, f"update_landing_review id={row.id}")
    return _review_serialize(row)


@router.delete("/admin/landing-reviews/{review_id}", summary="Sharhni o'chirish")
async def admin_reviews_delete(
    review_id: int,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(LandingReview).where(LandingReview.id == review_id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Sharh topilmadi")
    await db.delete(row)
    await db.commit()
    await cache_delete_prefix(_REVIEWS_CACHE_PREFIX)
    log_admin_action(admin, f"delete_landing_review id={review_id}")
    return {"ok": True}


@router.post("/admin/landing-reviews/reorder", summary="Tartibni belgilash")
async def admin_reviews_reorder(
    body: dict = Body(..., example={"order": [3, 1, 2]}),
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    ids = body.get("order")
    if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
        raise HTTPException(400, "order: int massiv bo'lishi kerak")
    rows = (await db.execute(
        select(LandingReview).where(LandingReview.id.in_(ids))
    )).scalars().all()
    by_id = {r.id: r for r in rows}
    for idx, rid in enumerate(ids):
        r = by_id.get(rid)
        if r is not None:
            r.sort_order = idx
    await db.commit()
    await cache_delete_prefix(_REVIEWS_CACHE_PREFIX)
    log_admin_action(admin, f"reorder_landing_reviews count={len(ids)}")
    return {"ok": True, "count": len(ids)}


# ════════════════════════════════════════════════════════════════════════════
# SOCIAL LINKS
# ════════════════════════════════════════════════════════════════════════════

_SOCIAL_CACHE_KEY = "landing_social_links"
_ALLOWED_PLATFORMS = {"telegram", "instagram", "facebook", "youtube", "x", "tiktok", "linkedin"}


class SocialLinkIn(BaseModel):
    platform: str = Field(..., min_length=1, max_length=30)
    url: str = Field(..., min_length=1, max_length=500)
    is_active: bool = True
    sort_order: int = 0


class SocialLinkPatch(BaseModel):
    platform: str | None = None
    url: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None


def _social_serialize(row: LandingSocialLink) -> dict:
    return {
        "id": row.id,
        "platform": row.platform,
        "url": row.url,
        "is_active": row.is_active,
        "sort_order": row.sort_order,
    }


@router.get("/landing-social-links", summary="Ijtimoiy tarmoqlar (public)")
async def public_social_links(db: AsyncSession = Depends(get_db)):
    cached = await cache_get(_SOCIAL_CACHE_KEY)
    if cached is not None:
        return cached
    q = await db.execute(
        select(LandingSocialLink)
        .where(LandingSocialLink.is_active.is_(True))
        .order_by(LandingSocialLink.sort_order, LandingSocialLink.id)
    )
    result = [_social_serialize(r) for r in q.scalars().all()]
    await cache_set(_SOCIAL_CACHE_KEY, result, ttl=300)
    return result


@router.get("/admin/landing-social-links", summary="Barcha social linklar (admin)")
async def admin_list_social(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    q = await db.execute(
        select(LandingSocialLink).order_by(LandingSocialLink.sort_order, LandingSocialLink.id)
    )
    return [_social_serialize(r) for r in q.scalars().all()]


@router.post("/admin/landing-social-links", summary="Yangi social link")
async def admin_create_social(
    body: SocialLinkIn,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    if body.platform not in _ALLOWED_PLATFORMS:
        raise HTTPException(400, f"Platform '{body.platform}' qo'llab-quvvatlanmaydi")
    row = LandingSocialLink(
        platform=body.platform,
        url=body.url.strip(),
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await cache_delete_prefix(_SOCIAL_CACHE_KEY)
    log_admin_action(admin, f"create_social_link id={row.id} platform={row.platform}")
    return _social_serialize(row)


@router.patch("/admin/landing-social-links/{link_id}", summary="Social linkni tahrirlash")
async def admin_update_social(
    link_id: int,
    body: SocialLinkPatch,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    q = await db.execute(select(LandingSocialLink).where(LandingSocialLink.id == link_id))
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Topilmadi")
    if body.platform is not None:
        if body.platform not in _ALLOWED_PLATFORMS:
            raise HTTPException(400, f"Platform '{body.platform}' qo'llab-quvvatlanmaydi")
        row.platform = body.platform
    if body.url is not None:
        row.url = body.url.strip()
    if body.is_active is not None:
        row.is_active = body.is_active
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    await db.commit()
    await cache_delete_prefix(_SOCIAL_CACHE_KEY)
    log_admin_action(admin, f"update_social_link id={row.id}")
    return _social_serialize(row)


@router.delete("/admin/landing-social-links/{link_id}", status_code=204, summary="Social linkni o'chirish")
async def admin_delete_social(
    link_id: int,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    q = await db.execute(select(LandingSocialLink).where(LandingSocialLink.id == link_id))
    row = q.scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Topilmadi")
    await db.delete(row)
    await db.commit()
    await cache_delete_prefix(_SOCIAL_CACHE_KEY)
    log_admin_action(admin, f"delete_social_link id={link_id}")
