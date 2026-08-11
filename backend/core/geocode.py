"""
core/geocode.py
───────────────
Manzilni (address) koordinataga aylantirish — OpenStreetMap Nominatim orqali.

Nega kerak: merchant filial qo'shganda xaritadan nuqta tanlamasligi mumkin
(faqat nom + manzil kiritadi). Bunda lat/lng `NULL` qoladi va filial
mijoz ilovasidagi xaritada KO'RINMAYDI (`/discover` lat/lng NULL'larni
chiqarib tashlaydi). Manzil bo'lsa — undan koordinata olib to'ldiramiz.

Xatolarga chidamli: geokodlash muvaffaqiyatsiz bo'lsa `None` qaytaradi va
filial saqlash buzilmaydi (oddiy holatga qaytadi).
"""
from __future__ import annotations

from typing import Optional, Tuple

import httpx
from loguru import logger

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim foydalanish shartlari aniq User-Agent talab qiladi.
_HEADERS = {"User-Agent": "Monvo/1.0 (+https://monvo.uz; support@monvo.uz)"}


async def _fetch(params: dict, timeout: float) -> list:
    """Nominatim'ga so'rov yuboradi va JSON ro'yxat qaytaradi (xato bo'lsa bo'sh)."""
    async with httpx.AsyncClient(timeout=timeout, headers=_HEADERS) as client:
        r = await client.get(_NOMINATIM_URL, params=params)
        if r.status_code != 200:
            return []
        data = r.json()
        return data if isinstance(data, list) else []


async def geocode_address(
    address: str,
    *,
    country: str = "uz",
    timeout: float = 6.0,
) -> Optional[Tuple[float, float]]:
    """Manzildan (lat, lng) qaytaradi. Topilmasa yoki xato bo'lsa — None."""
    address = (address or "").strip()
    if not address:
        return None
    params = {"q": address, "format": "json", "limit": 1, "addressdetails": 0}
    if country:
        params["countrycodes"] = country
    try:
        data = await _fetch(params, timeout)
    except Exception as exc:  # noqa: BLE001 — geokodlash hech qachon saqlashni buzmaydi
        logger.warning(f"geocode failed for {address!r}: {exc}")
        return None
    if not data:
        return None
    try:
        item = data[0]
        return float(item["lat"]), float(item["lon"])
    except (KeyError, ValueError, TypeError, IndexError):
        return None
