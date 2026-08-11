"""
core/tiers.py
─────────────
Karta darajasini (tier) ball miqdoriga qarab hisoblash — yagona manba.

Har bir balans o'zgarishidan keyin `apply_tier(card, merchant)` chaqirilishi
kerak, aks holda POS/API/CRM orqali ball yiqqan mijoz tier'i eskirib qoladi.
"""
from __future__ import annotations

DEFAULT_TIERS = [
    {"name": "bronze", "min_points": 0},
    {"name": "silver", "min_points": 1000},
    {"name": "gold", "min_points": 5000},
    {"name": "platinum", "min_points": 10000},
]


def recompute_tier(points: int, merchant=None) -> str:
    """Merchant custom_tiers belgilagan bo'lsa — o'sha; aks holda default."""
    tiers = None
    if merchant is not None:
        raw = getattr(merchant, "custom_tiers", None) or []
        if raw:
            tiers = raw
    if not tiers:
        tiers = DEFAULT_TIERS
    sorted_t = sorted(tiers, key=lambda t: int(t.get("min_points", 0) or 0), reverse=True)
    for t in sorted_t:
        if points >= int(t.get("min_points", 0) or 0):
            return str(t.get("name", "bronze")).lower()
    return str(sorted_t[-1].get("name", "bronze")).lower() if sorted_t else "bronze"


def apply_tier(card, merchant=None) -> None:
    """card.tier'ni hozirgi card.points ga qarab yangilaydi (joyida)."""
    card.tier = recompute_tier(int(card.points or 0), merchant)
