"""
core/token_revocation.py
────────────────────────
JWT token'larni muddatidan oldin bekor qilish (logout / "barcha qurilmadan
chiqish") uchun blacklist.

  - Har token'da `jti` (unique id) bor (core/security.py).
  - Logout → `revoke(jti, exp)` blacklist'ga yozadi (Redis yoki RAM, core/cache).
  - get_current_* dependency'lar `is_revoked(jti)` ni tekshiradi.
  - Blacklist yozuvi token muddati tugagach avtomatik o'chadi (TTL = exp - now),
    shuning uchun cheksiz o'smaydi.

`jti` yo'q eski token'lar bekor qilinmaydi (orqaga moslik) — ular o'z
muddati tugaguncha amal qiladi.
"""
from __future__ import annotations

import time
from typing import Optional

from core.cache import cache_get, cache_set

_PREFIX = "revoked_jti:"


async def revoke(jti: Optional[str], exp_ts: Optional[float] = None) -> None:
    """Token'ni bekor qiladi. `exp_ts` — token tugash vaqti (unix), TTL hisoblash uchun."""
    if not jti:
        return
    ttl = 7 * 24 * 3600  # default: 7 kun
    if exp_ts:
        ttl = max(1, int(exp_ts - time.time()))
    await cache_set(f"{_PREFIX}{jti}", 1, ttl=ttl)


async def is_revoked(jti: Optional[str]) -> bool:
    if not jti:
        return False
    return (await cache_get(f"{_PREFIX}{jti}")) is not None
