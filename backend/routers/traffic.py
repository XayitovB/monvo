import hashlib
import asyncio
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.dependencies import get_current_admin
from database import get_db
from models import PageView

router = APIRouter(tags=["📊 Traffic"])


async def _get_country(ip: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            r = await client.get(f"https://ipapi.co/{ip}/country/")
            if r.status_code == 200 and len(r.text.strip()) == 2:
                return r.text.strip()
    except Exception:
        pass
    return ""


@router.post("/track", include_in_schema=False)
async def track(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.json()
    ip = (request.headers.get("x-forwarded-for", "") or "").split(",")[0].strip()
    if not ip:
        ip = request.client.host or ""
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:16]

    country = ""
    if ip and ip not in ("127.0.0.1", "::1"):
        country = await _get_country(ip)

    view = PageView(
        path=body.get("path", "/")[:200],
        ip_hash=ip_hash,
        country=country[:4],
        referrer=(request.headers.get("referer", "") or "")[:500],
        user_agent=(request.headers.get("user-agent", "") or "")[:300],
    )
    db.add(view)
    await db.commit()
    return {"ok": True}


@router.get("/admin/traffic", summary="Sayt trafigi (admin)")
async def get_traffic(
    days: int = 30,
    admin=Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Jami ko'rishlar
    total_q = await db.execute(
        select(func.count()).where(PageView.timestamp >= since)
    )
    total_views = total_q.scalar() or 0

    # Unikal tashrif buyuruvchilar (ip_hash bo'yicha)
    unique_q = await db.execute(
        select(func.count(func.distinct(PageView.ip_hash)))
        .where(PageView.timestamp >= since)
    )
    unique_visitors = unique_q.scalar() or 0

    # Bugungi ko'rishlar
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_q = await db.execute(
        select(func.count()).where(PageView.timestamp >= today)
    )
    today_views = today_q.scalar() or 0

    # Kunlik statistika
    daily_q = await db.execute(text("""
        SELECT DATE(timestamp AT TIME ZONE 'UTC') AS day,
               COUNT(*)                           AS views,
               COUNT(DISTINCT ip_hash)            AS unique_v
        FROM page_views
        WHERE timestamp >= :since
        GROUP BY day
        ORDER BY day
    """), {"since": since})
    daily = [{"date": str(r.day), "views": r.views, "unique": r.unique_v} for r in daily_q]

    # Top referrerlar
    ref_q = await db.execute(text("""
        SELECT COALESCE(NULLIF(referrer,''), 'Direct') AS ref,
               COUNT(*) AS cnt
        FROM page_views
        WHERE timestamp >= :since
        GROUP BY ref
        ORDER BY cnt DESC
        LIMIT 10
    """), {"since": since})
    referrers = [{"referrer": r.ref, "count": r.cnt} for r in ref_q]

    # Mamlakatlar bo'yicha
    geo_q = await db.execute(text("""
        SELECT COALESCE(NULLIF(country,''), '??') AS country,
               COUNT(*) AS cnt
        FROM page_views
        WHERE timestamp >= :since AND country IS NOT NULL
        GROUP BY country
        ORDER BY cnt DESC
        LIMIT 10
    """), {"since": since})
    geo = [{"country": r.country, "count": r.cnt} for r in geo_q]

    return {
        "total_views":     total_views,
        "unique_visitors": unique_visitors,
        "today_views":     today_views,
        "daily":           daily,
        "referrers":       referrers,
        "geo":             geo,
        "days":            days,
    }
