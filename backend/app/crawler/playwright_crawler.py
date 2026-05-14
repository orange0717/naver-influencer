"""Playwright-based crawl: prefers captured JSON responses, falls back to table DOM."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import date
from typing import Any

from dateutil import parser as date_parser
from playwright.sync_api import sync_playwright

from app.config import settings

log = logging.getLogger(__name__)


@dataclass
class ParsedInfluencer:
    source_id: str
    display_name: str
    profile_image_url: str | None = None
    category: str | None = None
    fans: int = 0
    subscriber_count: int = 0
    challenges: int = 0
    top3_count: int = 0
    ratio_percent: float | None = None
    rank_1st: int = 0
    rank_2nd: int = 0
    rank_3rd: int = 0
    selection_date: date | None = None
    last_challenge_date: date | None = None
    api_list_order: int | None = None
    raw_payload: dict[str, Any] | None = None


def _parse_int(text: str) -> int:
    digits = re.sub(r"[^\d]", "", text or "")
    return int(digits) if digits else 0


def _parse_float(text: str) -> float | None:
    t = (text or "").strip().replace("%", "").replace(",", "")
    if not t:
        return None
    try:
        return float(t)
    except ValueError:
        return None


def _parse_date(text: str) -> date | None:
    t = (text or "").strip()
    if not t:
        return None
    try:
        return date_parser.parse(t, dayfirst=False, yearfirst=True).date()
    except (ValueError, TypeError):
        return None


def _walk_for_lists(obj: Any, out: list[Any], depth: int = 0) -> None:
    if depth > 12:
        return
    if isinstance(obj, list):
        if obj and isinstance(obj[0], dict):
            keys = set(obj[0].keys())
            score = sum(
                1
                for k in ("nickname", "name", "blogId", "blog_id", "fans", "follower")
                if any(x in keys for x in (k, k.lower()))
            )
            if score >= 2 or len(keys) >= 6:
                out.append(obj)
        for item in obj:
            _walk_for_lists(item, out, depth + 1)
    elif isinstance(obj, dict):
        for v in obj.values():
            _walk_for_lists(v, out, depth + 1)


def _ratio_heuristic(row: dict[str, Any]) -> float | None:
    if "totalKeywords" in row or "keywordScore" in row or "integratedTop3Count" in row:
        ks = row.get("keywordScore")
        tw = int(row.get("totalKeywords") or 0)
        it3 = int(row.get("integratedTop3Count") or 0)
        if ks is not None and ks != "":
            try:
                ksf = float(ks)
            except (TypeError, ValueError):
                pass
            else:
                if 0 <= ksf <= 100:
                    return round(ksf, 4)
        if tw > 0 and it3 >= 0:
            return round(100.0 * it3 / tw, 4)
        return None
    return None


def _dict_to_parsed(row: dict[str, Any]) -> ParsedInfluencer | None:
    name = (
        row.get("displayName")
        or row.get("nickname")
        or row.get("name")
        or row.get("title")
    )
    sid = (
        str(row.get("blogId") or row.get("blog_id") or row.get("naverId") or row.get("id") or row.get("userId") or "")
        or None
    )
    if name and sid:
        return ParsedInfluencer(
            source_id=sid,
            display_name=str(name),
            profile_image_url=row.get("profileImageUrl") or row.get("imageUrl") or row.get("image") or row.get("thumb"),
            category=row.get("category") or row.get("subject") or row.get("myKeywordCategory") or row.get("myKeyword"),
            fans=_parse_int(
                str(
                    row.get("fans")
                    or row.get("followerCount")
                    or row.get("fanCount")
                    or row.get("totalFollowerCount")
                    or row.get("subscriberCount")
                    or 0
                )
            ),
            subscriber_count=_parse_int(str(row.get("subscriberCount") or 0)),
            challenges=_parse_int(
                str(row.get("challenges") or row.get("challengeCount") or row.get("totalKeywords") or 0)
            ),
            top3_count=_parse_int(
                str(row.get("integratedTop3Count") or row.get("top3") or row.get("top3Count") or 0)
            ),
            ratio_percent=_ratio_heuristic(row)
            or _parse_float(str(row.get("ratio") or row.get("rate") or "")),
            rank_1st=_parse_int(str(row.get("first") or row.get("rank1") or row.get("top1Count") or 0)),
            rank_2nd=_parse_int(str(row.get("second") or row.get("rank2") or row.get("top2Count") or 0)),
            rank_3rd=_parse_int(str(row.get("third") or row.get("rank3") or row.get("top3Count") or 0)),
            selection_date=_parse_date(
                str(row.get("selectionDate") or row.get("selectedAt") or row.get("naverCreatedAt") or "")
            ),
            last_challenge_date=_parse_date(
                str(row.get("lastChallengeDate") or row.get("lastChallenge") or row.get("lastChallengedAt") or "")
            ),
            raw_payload=row,
        )
    if name and not sid:
        slug = re.sub(r"\W+", "-", str(name).lower()).strip("-")
        return ParsedInfluencer(
            source_id=slug[:200] or "unknown",
            display_name=str(name),
            raw_payload=row,
        )
    return None


def _parse_dom_table(page) -> list[ParsedInfluencer]:
    rows = page.evaluate(
        """() => {
      const tables = Array.from(document.querySelectorAll('table'));
      let best = [];
      for (const t of tables) {
        const trs = Array.from(t.querySelectorAll('tbody tr, tr')).filter(
          (r) => r.querySelectorAll('td').length >= 5
        );
        if (trs.length > best.length) best = trs;
      }
      return best.slice(0, 5000).map((tr) => {
        const cells = Array.from(tr.querySelectorAll('td, th')).map((td) => td.innerText.trim());
        const img = tr.querySelector('img');
        const link = tr.querySelector('a[href]');
        return { cells, img: img ? img.src : null, href: link ? link.href : null };
      });
    }"""
    )
    parsed: list[ParsedInfluencer] = []
    for item in rows:
        cells: list[str] = item.get("cells") or []
        if len(cells) < 5:
            continue
        if cells[0].lower() in ("#", "no", "순위", "rank"):
            continue
        idx = 1 if re.match(r"^\d+$", cells[0].replace(",", "")) else 0
        name_block = cells[idx] if idx < len(cells) else ""
        lines = [x.strip() for x in name_block.split("\n") if x.strip()]
        display_name = lines[0] if lines else name_block
        source_id = lines[1] if len(lines) > 1 else (item.get("href") or display_name)
        source_id = re.sub(r"^.*\/", "", str(source_id))[:256]
        cat = cells[idx + 1] if idx + 1 < len(cells) else None
        nums = []
        for c in cells[idx + 2 :]:
            if re.search(r"\d", c):
                nums.append(c)
        fans = _parse_int(nums[0]) if len(nums) > 0 else 0
        challenges = _parse_int(nums[1]) if len(nums) > 1 else 0
        top3 = _parse_int(nums[2]) if len(nums) > 2 else 0
        ratio = _parse_float(nums[3]) if len(nums) > 3 else None
        r1 = _parse_int(nums[4]) if len(nums) > 4 else 0
        r2 = _parse_int(nums[5]) if len(nums) > 5 else 0
        r3 = _parse_int(nums[6]) if len(nums) > 6 else 0
        dates: list[date | None] = []
        for c in cells:
            d = _parse_date(c)
            if d:
                dates.append(d)
        sel = dates[0] if len(dates) > 0 else None
        last_c = dates[1] if len(dates) > 1 else None
        parsed.append(
            ParsedInfluencer(
                source_id=source_id or display_name[:200],
                display_name=display_name[:512],
                profile_image_url=item.get("img"),
                category=cat,
                fans=fans,
                subscriber_count=0,
                challenges=challenges,
                top3_count=top3,
                ratio_percent=ratio,
                rank_1st=r1,
                rank_2nd=r2,
                rank_3rd=r3,
                selection_date=sel,
                last_challenge_date=last_c,
                api_list_order=None,
                raw_payload={"cells": cells},
            )
        )
    return parsed


def run_crawl() -> list[ParsedInfluencer]:
    if settings.crawl_use_ninfle_public_api:
        try:
            from app.crawler.ninfle_api import fetch_all_influencers

            api_rows = fetch_all_influencers()
            if api_rows:
                log.info("Using ninfle public API: %s influencers", len(api_rows))
                return api_rows
        except Exception as exc:  # noqa: BLE001
            log.warning("ninfle public API unavailable, falling back to browser: %s", exc)

    captured: list[Any] = []

    def handle_response(resp) -> None:
        try:
            ct = resp.headers.get("content-type", "")
            if "application/json" not in ct:
                return
            url = resp.url or ""
            if not any(k in url for k in ("api", "rank", "influencer", "ninfle", "graphql")):
                return
            captured.append(resp.json())
        except Exception:  # noqa: BLE001
            return

    candidates: list[ParsedInfluencer] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=settings.playwright_headless)
        context = browser.new_context(
            locale="ko-KR",
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1400, "height": 900},
        )
        page = context.new_page()
        page.on("response", handle_response)
        page.goto(settings.crawler_base_url, wait_until="networkidle", timeout=120_000)
        page.wait_for_timeout(2500)

        next_data = page.evaluate(
            """() => {
          const el = document.querySelector('#__NEXT_DATA__');
          if (!el || !el.textContent) return null;
          try { return JSON.parse(el.textContent); } catch (e) { return null; }
        }"""
        )

        if next_data:
            lists: list[Any] = []
            _walk_for_lists(next_data, lists)
            for lst in lists:
                for row in lst:
                    if isinstance(row, dict):
                        pr = _dict_to_parsed(row)
                        if pr:
                            candidates.append(pr)

        for payload in captured:
            lists: list[Any] = []
            _walk_for_lists(payload, lists)
            for lst in lists:
                for row in lst:
                    if isinstance(row, dict):
                        pr = _dict_to_parsed(row)
                        if pr:
                            candidates.append(pr)

        if not candidates:
            log.info("JSON paths empty; falling back to DOM table parsing")
            candidates = _parse_dom_table(page)

        browser.close()

    by_id: dict[str, ParsedInfluencer] = {}

    def score(x: ParsedInfluencer) -> int:
        return x.fans + x.challenges * 10 + (1 if x.raw_payload else 0)

    for c in candidates:
        cur = by_id.get(c.source_id)
        if cur is None or score(c) > score(cur):
            by_id[c.source_id] = c
    return list(by_id.values())
