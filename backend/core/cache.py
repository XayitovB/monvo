"""Tiny JSON cache backed by Redis with a safe in-memory fallback.

Usage:
    @cached("announcements:active", ttl=60, key_fn=lambda target: target)
    async def active(target: str) -> list[dict]: ...

Cache misses fall through silently on any Redis error — never block the
request. No TTL means entries are cached for 60s by default.
"""
from __future__ import annotations

import asyncio
import json
import time
from functools import wraps
from typing import Any, Awaitable, Callable

from loguru import logger

from config import settings

try:
    from redis import asyncio as aioredis  # type: ignore
    _REDIS_AVAILABLE = True
except ImportError:  # pragma: no cover
    _REDIS_AVAILABLE = False


_client: "aioredis.Redis | None" = None
_local: dict[str, tuple[float, Any]] = {}   # fallback when Redis is absent
_LOCAL_MAX_ENTRIES = 2048


async def _get_client() -> "aioredis.Redis | None":
    global _client
    if not _REDIS_AVAILABLE or not settings.REDIS_URL:
        return None
    if _client is None:
        try:
            _client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=0.2,
                socket_connect_timeout=0.5,
            )
            await _client.ping()
            logger.success("Cache: Redis connected")
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"Cache: Redis unavailable, using in-memory ({exc})")
            _client = None
    return _client


def _local_get(key: str) -> Any:
    entry = _local.get(key)
    if not entry:
        return None
    expires_at, value = entry
    if expires_at < time.monotonic():
        _local.pop(key, None)
        return None
    return value


def _local_set(key: str, value: Any, ttl: int) -> None:
    if len(_local) > _LOCAL_MAX_ENTRIES:
        # naïve eviction — drop 25% oldest
        drop = sorted(_local.items(), key=lambda kv: kv[1][0])[: len(_local) // 4]
        for k, _ in drop:
            _local.pop(k, None)
    _local[key] = (time.monotonic() + ttl, value)


async def cache_get(key: str) -> Any:
    client = await _get_client()
    if client is not None:
        try:
            raw = await client.get(key)
            if raw is not None:
                return json.loads(raw)
        except Exception as exc:  # noqa: BLE001
            logger.debug(f"cache_get fail {key}: {exc}")
    return _local_get(key)


async def cache_set(key: str, value: Any, ttl: int = 60) -> None:
    client = await _get_client()
    if client is not None:
        try:
            await client.set(key, json.dumps(value, default=str), ex=ttl)
            return
        except Exception as exc:  # noqa: BLE001
            logger.debug(f"cache_set fail {key}: {exc}")
    _local_set(key, value, ttl)


async def rate_limit_incr(key: str, window_seconds: int) -> int:
    """Sliding-window-ish counter — returns current count after increment.

    Atomic via Redis INCR + EXPIRE. Falls back to in-memory if Redis is down
    (single-process correctness, multi-worker drift accepted).

    Use:
        n = await rate_limit_incr("api_rl:tok123", 60)
        if n > 60:
            raise HTTPException(429, ...)
    """
    client = await _get_client()
    if client is not None:
        try:
            # INCR returns the new value. If this is the first increment in the
            # window we set the TTL; subsequent calls in the same window leave
            # the existing TTL alone.
            n = await client.incr(key)
            if n == 1:
                await client.expire(key, window_seconds)
            return int(n)
        except Exception as exc:  # noqa: BLE001
            logger.debug(f"rate_limit_incr fail {key}: {exc}")
    # Local fallback — only correct within a single worker.
    now = time.monotonic()
    entry = _local.get(key)
    if entry and entry[0] >= now:
        count = int(entry[1] or 0) + 1
        _local[key] = (entry[0], count)
        return count
    _local[key] = (now + window_seconds, 1)
    return 1


async def cache_delete_prefix(prefix: str) -> None:
    """Invalidate all keys beginning with `prefix`. Best-effort."""
    client = await _get_client()
    if client is not None:
        try:
            async for k in client.scan_iter(match=f"{prefix}*"):
                await client.delete(k)
            return
        except Exception as exc:  # noqa: BLE001
            logger.debug(f"cache_delete_prefix fail {prefix}: {exc}")
    for k in [k for k in _local if k.startswith(prefix)]:
        _local.pop(k, None)


def cached(
    prefix: str,
    *,
    ttl: int = 60,
    key_fn: Callable[..., str] | None = None,
) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
    """Decorate an async function to memoize its JSON-serializable return value.

    `key_fn(*args, **kwargs)` builds the cache suffix. Default uses positional
    args repr. Never cache if the decorator target raises — we want fresh
    errors to bubble up.
    """
    def decorator(fn: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
        @wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                suffix = key_fn(*args, **kwargs) if key_fn else ":".join(map(str, args))
            except Exception:  # noqa: BLE001
                suffix = "default"
            key = f"{prefix}:{suffix}"
            hit = await cache_get(key)
            if hit is not None:
                return hit
            value = await fn(*args, **kwargs)
            # Don't block the response on set; fire-and-forget.
            asyncio.ensure_future(cache_set(key, value, ttl))
            return value
        return wrapper
    return decorator
