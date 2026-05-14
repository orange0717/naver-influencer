"""initial schema

Revision ID: 20260514_0001
Revises:
Create Date: 2026-05-14

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260514_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crawl_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("rows_upserted", sa.Integer(), server_default="0", nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "influencers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_id", sa.String(length=256), nullable=False),
        sa.Column("display_name", sa.String(length=512), nullable=False),
        sa.Column("profile_image_url", sa.String(length=1024), nullable=True),
        sa.Column("category", sa.String(length=256), nullable=True),
        sa.Column("fans", sa.Integer(), server_default="0", nullable=False),
        sa.Column("challenges", sa.Integer(), server_default="0", nullable=False),
        sa.Column("top3_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ratio_percent", sa.Float(), nullable=True),
        sa.Column("rank_1st", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rank_2nd", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rank_3rd", sa.Integer(), server_default="0", nullable=False),
        sa.Column("selection_date", sa.Date(), nullable=True),
        sa.Column("last_challenge_date", sa.Date(), nullable=True),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", name="uq_influencers_source_id"),
    )


def downgrade() -> None:
    op.drop_table("influencers")
    op.drop_table("crawl_jobs")
