"""Shared test fixtures.

Uses in-memory SQLite so tests run in CI without a live Postgres. The app's
models are installed via `Base.metadata.create_all` so migrations are not
required at test time.
"""
from __future__ import annotations

import asyncio
import os

os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("SECRET_KEY", "test-secret-" + "x" * 32)
os.environ.setdefault("ADMIN_SECRET_KEY", "test-admin-secret-" + "x" * 32)
os.environ.setdefault("ADMIN_USERNAME", "testadmin")
os.environ.setdefault("ADMIN_PASSWORD", "testpass")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "10000")
os.environ.setdefault("RATE_LIMIT_AUTH_PER_MINUTE", "10000")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import database  # noqa: E402
import models  # noqa: E402,F401 — Base.metadata to'liq bo'lishi uchun (create_all hamma jadvalni yaratadi)
from database import Base  # noqa: E402


@pytest_asyncio.fixture(scope="function")
async def test_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    # Patch module-level engine + session factory so the app uses sqlite.
    database.engine = engine
    database.AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine):
    async with database.AsyncSessionLocal() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(test_engine):
    # Import here so the patched engine is used when the app boots.
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
