"""
alembic/env.py  (FIX #2 — Alembic async migration)
────────────────────────────────────────────────────
Asyncpg + SQLAlchemy async engine bilan ishlash uchun sozlangan.

Foydalanish:
  alembic revision --autogenerate -m "description"
  alembic upgrade head
  alembic downgrade -1
"""
import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Backend papkasini Python path ga qo'shamiz
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Models va config import (autogenerate uchun metadata kerak)
from database import Base
from config import settings
import models  # noqa: F401 — barcha modellar ro'yxatga olinishi uchun

# Alembic config
config = context.config

# alembic.ini logging sozlamalari
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# DATABASE_URL ni .env dan olish
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# Barcha modellarni autogenerate uchun ulash
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Offline (URL only) rejimda migration."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,       # Ustun tip o'zgarishlarini ham aniqlash
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Async engine bilan online migration."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Online rejimda async migration ishlatish."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
