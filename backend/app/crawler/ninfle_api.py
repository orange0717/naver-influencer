"""Official ninfle.kr public JSON API (no login)."""

from __future__ import annotations

import json
import logging
import time
from datetime import date
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from dateutil import parser as date_parser

from app.config import settings
from app.crawler.playwright_crawler import ParsedInfluencer

log = logging.getLogger(__name__)


def _parse_iso_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date_parser.parse(value).date()
    except (ValueError, TypeError):
        return None


def _ratio_from_row(row: dict[str, Any]) -> float | None:
    ks = row.get("keywordScore")
    tw = int(row.get("totalKeywords") or 0)
    it3 = int(row.get("integratedTop3Count") or 0)
    if ks is not None and ks != "":
        try:
            ksf = float(ks)
        except (TypeError, ValueError):
            ksf = None
        else:
            if 0 <= ksf <= 100:
                return round(ksf, 4)
    if tw > 0 and it3 >= 0:
        return round(100.0 * it3 / tw, 4)
    return None


def _row_to_parsed(row: dict[str, Any], list_order: int) -> ParsedInfluencer | None:
    naver_id = row.get("naverId")
    name = row.get("name")
    if not naver_id or not name:
        return None
    tw = int(row.get("totalKeywords") or 0)
    total_f = int(row.get("totalFollowerCount") or 0)
    sub = int(row.get("subscriberCount") or 0)
    payload = dict(row)
    payload["_apiListOrder"] = list_order
    return ParsedInfluencer(
        source_id=str(naver_id)[:256],
        display_name=str(name)[:512],
        profile_image_url=row.get("imageUrl"),
        category=(row.get("myKeywordCategory") or row.get("myKeyword") or None),
        fans=total_f or sub,
        subscriber_count=sub,
        challenges=tw,
        top3_count=int(row.get("integratedTop3Count") or 0),
        ratio_percent=_ratio_from_row(row),
        rank_1st=int(row.get("top1Count") or 0),
        rank_2nd=int(row.get("top2Count") or 0),
        rank_3rd=int(row.get("top3Count") or 0),
        selection_date=_parse_iso_date(row.get("naverCreatedAt")),
        last_challenge_date=_parse_iso_date(row.get("lastChallengedAt")),
        api_list_order=list_order,
        raw_payload=payload,
    )


def _api_list_url() -> str:
    base = settings.crawler_base_url.rstrip("/") + "/"
    return urljoin(base, "api/influencers")


def _fetch_page_json(url: str) -> dict[str, Any]:
    """GET one page; retries 429 and transient TLS/DNS/reset errors."""
    max_attempts = max(settings.crawl_api_429_max_retries + 1, 6)
    last_err: BaseException | None = None
    for attempt in range(max_attempts):
        req = Request(
            url,
            headers={"User-Agent": settings.crawler_http_user_agent, "Accept": "application/json"},
        )
        try:
            with urlopen(req, timeout=120) as resp:  # noqa: S310 — fixed host
                return json.loads(resp.read().decode("utf-8"))
        except HTTPError as exc:
            last_err = exc
            if exc.code == 429 and attempt < max_attempts - 1:
                wait = settings.crawl_api_429_base_sleep_seconds * (2 ** min(attempt, settings.crawl_api_429_max_retries))
                log.warning(
                    "ninfle API 429, sleeping %.1fs then retry %s/%s",
                    wait,
                    attempt + 1,
                    max_attempts,
                )
                time.sleep(wait)
                continue
            raise
        except json.JSONDecodeError as exc:
            last_err = exc
            if attempt < max_attempts - 1:
                log.warning("ninfle API invalid JSON, retry %s/%s: %s", attempt + 1, max_attempts, exc)
                time.sleep(max(0.5, settings.crawl_api_pause_seconds))
                continue
            raise
        except (URLError, TimeoutError) as exc:
            last_err = exc
            if attempt < max_attempts - 1:
                wait = min(60.0, settings.crawl_api_429_base_sleep_seconds * (2 ** min(attempt, 4)))
                log.warning(
                    "ninfle API network error %s, retry %s/%s after %.1fs",
                    exc,
                    attempt + 1,
                    max_attempts,
                    wait,
                )
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(last_err)  # pragma: no cover


def fetch_all_influencers() -> list[ParsedInfluencer]:
    """GET /api/influencers?page=&limit= (public)."""
    list_url = _api_list_url()
    parsed_host = (urlparse(list_url).hostname or "").lower()
    if parsed_host != "ninfle.kr" and not parsed_host.endswith(".ninfle.kr"):
        raise ValueError(f"Expected ninfle.kr host in crawler URL, got {parsed_host!r}")

    limit = max(1, min(500, settings.crawl_api_page_size))
    page = 1
    total_pages = 1
    out: list[ParsedInfluencer] = []
    global_idx = 0
    pages_fetched = 0

    while page <= total_pages and page <= settings.crawl_api_max_pages:
        qs = f"?page={page}&limit={limit}"
        url = list_url + qs
        payload = _fetch_page_json(url)
        pages_fetched += 1

        if page == 1:
            total_pages = int(payload.get("total_pages") or 1)
            log.info("ninfle API: total_pages=%s limit=%s", total_pages, limit)

        rows = payload.get("influencers") or []
        if not rows:
            break
        for row in rows:
            if isinstance(row, dict):
                global_idx += 1
                p = _row_to_parsed(row, global_idx)
                if p:
                    out.append(p)
        page += 1
        if page <= total_pages and page <= settings.crawl_api_max_pages:
            time.sleep(max(0.0, settings.crawl_api_pause_seconds))

    log.info("ninfle API crawl done: %s influencers (%s pages)", len(out), pages_fetched)
    return out
