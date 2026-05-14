"""Dedicated crawl scheduler process (run separately from the API)."""

from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.crawl_service import execute_crawl_job
from app.db import SessionLocal
from app.migrate import run_migrations

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


def _job() -> None:
    db = SessionLocal()
    try:
        job = execute_crawl_job(db)
        log.info("Crawl job %s finished: %s (%s rows)", job.id, job.status, job.rows_upserted)
    finally:
        db.close()


def main() -> None:
    run_migrations()
    log.info(
        "Worker crawl config: daily %02d:%02d %s pause=%ss 429_retries=%s startup_crawl=%s",
        settings.crawl_daily_hour,
        settings.crawl_daily_minute,
        settings.crawl_schedule_timezone,
        settings.crawl_api_pause_seconds,
        settings.crawl_api_429_max_retries,
        settings.run_crawl_on_startup,
    )
    if settings.run_crawl_on_startup:
        log.info("Running crawl once on worker startup")
        try:
            _job()
        except Exception:
            log.exception("Startup crawl failed; scheduler will still run")
    trigger = CronTrigger(
        hour=settings.crawl_daily_hour,
        minute=settings.crawl_daily_minute,
        timezone=settings.crawl_schedule_timezone,
    )
    scheduler = BlockingScheduler(timezone=settings.crawl_schedule_timezone)
    scheduler.add_job(
        _job,
        trigger,
        id="naver_influencer_crawl_worker",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
    )
    log.info(
        "Worker scheduler: daily at %02d:%02d (%s)",
        settings.crawl_daily_hour,
        settings.crawl_daily_minute,
        settings.crawl_schedule_timezone,
    )
    scheduler.start()


if __name__ == "__main__":
    main()
