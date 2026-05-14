from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class SortField(str, Enum):
    api_list_order = "api_list_order"
    fans = "fans"
    challenges = "challenges"
    top3_count = "top3_count"
    ratio = "ratio_percent"
    rank_1st = "rank_1st"
    last_challenge_date = "last_challenge_date"
    display_name = "display_name"


class InfluencerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: str
    display_name: str
    profile_image_url: str | None
    category: str | None
    fans: int
    subscriber_count: int
    challenges: int
    top3_count: int
    ratio_percent: float | None
    rank_1st: int
    rank_2nd: int
    rank_3rd: int
    selection_date: date | None
    last_challenge_date: date | None
    updated_at: datetime
    api_list_order: int | None = None


class InfluencerRow(InfluencerOut):
    rank: int = Field(default=0, description="Computed rank for current sort")


class CrawlJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    started_at: datetime
    completed_at: datetime | None
    status: str
    rows_upserted: int
    message: str | None
