"""
core/leader.py
──────────────
Redis asosidagi yagona-yetakchi (leader-election). Bir nechta uvicorn worker
bo'lganda cron job'lar (kunlik push, backup, webhook retry) va Telegram webhook
o'rnatish FAQAT bitta worker'da ishlashi kerak — aks holda har push N marta
yuboriladi. Bu modul aynan bitta worker'ni "leader" qiladi.

Ishlash printsipi:
  - SET monvo:leader <id> NX EX 120 — birinchi olgan worker leader bo'ladi.
  - Leader har 40s lock'ni yangilaydi (XX EX 120). O'lib qolsa, lock 120s da
    o'chadi va boshqa worker uni egallaydi (failover).
  - REDIS_URL bo'lmasa (dev / yagona worker) — shu worker leader deb hisoblanadi.

`on_become_leader` callback FAQAT bir marta (worker birinchi leader bo'lganda)
chaqiriladi — scheduler/webhook ikki marta ishga tushmasligi uchun.
"""
import asyncio
import os
import socket

from loguru import logger

from config import settings

_LOCK_KEY = "monvo:leader"
_TTL = 120          # lock muddati (soniya)
_REFRESH = 40       # leader yangilash davri
_ID = f"{socket.gethostname()}:{os.getpid()}"

_is_leader = False
_ever_led = False
_task: asyncio.Task | None = None


def is_leader() -> bool:
    return _is_leader


async def start(on_become_leader) -> None:
    """Election loop'ini ishga tushiradi. Worker leader bo'lганда (bir marta)
    `on_become_leader()` chaqiriladi."""
    global _task, _is_leader, _ever_led
    if not settings.REDIS_URL:
        logger.warning("Leader: REDIS_URL yo'q — bu worker yagona leader")
        _is_leader = True
        _ever_led = True
        await on_become_leader()
        return
    _task = asyncio.create_task(_loop(on_become_leader))


async def _loop(on_become_leader) -> None:
    global _is_leader, _ever_led
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Leader: Redis ulanmadi ({e}) — bu worker leader sifatida davom")
        _is_leader = True
        if not _ever_led:
            _ever_led = True
            await on_become_leader()
        return

    while True:
        try:
            if _is_leader:
                ok = await r.set(_LOCK_KEY, _ID, xx=True, ex=_TTL)
                if not ok:
                    # Lock biror sababga ko'ra yo'qoldi — keyingi aylanada qayta olamiz
                    _is_leader = False
            else:
                got = await r.set(_LOCK_KEY, _ID, nx=True, ex=_TTL)
                if got:
                    _is_leader = True
                    logger.success(f"Leader: bu worker ({_ID}) yetakchi bo'ldi")
                    if not _ever_led:
                        _ever_led = True
                        await on_become_leader()
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Leader loop xato: {e}")
        await asyncio.sleep(_REFRESH if _is_leader else _TTL // 2)


async def stop() -> None:
    """Shutdown'da lock'ni bo'shatadi (agar leader bo'lsa) — failover tezroq."""
    global _task
    if _task:
        _task.cancel()
        _task = None
    if not _is_leader or not settings.REDIS_URL:
        return
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL)
        # Faqat o'zimizning lock bo'lsa o'chiramiz (boshqa worker'nikini emas).
        cur = await r.get(_LOCK_KEY)
        if cur and cur.decode() == _ID:
            await r.delete(_LOCK_KEY)
        await r.aclose()
    except Exception:  # noqa: BLE001
        pass
