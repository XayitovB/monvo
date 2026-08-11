"""Audit helpers for admin and system actions.

Writes to the shared `audit_logs` table. Uses its own background session so
the calling endpoint isn't blocked. `user_id` is nullable for admin /
system events — the `actor` column records who performed the action
(e.g. "admin:root", "admin:123").
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from database import AsyncSessionLocal
from models import AuditLog


async def _write(actor: str, action: str, user_id: int | None = None) -> None:
    try:
        async with AsyncSessionLocal() as session:
            session.add(
                AuditLog(
                    user_id=user_id,
                    actor=actor[:100],
                    action=action[:2000],
                    timestamp=datetime.now(timezone.utc),
                )
            )
            await session.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Admin audit write failed: actor={actor} action={action} err={exc}")


def log_admin_action(admin: Any, action: str) -> None:
    """Fire-and-forget audit log for an admin action.

    `admin` can be the dict returned by `get_current_admin()` (legacy .env
    admin) or an `AdminUser` ORM row (multi-admin). Either way we extract
    something human-readable for the `actor` column.
    """
    username = "unknown"
    try:
        if isinstance(admin, dict):
            username = admin.get("username") or admin.get("sub") or "root"
        else:
            username = getattr(admin, "username", None) or f"admin:{getattr(admin, 'id', '?')}"
    except Exception:  # noqa: BLE001
        username = "unknown"
    asyncio.ensure_future(_write(f"admin:{username}", action))
