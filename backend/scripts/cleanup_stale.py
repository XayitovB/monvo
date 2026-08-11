"""Kill our own idle Postgres connections from crashed deploys.

Runs before `alembic upgrade head` so the migration step isn't starved by
stale backends. Safe: only terminates connections owned by the same DB
user and idle for more than 30 seconds.

Invoked from start.sh as:
    python scripts/cleanup_stale.py || true
"""
import asyncio
import os
import sys


async def main() -> int:
    try:
        import asyncpg  # noqa: F401
    except ImportError:
        print("[cleanup_stale] asyncpg missing — skipping")
        return 0

    url = os.getenv("DATABASE_URL", "")
    if not url:
        print("[cleanup_stale] DATABASE_URL unset — skipping")
        return 0
    for prefix in ("postgresql+asyncpg://", "postgres+asyncpg://"):
        if url.startswith(prefix):
            url = "postgresql://" + url[len(prefix):]
            break

    import asyncpg
    conn = None
    for attempt in range(5):
        try:
            conn = await asyncpg.connect(url, timeout=5)
            break
        except Exception as exc:  # noqa: BLE001
            print(f"[cleanup_stale] attempt {attempt + 1}/5 failed: {exc}")
            await asyncio.sleep(2)

    if conn is None:
        print("[cleanup_stale] could not connect — skipping")
        return 0

    try:
        rows = await conn.fetch("""
            SELECT pg_terminate_backend(pid) AS ok
            FROM pg_stat_activity
            WHERE pid <> pg_backend_pid()
              AND usename = current_user
              AND state IN ('idle', 'idle in transaction', 'idle in transaction (aborted)')
              AND state_change < NOW() - INTERVAL '30 seconds'
        """)
        print(f"[cleanup_stale] terminated {len(rows)} stale connections")
    except Exception as exc:  # noqa: BLE001
        print(f"[cleanup_stale] query failed: {exc}")
    finally:
        try:
            await conn.close()
        except Exception:  # noqa: BLE001
            pass
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
