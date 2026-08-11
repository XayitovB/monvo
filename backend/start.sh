#!/bin/sh
set -e

# Railway postgres:// → postgresql+asyncpg:// formatiga o'girish
if [ -n "$DATABASE_URL" ]; then
    export DATABASE_URL=$(echo "$DATABASE_URL" | sed 's|^postgres://|postgresql+asyncpg://|; s|^postgresql://|postgresql+asyncpg://|')
    echo "DATABASE_URL format converted for asyncpg"
fi

echo "Cleaning up stale DB connections from crashed deploys..."
python scripts/cleanup_stale.py || true

echo "Running database migrations..."
alembic upgrade head

echo "Starting server on port ${PORT:-8000}..."
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers "${WORKERS:-2}" \
    --loop uvloop \
    --http httptools \
    --proxy-headers \
    --no-access-log \
    --log-level "${LOG_LEVEL_UVICORN:-warning}"
