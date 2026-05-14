from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Influencer(Base):
    __tablename__ = "influencers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_id: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(512))
    profile_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    category: Mapped[str | None] = mapped_column(String(256), nullable=True)
    fans: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    subscriber_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    challenges: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    top3_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    ratio_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    rank_1st: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    rank_2nd: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    rank_3rd: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    selection_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_challenge_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    api_list_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CrawlJob(Base):
    __tablename__ = "crawl_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), default="running")
    rows_upserted: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
