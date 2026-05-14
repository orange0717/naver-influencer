"""subscriber_count and api_list_order

Revision ID: 20260514_0002
Revises: 20260514_0001
Create Date: 2026-05-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260514_0002"
down_revision: Union[str, None] = "20260514_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "influencers",
        sa.Column("subscriber_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("influencers", sa.Column("api_list_order", sa.Integer(), nullable=True))
    op.create_index("ix_influencers_api_list_order", "influencers", ["api_list_order"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_influencers_api_list_order", table_name="influencers")
    op.drop_column("influencers", "api_list_order")
    op.drop_column("influencers", "subscriber_count")
