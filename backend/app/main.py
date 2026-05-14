from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import asc, desc, func, nullsfirst, nullslast, select
from sqlalchemy.orm import Session

from app.config import APP_BUILD_MARKER, settings
from app.crawl_auth import require_crawl_auth
from app.crawl_service import execute_crawl_job
from app.db import SessionLocal, get_db
from app.migrate import run_migrations
from app.models import CrawlJob, Influencer
from app.schemas import CrawlJobOut, InfluencerRow, SortField

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

scheduler: BackgroundScheduler | None = None


def _scheduled_crawl() -> None:
    db = SessionLocal()
    try:
        execute_crawl_job(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.skip_auto_migrate:
        run_migrations()
    global scheduler
    if settings.embed_scheduler_in_api:
        scheduler = BackgroundScheduler(timezone=settings.crawl_schedule_timezone)
        trigger = CronTrigger(
            hour=settings.crawl_daily_hour,
            minute=settings.crawl_daily_minute,
            timezone=settings.crawl_schedule_timezone,
        )
        scheduler.add_job(
            _scheduled_crawl,
            trigger,
            id="naver_influencer_crawl",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
            misfire_grace_time=3600,
        )
        scheduler.start()
        log.info(
            "Embedded scheduler: daily at %02d:%02d (%s)",
            settings.crawl_daily_hour,
            settings.crawl_daily_minute,
            settings.crawl_schedule_timezone,
        )
    else:
        log.info("Embedded scheduler disabled (use worker service)")
    log.info(
        "Crawl config (api process): daily %02d:%02d %s pause=%ss 429_retries=%s marker=%s",
        settings.crawl_daily_hour,
        settings.crawl_daily_minute,
        settings.crawl_schedule_timezone,
        settings.crawl_api_pause_seconds,
        settings.crawl_api_429_max_retries,
        APP_BUILD_MARKER,
    )
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(title="Ninfle ranking API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/meta/crawler-info")
def crawler_info() -> dict[str, object]:
    """실행 중인 API가 최신 크롤 설정을 읽었는지 확인합니다."""
    return {
        "crawl_use_ninfle_public_api": settings.crawl_use_ninfle_public_api,
        "crawl_api_page_size": settings.crawl_api_page_size,
        "crawl_api_max_pages": settings.crawl_api_max_pages,
        "crawl_api_pause_seconds": settings.crawl_api_pause_seconds,
        "crawl_api_429_max_retries": settings.crawl_api_429_max_retries,
        "crawl_api_429_base_sleep_seconds": settings.crawl_api_429_base_sleep_seconds,
        "crawler_base_url": settings.crawler_base_url,
        "crawl_daily_hour": settings.crawl_daily_hour,
        "crawl_daily_minute": settings.crawl_daily_minute,
        "crawl_schedule_timezone": settings.crawl_schedule_timezone,
        "embed_scheduler_in_api": settings.embed_scheduler_in_api,
        "build_marker": APP_BUILD_MARKER,
    }


@app.get("/api/meta/last-crawl", response_model=CrawlJobOut | None)
def last_crawl(db: Session = Depends(get_db)) -> CrawlJob | None:
    stmt = select(CrawlJob).order_by(CrawlJob.started_at.desc()).limit(1)
    return db.execute(stmt).scalars().first()


@app.post("/api/crawl", response_model=CrawlJobOut)
def trigger_crawl(
    _auth: None = Depends(require_crawl_auth),
    db: Session = Depends(get_db),
) -> CrawlJob:
    return execute_crawl_job(db)


@app.get("/api/influencers", response_model=list[InfluencerRow])
def list_influencers(
    db: Session = Depends(get_db),
    sort: SortField = Query(SortField.api_list_order),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[InfluencerRow]:
    if sort == SortField.api_list_order:
        col = Influencer.api_list_order
        if order == "asc":
            stmt = select(Influencer).order_by(nullslast(asc(col)), asc(Influencer.source_id))
        else:
            stmt = select(Influencer).order_by(nullsfirst(desc(col)), desc(Influencer.source_id))
    else:
        col = getattr(Influencer, sort.value)
        direction = desc if order == "desc" else asc
        stmt = select(Influencer).order_by(direction(col), desc(Influencer.updated_at))
    stmt = stmt.limit(limit).offset(offset)
    rows = list(db.execute(stmt).scalars().all())
    out: list[InfluencerRow] = []
    for i, row in enumerate(rows, start=offset + 1):
        data = InfluencerRow.model_validate(row)
        data.rank = i
        out.append(data)
    return out


@app.get("/api/stats/summary")
def stats(db: Session = Depends(get_db)) -> dict[str, int]:
    total = db.execute(select(func.count()).select_from(Influencer)).scalar_one()
    return {"influencers": int(total)}
