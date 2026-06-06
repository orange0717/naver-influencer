#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_naver_ai.py — 네이버 'AI 브리핑' 인용 실시간 교차검증 모듈

무엇을 하나
  대시보드에 등록된 [검색 키워드] 각각에 대해, '지금' 네이버 AI 브리핑에
  내 블로그(target) 글이 실제로 인용되어 있는지 교차검증하고 상태를 매긴다.

검증 3상태
  ✅ verified : AI 브리핑 영역 O + 내 블로그 글 인용 확인
  ⚠️ mismatch : AI 브리핑 영역 O + 내 글은 안 보임(다른 출처로 교체됨)
  ❌ expired  : AI 브리핑 영역 자체가 없음(그 키워드에 AI 브리핑 미노출)

두 가지 검증 소스
  (A) 로컬 HTML  --html ./html   ← 기본/안전(의존성 0). 저장된 검색 HTML을 대조.
  (B) 라이브     --live          ← Playwright 헤드리스로 실시간 네이버 검색.
        ⚠️ 실제 네이버 서버로 요청이 나갑니다. playwright 설치·실행은 오렌지 확인 후.
           미설치 시 자동으로 안내만 하고 중단합니다.

출력
  · 터미널 리포트(상태 배지)
  · verification_result.js   (window.VERIFICATION = {...}) ← 대시보드가 <script>로 로드
  · verification_result.json (기록용)

재사용: track_my_blog_in_ai.py 의 파서(ai_cards/parse_card/...)를 그대로 사용.
의존성: beautifulsoup4  (라이브 모드만 playwright 추가)

사용법
  # 로컬 저장 HTML로 검증(지금 바로 가능):
  python3 verify_naver_ai.py --target paichaiuniv --html ./html

  # 라이브 검증(설치·실행 확인 후):
  python3 verify_naver_ai.py --target paichaiuniv --live --keywords "독서모임 추천 도서,글쓰기 잘하는 법"
"""

from __future__ import annotations

import os
import re
import sys
import csv
import json
import glob
import argparse
from datetime import datetime, date
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("[설치 필요] pip install beautifulsoup4  후 다시 실행하세요.")

# track_my_blog_in_ai.py 의 검증된 파서를 재사용 (import 시 부작용 없음)
from track_my_blog_in_ai import (  # noqa: E402
    read_html, ai_cards, parse_card, extract_keyword, normalize_target,
)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

CSV_IN = "naver_ai_briefing_citations.csv"   # 있으면 키워드→내 글 URL 매핑 보강
RESULT_JS = "verification_result.js"
RESULT_JSON = "verification_result.json"
# 📚 전수 아카이브(누적): 네이버 AI가 가져간 '내 블로그 글'만 모은 자산 대장
ARCHIVE_JS = "ai_collected_my_posts.js"
ARCHIVE_JSON = "ai_collected_my_posts.json"

VERIFIED, MISMATCH, EXPIRED = "verified", "mismatch", "expired"
BADGE = {VERIFIED: "✅ 정상 노출", MISMATCH: "⚠️ 매칭 실패", EXPIRED: "❌ 미노출"}


# ─────────────────────────── 검증 코어 ───────────────────────────

def post_key(url: str):
    """blog.naver.com/<id>/<logNo> → (id, logNo). 같은 글 판정용."""
    m = re.search(r"blog\.naver\.com/([A-Za-z0-9_-]+)/(\d+)", url or "")
    return (m.group(1).lower(), m.group(2)) if m else ((url or "").lower(), "")


def parse_all_cards(soup):
    out = []
    for c in ai_cards(soup):
        p = parse_card(c)
        if p:
            out.append(p)
    return out


def verify_soup(soup, target_blog: str, want_url: str | None = None):
    """soup 1개(=키워드 1개 검색결과) → (status, my_card|None, others[]).

    판정은 '내 블로그(target_blog) 글'만 기준으로 한다.
    타사 도메인(매경·82쿡·교보문고 등)은 참고용 others 로만 모으고
    노출 판정에는 일절 반영하지 않는다(= 타사가 있다고 '매칭 실패'로 치지 않음).
    target_blog 는 normalize_target() 결과(소문자 blogId)이며 하드코딩 금지.

      ✅ verified : AI 브리핑에 내 블로그 글이 인용됨 (want_url 주면 '같은 글'까지 일치)
      ⚠️ mismatch : AI 브리핑에 내 블로그의 '다른 글'이 인용됨 (want_url 불일치)
      ❌ expired  : 내 블로그가 AI 브리핑에 없음
                    (AI 출처 영역 자체가 없거나 / 타사만 인용되어 내 글이 빠짐)
    """
    cards = parse_all_cards(soup)
    # 1) 내 블로그 글만 추출 — 동적 blogId 매칭(하드코딩 금지)
    mine = [p for p in cards if (p.get("blog_id") or "").lower() == target_blog]
    # 2) 타사 출처는 '참고용'으로만 수집(판정에서 제외)
    others = []
    for p in cards:
        label = p.get("blog_id") or p.get("name") or p.get("host") or ""
        if label and label.lower() != target_blog and label not in others:
            others.append(label)
    # 3) 판정 — 오직 내 블로그 기준
    if mine:
        if want_url:
            exact = [p for p in mine if post_key(p["url"]) == post_key(want_url)]
            if exact:
                return VERIFIED, exact[0], others
            return MISMATCH, mine[0], others    # 내 블로그의 '다른 글'
        return VERIFIED, mine[0], others
    # 내 글이 AI 브리핑에 없음 → 미노출 (타사만 있든, AI 영역이 아예 없든)
    return EXPIRED, None, others


# ─────────────────────── 📚 전수 아카이브(누적) ───────────────────────
# 목적: 단순 일치 검증이 아니라, 네이버 AI 브리핑이 '내 블로그(target)에서
#       가져다 쓴 모든 포스팅'을 한 번이라도 인용됐으면 누적 기록한다.
#       타사 도메인은 애초에 담기지 않으므로 화면에 섞일 여지가 없다.

# 인용 섹션/카테고리 추론 규칙 (제목 + AI 매칭 키워드 기반, 위에서부터 우선)
CATEGORY_RULES = [
    ("시",       ["시집", "좋은시", "시추천", "시 추천", "시인", "괴테", "릴케",
                  "윤동주", "나태주", "한용운", "김소월", "정호승", "ryan"]),
    ("소설",     ["소설", "장편", "단편", "추리", "스릴러", "고전소설", "novel"]),
    ("에세이",   ["에세이", "산문", "수필", "essay"]),
    ("자기계발", ["자기계발", "성공", "습관", "동기부여", "성장", "부자", "마인드셋"]),
    ("철학",     ["철학", "니체", "쇼펜하우어", "스토아", "명상록", "소크라테스", "칸트"]),
    ("심리",     ["심리", "마음", "위로", "힐링", "관계", "감정", "불안"]),
    ("명언/글귀", ["명언", "글귀", "좋은글", "명언집", "어록"]),
    ("인문",     ["인문", "역사", "고전", "교양"]),
]


def categorize(title: str, keywords: list[str]) -> str:
    """제목+키워드로 AI 답변에서 기여한 주제 분야를 추론."""
    hay = (title + " " + " ".join(keywords or [])).lower()
    for cat, kws in CATEGORY_RULES:
        if any(kw.lower() in hay for kw in kws):
            return cat
    return "기타"


def archive_key(url: str) -> str:
    """같은 글이면 같은 키. blog.naver.com/<id>/<logNo> → 'id/logNo'."""
    k = post_key(url)
    return f"{k[0]}/{k[1]}" if k[1] else (url or "").lower()


def mine_cards(soup, target_blog: str):
    """이 검색결과의 AI 브리핑 출처 중 '내 블로그 글' 전부(여러 개일 수 있음)."""
    return [p for p in parse_all_cards(soup)
            if (p.get("blog_id") or "").lower() == target_blog]


def load_archive_posts(path: str = ARCHIVE_JSON) -> dict:
    """기존 아카이브를 {archive_key: post} 로 로드(누적 보존용)."""
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {archive_key(p.get("post_url", "")): p for p in data.get("posts", [])}
        except Exception:
            pass
    return {}


def merge_archive(prev: dict, mine_hits: list, today: str) -> dict:
    """기존 아카이브 + 이번 수집분(mine_hits=[(keyword, card)]) → 누적 병합."""
    posts = {k: dict(v) for k, v in prev.items()}
    for kw, card in mine_hits:
        key = archive_key(card.get("url", ""))
        rec = posts.get(key)
        if rec is None:
            rec = {
                "post_url": card.get("url", ""),
                "title": card.get("title", "") or "",
                "post_date": card.get("date", "") or "",
                "keywords": [],
                "category": "",
                "first_seen": today,
                "last_seen": today,
                "status": "관리중",
                "cite_count": 0,
            }
            posts[key] = rec
        if card.get("title") and not rec.get("title"):
            rec["title"] = card["title"]
        if card.get("date") and not rec.get("post_date"):
            rec["post_date"] = card["date"]
        if kw and kw not in rec["keywords"]:
            rec["keywords"].append(kw)
        rec["last_seen"] = today
        rec["cite_count"] = len(rec["keywords"])      # AI 유입 기여도 = 매칭 키워드 수
        rec["category"] = categorize(rec.get("title", ""), rec["keywords"])
    return posts


def save_archive(posts: dict, target: str) -> dict:
    """기여도(매칭 키워드 수) 내림차순 정렬 후 json + js(window.ARCHIVE) 저장."""
    arr = sorted(posts.values(),
                 key=lambda p: (-p.get("cite_count", 0), p.get("first_seen", "")))
    payload = {
        "target": target,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "total": len(arr),
        "posts": arr,
    }
    with open(ARCHIVE_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    with open(ARCHIVE_JS, "w", encoding="utf-8") as f:
        f.write("window.ARCHIVE = ")
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    return payload


def archive_report(payload: dict):
    posts = payload["posts"]
    print("\n" + "=" * 70)
    print(f"  📚 네이버 AI가 가져간 내 블로그 자산  ·  타겟 {payload['target']}"
          f"  ·  총 {payload['total']}개")
    print("=" * 70)
    if not posts:
        print("  아직 AI 브리핑에서 '내 블로그' 인용이 확인된 글이 없습니다.")
        print("  → 검색결과 HTML을 ./html 에 더 저장하고 다시 실행하면 누적됩니다.")
        return
    from collections import defaultdict
    by_cat = defaultdict(list)
    for p in posts:
        by_cat[p.get("category") or "기타"].append(p)
    for cat in sorted(by_cat, key=lambda c: -len(by_cat[c])):
        print(f"\n  ▸ [{cat}] {len(by_cat[cat])}개")
        for p in by_cat[cat]:
            print(f"     · ({p['cite_count']}회 유입) {p['title'] or p['post_url']}")
            print(f"       키워드: {', '.join(p['keywords'][:5])}")
            print(f"       {p['post_url']}  · 최초발견 {p['first_seen']}  · 상태 {p['status']}")


# ─────────────────────────── 입력 소스 ───────────────────────────

def load_url_map(path: str = CSV_IN) -> dict:
    """naver_ai_briefing_citations.csv → {키워드: 내 글 URL} (있으면 정밀 매칭에 사용)."""
    m = {}
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8-sig") as f:
                for row in csv.DictReader(f):
                    kw = (row.get("keyword") or "").strip()
                    url = (row.get("post_url") or "").strip()
                    if kw and url:
                        m[kw] = url
        except Exception:
            pass
    return m


def iter_html(folder_or_file: str):
    if os.path.isdir(folder_or_file):
        fs = []
        for ext in ("*.html", "*.htm"):
            fs.extend(glob.glob(os.path.join(folder_or_file, "**", ext), recursive=True))
        return sorted(fs)
    return [folder_or_file] if os.path.isfile(folder_or_file) else []


def fetch_live(keyword: str):
    """Playwright 헤드리스로 실시간 네이버 검색 HTML 확보. (html, status)."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None, "playwright_missing"
    try:
        with sync_playwright() as pw:
            br = pw.chromium.launch(headless=True)
            pg = br.new_page(user_agent=UA, locale="ko-KR",
                             viewport={"width": 1280, "height": 2200})
            pg.goto(f"https://search.naver.com/search.naver?query={quote(keyword)}",
                    wait_until="domcontentloaded", timeout=20000)
            # AI 브리핑은 지연 로딩 → '더보기' 펼침 + 출처 라벨 대기
            try:
                pg.wait_for_selector("text=AI 출처 정보", timeout=6000)
            except Exception:
                pass
            for txt in ("더보기", "출처 더보기", "펼치기"):
                try:
                    btn = pg.get_by_text(txt, exact=False).first
                    if btn and btn.is_visible():
                        btn.click(timeout=1500)
                except Exception:
                    pass
            pg.wait_for_timeout(1500)
            html = pg.content()
            br.close()
        return html, "ok"
    except Exception as e:
        return None, f"error:{e}"


# ─────────────────────────── 실행 ───────────────────────────

def run_local(html_src: str, target: str, url_map: dict):
    items, mine_hits = [], []
    for path in iter_html(html_src):
        soup = BeautifulSoup(read_html(path), "html.parser")
        kw = extract_keyword(soup, os.path.splitext(os.path.basename(path))[0])
        status, my, others = verify_soup(soup, target, url_map.get(kw))
        items.append(_record(kw, status, my, others, source=os.path.basename(path)))
        for card in mine_cards(soup, target):       # 📚 아카이브 누적용(내 글만)
            mine_hits.append((kw, card))
    return items, mine_hits


def run_live(keywords: list[str], target: str, url_map: dict):
    items, mine_hits = [], []
    for kw in keywords:
        html, st = fetch_live(kw)
        if st == "playwright_missing":
            print("\n[라이브 모드 불가] playwright가 설치되어 있지 않습니다.")
            print("  설치(오렌지 확인 후):  pip install playwright && python3 -m playwright install chromium")
            print("  → 우선 로컬 모드로 검증하세요:  python3 verify_naver_ai.py --target",
                  target, "--html ./html\n")
            sys.exit(2)
        if html is None:
            items.append(_record(kw, EXPIRED, None, [], source=f"live:{st}", note="라이브 수집 실패"))
            continue
        soup = BeautifulSoup(html, "html.parser")
        status, my, others = verify_soup(soup, target, url_map.get(kw))
        items.append(_record(kw, status, my, others, source="live"))
        for card in mine_cards(soup, target):       # 📚 아카이브 누적용(내 글만)
            mine_hits.append((kw, card))
    return items, mine_hits


def _record(keyword, status, my, others, source="", note=""):
    return {
        "keyword": keyword,
        "status": status,
        "my_title": (my or {}).get("title", ""),
        "my_url": (my or {}).get("url", ""),
        "my_date": (my or {}).get("date", ""),
        "others": others[:6],
        "checked_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "source": source,
        "note": note,
    }


def save_outputs(payload: dict):
    with open(RESULT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    # 대시보드는 file:// 에서도 동작해야 하므로 fetch 대신 JS 변수로 임베드
    with open(RESULT_JS, "w", encoding="utf-8") as f:
        f.write("window.VERIFICATION = ")
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write(";\n")


def report(payload: dict):
    items = payload["items"]
    print(f"\n🔎 네이버 AI 브리핑 인용 검증  ·  타겟: {payload['target']}  ·  소스: {payload['source']}")
    print(f"   검증시각 {payload['generated_at']}   대상 {len(items)}건\n")
    print(f"  {'상태':10} {'검색 키워드':26} 내 글 / 비고")
    print("  " + "-" * 74)
    for it in items:
        badge = BADGE[it["status"]]
        if it["status"] == VERIFIED:
            tail = it["my_title"] or it["my_url"]
        elif it["status"] == MISMATCH:
            tail = "다른 출처로 교체 → " + (", ".join(it["others"][:3]) or "(출처 미상)")
        else:
            tail = it["note"] or "AI 브리핑 영역 없음"
        print(f"  {badge:10} {it['keyword'][:24]:26} {tail[:46]}")
    v = sum(1 for i in items if i["status"] == VERIFIED)
    rate = round(v / len(items) * 100) if items else 0
    print("  " + "-" * 74)
    print(f"  ✅ 정상 노출 {v}건 / 총 {len(items)}건   ·   검증 성공률 {rate}%")
    print(f"\n[저장] {RESULT_JS} , {RESULT_JSON}  → 대시보드(naver_ai_dashboard.html)에서 자동 반영")


def main():
    ap = argparse.ArgumentParser(description="네이버 AI 브리핑 인용 교차검증")
    ap.add_argument("--target", "-t", required=True,
                    help="내 블로그 (blogId / blog.naver.com/ID / URL)")
    ap.add_argument("--html", default="html", help="로컬 검증용 HTML 폴더/파일 (기본 ./html)")
    ap.add_argument("--live", action="store_true", help="Playwright 실시간 검증(설치 필요)")
    ap.add_argument("--keywords", default="", help="라이브 모드 검증 키워드(쉼표 구분)")
    args = ap.parse_args()

    target = normalize_target(args.target)
    url_map = load_url_map()

    if args.live:
        kws = [k.strip() for k in args.keywords.split(",") if k.strip()]
        if not kws:
            kws = list(url_map.keys())
        if not kws:
            sys.exit("[안내] 라이브 모드는 --keywords \"a,b\" 또는 CSV의 키워드가 필요합니다.")
        items, mine_hits = run_live(kws, target, url_map)
        source = "live(playwright)"
    else:
        if not iter_html(args.html):
            print(f"[입력 없음] '{args.html}' 에 HTML이 없습니다. 검색결과를 Cmd+S로 저장해 넣으세요.")
            return
        items, mine_hits = run_local(args.html, target, url_map)
        source = "local-html"

    payload = {
        "target": target,
        "source": source,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "items": items,
    }
    save_outputs(payload)
    report(payload)

    # 📚 전수 아카이브 누적 — 네이버 AI가 가져간 '내 블로그 글'만 대장에 적립
    archive_payload = save_archive(
        merge_archive(load_archive_posts(), mine_hits, date.today().isoformat()),
        target,
    )
    archive_report(archive_payload)


if __name__ == "__main__":
    main()
