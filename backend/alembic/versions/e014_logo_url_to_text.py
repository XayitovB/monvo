"""Convert logo_url columns from VARCHAR(500) to TEXT.

Inline base64 brand logos easily exceed 500 chars (a 64×64 PNG is ~5KB
base64-encoded, a 256×256 photo is ~50KB+). The narrow VARCHAR was
causing PostgreSQL to reject every logo update with an internal server
error.

Idempotent — uses USING clause so existing rows survive the type
change.

Revision ID: e014_logo_url_to_text
Revises: e013_perf_indexes
Create Date: 2026-05-02
"""
from alembic import op

revision = "e014_logo_url_to_text"
down_revision = "e013_perf_indexes"
branch_labels = None
depends_on = None


def _exec(sql: str) -> None:
    op.execute(sql)


def upgrade() -> None:
    _exec(
        "ALTER TABLE merchants "
        "ALTER COLUMN logo_url TYPE TEXT USING logo_url::TEXT"
    )
    _exec(
        "ALTER TABLE app_settings "
        "ALTER COLUMN logo_url TYPE TEXT USING logo_url::TEXT"
    )
    # holdings table is optional — guard with EXISTS so the migration
    # doesn't fail on environments that haven't run the holdings migration.
    _exec(
        "DO $$ BEGIN "
        "  IF EXISTS (SELECT 1 FROM information_schema.tables "
        "             WHERE table_name='holdings') THEN "
        "    EXECUTE 'ALTER TABLE holdings "
        "             ALTER COLUMN logo_url TYPE TEXT USING logo_url::TEXT'; "
        "  END IF; "
        "END $$;"
    )


def downgrade() -> None:
    # Truncate any rows that wouldn't fit back in VARCHAR(500) so the
    # downgrade doesn't fail mid-flight.
    _exec("UPDATE merchants SET logo_url = LEFT(logo_url, 500)")
    _exec(
        "ALTER TABLE merchants "
        "ALTER COLUMN logo_url TYPE VARCHAR(500) USING LEFT(logo_url, 500)"
    )
    _exec("UPDATE app_settings SET logo_url = LEFT(logo_url, 500)")
    _exec(
        "ALTER TABLE app_settings "
        "ALTER COLUMN logo_url TYPE VARCHAR(500) USING LEFT(logo_url, 500)"
    )
    _exec(
        "DO $$ BEGIN "
        "  IF EXISTS (SELECT 1 FROM information_schema.tables "
        "             WHERE table_name='holdings') THEN "
        "    EXECUTE 'UPDATE holdings SET logo_url = LEFT(logo_url, 500)'; "
        "    EXECUTE 'ALTER TABLE holdings "
        "             ALTER COLUMN logo_url TYPE VARCHAR(500) "
        "             USING LEFT(logo_url, 500)'; "
        "  END IF; "
        "END $$;"
    )
