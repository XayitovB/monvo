"""Unify tariff system + rename tariffs to Start / Pro / Business.

Single source of truth = `tariffs` table. The legacy `billing_plans` table is
retired from the merchant/payment write-path. This migration:

  1. Renames tariff display titles by price:
       239 000 -> Start, 490 000 -> Pro, 990 000 -> Business
  2. Heals existing subscriptions/merchants/invoices: fills `tariff_id` from the
     legacy `plan_id` by matching monthly price (BillingPlan 239k/490k/990k ⇄
     Tariff start/business/enterprise). Fixes merchants that paid via a
     BillingPlan and ended up with a NULL tariff_id (shown as "subscription
     inactive / expired" in the merchant panel despite an active subscription).

Idempotent — safe to re-run. `billing_plans` rows are left intact (Invoice FK).

Revision ID: e034_unify_tariffs
Revises: e033_crash_reports
Create Date: 2026-06-14
"""
from alembic import op


revision = "e034_unify_tariffs"
down_revision = "e033_crash_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Tarif nomlari (narx bo'yicha)
    op.execute("UPDATE tariffs SET title_uz='Start', title_ru='Start' WHERE monthly_price=239000")
    op.execute("UPDATE tariffs SET title_uz='Pro', title_ru='Pro' WHERE monthly_price=490000")
    op.execute("UPDATE tariffs SET title_uz='Business', title_ru='Business' WHERE monthly_price=990000")

    # 2) Data-heal: legacy plan_id -> tariff_id (narx mosligi bo'yicha)
    op.execute(
        """
        UPDATE merchant_subscriptions s SET tariff_id = t.id
        FROM billing_plans p, tariffs t
        WHERE s.plan_id = p.id AND s.tariff_id IS NULL
          AND ROUND(t.monthly_price) = ROUND(p.price_monthly)
        """
    )
    op.execute(
        """
        UPDATE merchants m SET tariff_id = s.tariff_id
        FROM merchant_subscriptions s
        WHERE m.id = s.merchant_id AND m.tariff_id IS NULL AND s.tariff_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE invoices i SET tariff_id = t.id
        FROM billing_plans p, tariffs t
        WHERE i.plan_id = p.id AND i.tariff_id IS NULL
          AND ROUND(t.monthly_price) = ROUND(p.price_monthly)
        """
    )


def downgrade() -> None:
    # Nomlarni asl holatga (narx bo'yicha). tariff_id heal qaytarilmaydi.
    op.execute("UPDATE tariffs SET title_uz='Business', title_ru='Business' WHERE monthly_price=490000")
    op.execute("UPDATE tariffs SET title_uz='Enterprise', title_ru='Enterprise' WHERE monthly_price=990000")
