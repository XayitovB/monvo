"""
routers/discover.py
───────────────────
Public discovery: yaqindagi Monvo biznesni topish uchun xarita endpoint'lari.

  GET  /discover/branches              — barcha aktiv branch'lar (lat/lng bilan)
  GET  /discover/nearby?lat=&lng=&radius_km=
                                       — yaqindagi branch'lar (Haversine sort)
"""
import math
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Merchant, MerchantBranch, LoyaltyRule


async def _promo_map(db, rows) -> dict:
    """rows: (branch, merchant) juftliklari → {merchant_id: aksiya matni}."""
    promos: dict = {}
    mids = list({m.id for _, m in rows})
    if not mids:
        return promos
    rules = (await db.execute(
        select(LoyaltyRule).where(
            LoyaltyRule.merchant_id.in_(mids),
            LoyaltyRule.is_active.is_(True),
        ).order_by(LoyaltyRule.priority)
    )).scalars().all()
    for r in rules:
        if r.merchant_id in promos:
            continue
        cfg = r.config or {}
        if r.rule_type == "cashback_percent" and cfg.get("percent"):
            promos[r.merchant_id] = f"{int(float(cfg['percent']))}% cashback"
        elif r.rule_type == "tier_cashback":
            promos[r.merchant_id] = "Cashback"
        elif r.rule_type == "punch_card" and cfg.get("threshold"):
            title = cfg.get("reward_title") or "Bepul mahsulot"
            promos[r.merchant_id] = f"{int(cfg['threshold'])} ta = {title}"
    # Stamp modelidagi bizneslar (Merchant darajasida) — ustun turadi
    for _, m in rows:
        if getattr(m, "loyalty_type", "") == "stamp":
            title = getattr(m, "stamp_reward_title", "") or "Bepul mahsulot"
            promos[m.id] = f"{getattr(m, 'stamp_threshold', 7)} ta = {title}"
    return promos

router = APIRouter(prefix="/discover", tags=["🗺️ Discover"])


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Ikki nuqta orasidagi masofa (km)."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


@router.get("/branches", summary="Barcha xaritada ko'rsatiladigan filiallar")
async def list_branches(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(MerchantBranch, Merchant)
        .join(Merchant, Merchant.id == MerchantBranch.merchant_id)
        .where(
            MerchantBranch.is_active.is_(True),
            Merchant.is_active.is_(True),
            MerchantBranch.lat.is_not(None),
            MerchantBranch.lng.is_not(None),
        )
    )).all()

    promos = await _promo_map(db, rows)
    return [
        {
            "branch_id": b.id,
            "branch_name": b.name,
            "address": b.address,
            "phone": b.phone,
            "working_hours": b.working_hours,
            "lat": float(b.lat),
            "lng": float(b.lng),
            "photos": list(b.photos or []),
            "merchant_id": m.id,
            "merchant_name": m.business_name,
            "merchant_logo": m.logo_url,
            "brand_color": m.brand_color,
            "business_type": m.business_type,
            "promo": promos.get(m.id, ""),
        }
        for b, m in rows
    ]


@router.get("/nearby", summary="Yaqindagi filiallar (masofa bo'yicha tartiblangan)")
async def nearby_branches(
    lat: float = Query(..., description="Foydalanuvchi kengligi"),
    lng: float = Query(..., description="Foydalanuvchi uzunligi"),
    radius_km: float = Query(20.0, ge=0.1, le=200.0, description="Qidiruv radiusi (km)"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(MerchantBranch, Merchant)
        .join(Merchant, Merchant.id == MerchantBranch.merchant_id)
        .where(
            MerchantBranch.is_active.is_(True),
            Merchant.is_active.is_(True),
            MerchantBranch.lat.is_not(None),
            MerchantBranch.lng.is_not(None),
        )
    )).all()

    promos = await _promo_map(db, rows)
    results = []
    for b, m in rows:
        d = _haversine_km(lat, lng, float(b.lat), float(b.lng))
        if d > radius_km:
            continue
        results.append({
            "branch_id": b.id,
            "branch_name": b.name,
            "address": b.address,
            "phone": b.phone,
            "working_hours": b.working_hours,
            "lat": float(b.lat),
            "lng": float(b.lng),
            "photos": list(b.photos or []),
            "distance_km": round(d, 2),
            "merchant_id": m.id,
            "merchant_name": m.business_name,
            "merchant_logo": m.logo_url,
            "brand_color": m.brand_color,
            "business_type": m.business_type,
            "promo": promos.get(m.id, ""),
        })

    results.sort(key=lambda r: r["distance_km"])
    return results[:limit]
