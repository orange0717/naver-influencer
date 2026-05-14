"""Persist crawled rows and record crawl job status."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.crawler.playwright_crawler import ParsedInfluencer, run_crawl
from app.models import CrawlJob, Influencer

log = logging.getLogger(__name__)


def upsert_influencers(db: Session, rows: list[ParsedInfluencer]) -> int:
    count = 0
    now = datetime.now(timezone.utc)
    for r in rows:
        values = {
            "source_id": r.source_id,
            "display_name": r.display_name,
            "profile_image_url": r.profile_image_url,
            "category": r.category,
            "fans": r.fans,
            "subscriber_count": r.subscriber_count,
            "challenges": r.challenges,
            "top3_count": r.top3_count,
            "ratio_percent": r.ratio_percent,
            "rank_1st": r.rank_1st,
            "rank_2nd": r.rank_2nd,
            "rank_3rd": r.rank_3rd,
            "selection_date": r.selection_date,
            "last_challenge_date": r.last_challenge_date,
            "api_list_order": r.api_list_order,
            "raw_payload": r.raw_payload,
            "updated_at": now,
        }
        insert_stmt = pg_insert(Influencer).values(**values)
        upsert_stmt = insert_stmt.on_conflict_do_update(
            index_elements=[Influencer.source_id],
            set_={
                "display_name": insert_stmt.excluded.display_name,
                "profile_image_url": insert_stmt.excluded.profile_image_url,
                "category": insert_stmt.excluded.category,
                "fans": insert_stmt.excluded.fans,
                "subscriber_count": insert_stmt.excluded.subscriber_count,
                "challenges": insert_stmt.excluded.challenges,
                "top3_count": insert_stmt.excluded.top3_count,
                "ratio_percent": insert_stmt.excluded.ratio_percent,
                "rank_1st": insert_stmt.excluded.rank_1st,
                "rank_2nd": insert_stmt.excluded.rank_2nd,
                "rank_3rd": insert_stmt.excluded.rank_3rd,
                "selection_date": insert_stmt.excluded.selection_date,
                "last_challenge_date": insert_stmt.excluded.last_challenge_date,
                "api_list_order": insert_stmt.excluded.api_list_order,
                "raw_payload": insert_stmt.excluded.raw_payload,
                "updated_at": insert_stmt.excluded.updated_at,
            },
        )
        db.execute(upsert_stmt)
        count += 1
    db.commit()
    return count


def execute_crawl_job(db: Session) -> CrawlJob:
    """Runs one crawl; uses a DB advisory lock so API-triggered crawls do not overlap the worker."""
    got = db.execute(
        text("SELECT pg_try_advisory_lock(:k1, :k2)"),
        {"k1": settings.crawl_lock_key1, "k2": settings.crawl_lock_key2},
    ).scalar_one()
    if not got:
        now = datetime.now(timezone.utc)
        skip = CrawlJob(
            status="skipped",
            rows_upserted=0,
            completed_at=now,
            message="Another crawl is in progress (lock held)",
        )
        db.add(skip)
        db.commit()
        db.refresh(skip)
        log.warning("Crawl skipped: could not acquire advisory lock")
        return skip

    try:
        job = CrawlJob(status="running", rows_upserted=0)
        db.add(job)
        db.commit()
        db.refresh(job)
        try:
            rows = run_crawl()
            n = upsert_influencers(db, rows)
            job.status = "success"
            job.rows_upserted = n
            if n == 0:
                job.message = "Crawl finished with 0 rows (check ninfle API or Playwright fallback logs)"
            else:
                job.message = f"Upserted {n} influencers"
        except Exception as exc:  # noqa: BLE001
            log.exception("Crawl failed")
            job.status = "failed"
            job.message = str(exc)[:4000]
        job.completed_at = datetime.now(timezone.utc)
        db.add(job)
        db.commit()
        db.refresh(job)
        return job
    finally:
        db.execute(
            text("SELECT pg_advisory_unlock(:k1, :k2)"),
            {"k1": settings.crawl_lock_key1, "k2": settings.crawl_lock_key2},
        )
        db.commit()


def latest_success_job(db: Session) -> CrawlJob | None:
    stmt = (
        select(CrawlJob)
        .where(CrawlJob.status == "success")
        .order_by(CrawlJob.completed_at.desc().nullslast())
        .limit(1)
    )
    return db.execute(stmt).scalars().first()
