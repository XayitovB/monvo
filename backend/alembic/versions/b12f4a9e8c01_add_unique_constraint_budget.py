"""add_unique_constraint_budget_user_month_year

Revision ID: b12f4a9e8c01
Revises: a93711038bb6
Create Date: 2026-03-22 02:10:00.000000

Budget jadvaliga (user_id, month, year) kombinatsiyasi uchun
UniqueConstraint qo'shildi — bir foydalanuvchiga bir oyda
faqat bitta budget yozuvi bo'lishi kafolatlandi.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b12f4a9e8c01'
down_revision: Union[str, None] = 'a93711038bb6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Avval dublikat yozuvlarni tozalaymiz (agar mavjud bo'lsa)
    # Har bir (user_id, month, year) juftligi uchun eng so'nggi budget ni saqlab,
    # qolganlarini o'chiramiz.
    op.execute("""
        DELETE FROM budget
        WHERE id NOT IN (
            SELECT MAX(id)
            FROM budget
            GROUP BY user_id, month, year
        )
    """)

    # Endi UniqueConstraint qo'shamiz
    op.create_unique_constraint(
        'uq_budget_user_month_year',
        'budget',
        ['user_id', 'month', 'year']
    )


def downgrade() -> None:
    op.drop_constraint('uq_budget_user_month_year', 'budget', type_='unique')
