import os

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker

from config import settings


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


# ── Connection Pool ──────────────────────────────────────────────────────────
# Railway's managed Postgres caps at `max_connections` around 100 by default
# (and during rolling deploys old + new workers briefly double up — so the
# effective budget is closer to ~50 stable).
#
# Ultra-conservative defaults: 2 workers × (5 + 10) = 30 steady connections.
# During a deploy window peak ~60, still safely under 100.
#
# Override for bigger Postgres tiers or PgBouncer:
#   WORKERS=4 DB_POOL_SIZE=10 DB_MAX_OVERFLOW=20
# SQLite (test/dev in-memory) StaticPool'dan foydalanadi va pool_size /
# max_overflow / asyncpg connect_args'ni qabul qilmaydi. Shu sababli pool
# sozlamalari faqat Postgres uchun beriladi.
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
else:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        # Minimal footprint: 2 workers × (2 + 3) = 10 connections steady,
        # peak ~20 during a deploy. Leaves huge headroom for crashed-deploy
        # leftovers while the startup cleanup catches up.
        pool_size=_int_env("DB_POOL_SIZE", 2),
        max_overflow=_int_env("DB_MAX_OVERFLOW", 3),
        pool_timeout=_int_env("DB_POOL_TIMEOUT", 30),
        pool_recycle=_int_env("DB_POOL_RECYCLE", 600),  # recycle every 10min
        pool_pre_ping=True,
        # asyncpg-specific: shorten server connect timeout so the startup
        # retry loop isn't blocked for 60s when Postgres is saturated.
        connect_args={"timeout": 10, "command_timeout": 30},
    )
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
