"""
core/uz_regions.py
──────────────────
Koordinata (lat, lng) → O'zbekiston viloyati nomi (eng yaqin markaz bo'yicha).
"Katta regionlar miqyosida" — viloyat darajasida (Toshkent shahri va viloyati → "Toshkent").
"""
from __future__ import annotations

import math

# Viloyat markazlari (taxminiy lat, lng). Toshkent shahri+viloyati → "Toshkent".
_REGIONS: list[tuple[str, float, float]] = [
    ("Toshkent", 41.311, 69.280),
    ("Toshkent", 41.000, 69.600),   # Toshkent viloyati (poytaxt atrofi)
    ("Andijon", 40.783, 72.344),
    ("Farg'ona", 40.389, 71.783),
    ("Namangan", 40.998, 71.672),
    ("Sirdaryo", 40.488, 68.785),
    ("Jizzax", 40.116, 67.842),
    ("Samarqand", 39.654, 66.960),
    ("Qashqadaryo", 38.861, 65.789),
    ("Surxondaryo", 37.224, 67.278),
    ("Buxoro", 39.768, 64.421),
    ("Navoiy", 40.084, 65.379),
    ("Xorazm", 41.550, 60.631),
    ("Qoraqalpog'iston", 42.460, 59.617),
]


def region_from_coords(lat: float, lng: float) -> str:
    """Eng yaqin viloyat markazini topadi. Noto'g'ri koordinatada "" qaytaradi."""
    try:
        lat = float(lat)
        lng = float(lng)
    except (TypeError, ValueError):
        return ""
    # O'zbekiston chegarasidan tashqarida bo'lsa — bo'sh.
    if not (37.0 <= lat <= 46.0 and 55.0 <= lng <= 74.0):
        return ""

    cos_lat = math.cos(math.radians(lat))
    best_name = ""
    best_d = float("inf")
    for name, rlat, rlng in _REGIONS:
        dlat = lat - rlat
        dlng = (lng - rlng) * cos_lat  # uzunlikni kenglikka moslash
        d = dlat * dlat + dlng * dlng
        if d < best_d:
            best_d = d
            best_name = name
    return best_name
