#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
collect_and_verify.py — 내 블로그가 '어떤 키워드에서' 네이버 AI 브리핑에 인용되는지 자동 탐색

흐름
  1) Worker 프록시로 내 블로그 최신 글 제목 N개 수집
  2) 제목 → 검색 키워드로 정제 (블로그식 접두/접미어 제거)
  3) 각 키워드로 네이버 검색(HTML)을 받아 AI 브리핑 출처에 내 블로그가 있는지 검증
  4) 인용 발견분 정리 + verification_result.js(대시보드 연동) + CSV 저장

⚠️ 네이버 검색에 키워드 수만큼 요청이 나갑니다(기본 12회, 요청 간 딜레이 1.3초).
   대량 크롤링이 아니라 '내 글 인용 탐색' 용도이며 소수로 제한합니다.

의존성: beautifulsoup4 (표준 urllib 사용)
재사용: track_my_blog_in_ai.py 파서 + verify_naver_ai.py 검증/저장 로직

사용법
  python3 collect_and_verify.py --target orangelibrary_
  python3 collect_and_verify.py --target orangelibrary_ --count 60 --limit 20 --save-html
"""

from __future__ import annotations

import os
import re
import sys
import csv
import json
import time
import argparse
import urllib.parse
import urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("[설치 필요] pip install beautifulsoup4")

from track_my_blog_in_ai import normalize_target
from verify_naver_ai import (
    verify_soup, save_outputs, VERIFIED, MISMATCH, EXPIRED, BADGE,
)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
WORKER = "https://ninfl-proxy.orange-e65.workers.dev"
SAVE_DIR = "html_live"
CSV_OUT = "naver_ai_briefing_citations.csv"

# 블로그 제목 흔한 군더더기 (검색 키워드에선 빼는 게 AI 브리핑 적중률↑)
PREF = {"북리뷰", "북스타그램", "서평", "책리뷰", "도서리뷰", "리뷰", "감사일기", "오렌지도서관"}
SUFF = {"에세이추천", "자기계발도서추천", "철학책추천", "시집추천", "책추천", "도서추천",
        "에세이", "추천", "후기", "리뷰", "명언집", "명언", "글귀"}


# ─────────────── 수집/정제 ───────────────

def http_get(url: str, timeout: int = 20) -> str | None:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/json,*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"   (요청 실패: {e})")
        return None


def fetch_titles(blog_id: str, count: int) -> list[str]:
    """Worker 프록시는 count>30 이면 오작동 → 30개씩 페이지네이션으로 누적 수집."""
    PER = 30
    out = []
    pages = (count + PER - 1) // PER
    for pg in range(1, pages + 1):
        need = min(PER, count - len(out))
        if need <= 0:
            break
        url = (f"{WORKER}/blog-posts?blogId={urllib.parse.quote(blog_id)}"
               f"&page={pg}&count={need}")
        raw = http_get(url)
        if not raw:
            break
        try:
            data = json.loads(raw)
        except Exception:
            break
        page_posts = data.get("postList") or []
        if not page_posts:
            break
        for p in page_posts:
            t = (p.get("title") or "").strip()
            if "%" in t:
                try:
                    t = urllib.parse.unquote(t.replace("+", " "))
                except Exception:
                    pass
            if t:
                out.append(t)
        if len(out) >= count:
            break
    return out[:count]


def to_keyword(title: str) -> str:
    t = re.sub(r"[#\[\]()|·:_/]+", " ", title)
    words = [w for w in t.split() if w]
    while words and words[0] in PREF:
        words.pop(0)
    while words and words[-1] in SUFF:
        words.pop()
    return " ".join(words[:6]).strip()


def fetch_search_html(keyword: str) -> str | None:
    url = "https://search.naver.com/search.naver?query=" + urllib.parse.quote(keyword)
    return http_get(url)


# ─────────────── 메인 ───────────────

def main():
    ap = argparse.ArgumentParser(description="내 블로그 AI 브리핑 인용 키워드 자동 탐색")
    ap.add_argument("--target", "-t", required=True, help="내 블로그(blogId/URL)")
    ap.add_argument("--count", type=int, default=40, help="글 제목 수집 개수(기본 40)")
    ap.add_argument("--limit", type=int, default=12, help="검색·검증할 키워드 수(기본 12)")
    ap.add_argument("--delay", type=float, default=1.3, help="요청 간 딜레이 초(기본 1.3)")
    ap.add_argument("--save-html", action="store_true", help=f"받은 검색 HTML을 ./{SAVE_DIR}/ 에 저장")
    args = ap.parse_args()

    target = normalize_target(args.target)
    print(f"🎯 타겟 블로그: {target}\n")

    print(f"① 글 제목 수집(Worker 프록시, 최대 {args.count}개)…")
    titles = fetch_titles(target, args.count)
    if not titles:
        sys.exit("   글 목록을 가져오지 못했습니다. blogId를 확인하세요.")
    # 키워드 정제 + 중복 제거(순서 유지)
    seen, keywords = set(), []
    for t in titles:
        kw = to_keyword(t)
        if kw and len(kw) >= 2 and kw not in seen:
            seen.add(kw)
            keywords.append(kw)
    keywords = keywords[:args.limit]
    print(f"   글 {len(titles)}개 → 검증 키워드 {len(keywords)}개 추출\n")

    if args.save_html:
        os.makedirs(SAVE_DIR, exist_ok=True)

    print(f"② 키워드별 네이버 검색 + AI 브리핑 인용 검증 (딜레이 {args.delay}s)…\n")
    items, hits = [], []
    for i, kw in enumerate(keywords, 1):
        print(f"  [{i}/{len(keywords)}] '{kw}' …", end="", flush=True)
        html = fetch_search_html(kw)
        if not html:
            items.append(_rec(kw, EXPIRED, None, [], note="검색 HTML 수집 실패"))
            continue
        if args.save_html:
            safe = re.sub(r"[^\w가-힣 ]", "", kw)[:40] or f"kw{i}"
            with open(os.path.join(SAVE_DIR, f"{safe}.html"), "w", encoding="utf-8") as f:
                f.write(html)
        soup = BeautifulSoup(html, "html.parser")
        status, my, others = verify_soup(soup, target)
        items.append(_rec(kw, status, my, others))
        mark = {VERIFIED: "✅ 인용!", MISMATCH: "△ 내 다른글", EXPIRED: "✕ 미노출"}[status]
        print(f" {mark}")
        if status == VERIFIED:
            hits.append(items[-1])
        if i < len(keywords):
            time.sleep(args.delay)

    # 결과 저장
    payload = {
        "target": target,
        "source": "auto-collect(curl)",
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "items": items,
    }
    save_outputs(payload)
    _save_csv(hits)
    _report(payload, hits)


def _rec(keyword, status, my, others, note=""):
    return {
        "keyword": keyword, "status": status,
        "my_title": (my or {}).get("title", ""),
        "my_url": (my or {}).get("url", ""),
        "my_date": (my or {}).get("date", ""),
        "others": others[:6],
        "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source": "auto-collect", "note": note,
    }


def _save_csv(hits):
    with open(CSV_OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["keyword", "post_title", "post_url", "post_date", "checked_at"])
        for h in hits:
            w.writerow([h["keyword"], h["my_title"], h["my_url"], h["my_date"], h["checked_at"]])


def _report(payload, hits):
    items = payload["items"]
    v = sum(1 for i in items if i["status"] == VERIFIED)
    m = sum(1 for i in items if i["status"] == MISMATCH)
    e = sum(1 for i in items if i["status"] == EXPIRED)
    print("\n" + "=" * 66)
    print(f"  결과: 검증 {len(items)}개 키워드  ·  ✅ 내 글 인용 {v}건 / ⚠️ 미인용 {m} / ✕ AI브리핑없음 {e}")
    print("=" * 66)
    if hits:
        print("\n  🎉 내 블로그가 AI 브리핑에 인용된 키워드:")
        for h in hits:
            print(f"     · [{h['keyword']}] → {h['my_title'] or h['my_url']}")
            print(f"       {h['my_url']}")
    else:
        print("\n  현재 수집 범위에선 AI 브리핑 인용 0건.")
        print("  → --count/--limit 를 늘려 더 많은 글을 탐색하거나, '구체적 책·시 제목' 위주로 검증해 보세요.")
    print(f"\n[저장] verification_result.js / {CSV_OUT}  → 대시보드(naver_ai_dashboard.html) 자동 반영")


if __name__ == "__main__":
    main()
