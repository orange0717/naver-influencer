#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
track_my_blog_in_ai.py — 네이버 'AI 브리핑'이 내 블로그에서 인용해 간 포스팅 추적기

무엇을 하나
  네이버 검색결과 HTML(AI 브리핑 포함)에서 AI가 인용한 출처를 모두 파싱한 뒤,
  특정 타겟 블로그(예: 내 블로그)의 글만 골라
      [검색 키워드] → [내 포스팅 제목] → [인용된 글 URL]
  형태로 정리해 보여주고 naver_ai_briefing_citations.csv 로 저장한다.

[실데이터 보정 기준]  실제 search.naver.com HTML 해부 결과:
  · AI 브리핑의 인용 출처는 'AI 출처 정보' 라벨이 붙은 카드(api_subject_bx) 단위로 렌더.
  · 한 카드(=한 출처) 안에는 같은 글 URL로 링크가 여러 개:
        ① "출처명 blog.naver.com › blogId"  (출처 이름/아이디 = breadcrumb)
        ② (빈 링크)
        ③ "포스팅 제목"                       ← 우리가 원하는 제목
        ④ "2020.05.08. …스니펫"              (날짜+본문 미리보기)
  · 인용 출처는 블로그뿐 아니라 기관/뉴스/기업 사이트일 수도 있다(여기선 블로그 위주 추출).

⚠️ 정확도 주의 (중요)
  네이버 AI 브리핑은 로그인/지역/기기/동적로딩에 따라 화면과 서버응답(HTML)이 다를 수 있다.
  '내 블로그가 실제로 인용됐는지' 정확히 보려면, 브라우저에서 그 화면을 직접
  'Cmd+S → 웹페이지 전체'로 저장한 HTML 을 입력으로 써라(curl 본은 다를 수 있음).

의존성: beautifulsoup4 (표준 html.parser)

사용법
  # 내 블로그(blogId) 인용 글만:
  python3 track_my_blog_in_ai.py --target paichaiuniv
  python3 track_my_blog_in_ai.py --target blog.naver.com/paichaiuniv ./html
  python3 track_my_blog_in_ai.py --target https://blog.naver.com/paichaiuniv ai_briefing_source.html

  # 타겟 없이: 인용된 '모든 블로그' 나열(어떤 블로그가 잡히는지 탐색용)
  python3 track_my_blog_in_ai.py ./html
"""

from __future__ import annotations

import csv
import os
import re
import sys
import glob
import argparse
from urllib.parse import urlparse, parse_qs, unquote

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("[설치 필요] pip install beautifulsoup4  후 다시 실행하세요.")

DEFAULT_INPUT = "html"                 # 폴더 또는 파일
DEFAULT_SINGLE = "ai_briefing_source.html"
OUTPUT_CSV = "naver_ai_briefing_citations.csv"

AI_SOURCE_LABELS = ["AI 출처 정보", "AI 출처", "AI 인용"]
SECTION_BLOCK_CLASS = "api_subject_bx"
EXCLUDE_HOST = ("search.naver", "help.naver", "keep.naver", "nid.naver", "mate.naver",
                "ader.naver", "section.naver", "policy.naver", "navercorp")
DATE_RE = re.compile(r"^\s*\d{4}\.\s?\d{1,2}\.\s?\d{1,2}")
REDIRECT_PARAMS = ("u", "url", "outlink", "to")


# ─────────────────────────── 유틸 ───────────────────────────

def read_html(path: str) -> str:
    for enc in ("utf-8", "cp949", "euc-kr", "latin-1"):
        try:
            with open(path, "r", encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
    with open(path, "rb") as f:
        return f.read().decode("utf-8", errors="replace")


def unwrap(href: str) -> str:
    try:
        qs = parse_qs(urlparse(href).query)
        for k in REDIRECT_PARAMS:
            if qs.get(k) and qs[k][0].startswith("http"):
                return unquote(qs[k][0])
    except Exception:
        pass
    return href


def is_source(href: str) -> bool:
    if not href or not href.startswith("http"):
        return False
    return not any(b in (urlparse(href).netloc or "").lower() for b in EXCLUDE_HOST)


def normalize_target(target: str) -> str:
    """'blog.naver.com/ID', 'https://blog.naver.com/ID', 'ID' → 소문자 blogId."""
    if not target:
        return ""
    t = target.strip()
    m = re.search(r"blog\.naver\.com/([A-Za-z0-9_-]+)", t)
    if m:
        return m.group(1).lower()
    return t.lstrip("@/").lower()


def blog_id_from_url(url: str):
    m = re.search(r"blog\.naver\.com/([A-Za-z0-9_-]+)", url)
    if not m:
        return None
    bid = m.group(1)
    return None if bid.lower().endswith(".naver") else bid


def link_text(a) -> str:
    """링크 내부 텍스트 추출. 요소 경계에 인위적 공백을 넣지 않고(=separator 미사용)
    실제 텍스트 노드의 공백만 보존 → 검색어 강조(<strong>) 때문에 따옴표 주변에
    군더더기 공백이 끼는 문제를 방지한다. (' 나는 ... 했다 ' → '나는 ... 했다')"""
    return re.sub(r"\s+", " ", a.get_text("")).strip()


def clean_name(text: str, host: str) -> str:
    t = re.sub(r"\s+", " ", text or "").strip()
    if host and host in t:
        return t.split(host)[0].strip(" ·-|›")
    if "›" in t:
        head = re.sub(r"\s+\S+\.\S+\s*$", "", t.split("›")[0]).strip()
        return head or t
    return t


# ─────────────────────────── 키워드 ───────────────────────────

def extract_keyword(soup, fallback: str) -> str:
    for sel in [("input", {"name": "query"}), ("input", {"id": "query"}), ("input", {"id": "nx_query"})]:
        tag = soup.find(*sel)
        if tag and tag.get("value"):
            return tag["value"].strip()
    for f in [soup.find("meta", attrs={"property": "og:url"}), soup.find("link", attrs={"rel": "canonical"})]:
        if f:
            q = parse_qs(urlparse(f.get("content") or f.get("href") or "").query).get("query")
            if q:
                return unquote(q[0]).strip()
    if soup.title and soup.title.string:
        t = re.sub(r"\s*[:|]\s*네이버.*$", "", soup.title.string.strip()).strip()
        if t:
            return t
    return fallback


# ─────────────────────────── 카드 파싱 ───────────────────────────

def ai_cards(soup):
    label_re = re.compile("|".join(map(re.escape, AI_SOURCE_LABELS)))
    cards = [b for b in soup.find_all(class_=SECTION_BLOCK_CLASS) if b.find(string=label_re)]
    if cards:
        return cards
    # 폴백: 라벨의 조상 중 출처링크 품은 최소 컨테이너
    out, seen = [], set()
    for s in soup.find_all(string=label_re):
        cur = s.parent
        for _ in range(10):
            if cur is None:
                break
            if any(is_source(a.get("href", "")) for a in cur.find_all("a", href=True)):
                if id(cur) not in seen:
                    seen.add(id(cur)); out.append(cur)
                break
            cur = cur.parent
    return out


def parse_card(card):
    """카드 1개 → dict(name, host, blog_id, title, date, url, note) 또는 None."""
    # 1) 대표 출처 링크(=breadcrumb) 와 글 URL
    src_a = next((a for a in card.find_all("a", href=True) if is_source(a["href"])), None)
    if not src_a:
        return None
    url = unwrap(src_a["href"])
    host = (urlparse(url).netloc or "").lower().replace("m.", "", 1)
    name = clean_name(link_text(src_a), host)
    blog_id = blog_id_from_url(url)

    # 2) 같은 글 URL을 가리키는 링크들에서 제목/날짜 추출 (문서 순서)
    title, date = "", ""
    for a in card.find_all("a", href=True):
        if unwrap(a["href"]) != url:
            continue
        txt = link_text(a)
        if not txt:
            continue
        if host in txt or "›" in txt:        # breadcrumb (출처명 줄) → skip
            continue
        if DATE_RE.match(txt):               # 날짜로 시작 = 스니펫
            if not date:
                date = DATE_RE.match(txt).group(0).strip()
            continue
        if not title:                        # 첫 일반 텍스트 = 포스팅 제목
            title = txt
    # 3) AI 설명(왜/무슨 출처인지) — '네이버가 AI를 활용' 직전 텍스트
    note = ""
    strings = list(card.stripped_strings)
    for i, s in enumerate(strings):
        if s.startswith("네이버가 AI를 활용") and i > 0:
            note = strings[i - 1]
            break

    return {"name": name or host, "host": host, "blog_id": blog_id,
            "title": title, "date": date, "url": url, "note": note}


def parse_file(path):
    soup = BeautifulSoup(read_html(path), "html.parser")
    keyword = extract_keyword(soup, os.path.splitext(os.path.basename(path))[0])
    rows = []
    for card in ai_cards(soup):
        info = parse_card(card)
        if info:
            info["keyword"] = keyword
            rows.append(info)
    return keyword, rows


# ─────────────────────────── 입력/메인 ───────────────────────────

def iter_files(target):
    if os.path.isdir(target):
        fs = []
        for ext in ("*.html", "*.htm"):
            fs.extend(glob.glob(os.path.join(target, "**", ext), recursive=True))
        return sorted(fs)
    if os.path.isfile(target):
        return [target]
    return []


def main():
    ap = argparse.ArgumentParser(description="네이버 AI 브리핑 내 블로그 인용 추적")
    ap.add_argument("input", nargs="?", default=None,
                    help="HTML 파일 또는 폴더 (기본: ./html → 없으면 ai_briefing_source.html)")
    ap.add_argument("--target", "-t", default="",
                    help="타겟 블로그 (blogId / blog.naver.com/ID / URL). 생략 시 모든 블로그 나열")
    args = ap.parse_args()

    src = args.input or (DEFAULT_INPUT if os.path.isdir(DEFAULT_INPUT) else DEFAULT_SINGLE)
    files = iter_files(src)
    target = normalize_target(args.target)

    if not files:
        print(f"[입력 없음] '{src}' 에서 HTML을 찾지 못했습니다.")
        print("  네이버 검색(AI 브리핑) 화면을 Cmd+S '웹페이지 전체'로 저장 → ./html/ 에 넣고 다시 실행.")
        os.makedirs(DEFAULT_INPUT, exist_ok=True)
        return

    all_rows, blog_rows = [], []
    for path in files:
        kw, rows = parse_file(path)
        all_rows.extend(rows)
        for r in rows:
            if r["blog_id"]:
                blog_rows.append(r)

    # 타겟 필터
    if target:
        hits = [r for r in blog_rows if (r["blog_id"] or "").lower() == target]
        print(f"\n🎯 타겟 블로그: {target}  (blog.naver.com/{target})")
        if not hits:
            print(f"   → AI 브리핑 인용 0건. (이 HTML들에서는 인용 안 됨)")
            cited = sorted({r['blog_id'] for r in blog_rows if r['blog_id']})
            if cited:
                print(f"   참고: 이 HTML들에서 AI가 인용한 다른 블로그 {len(cited)}개 →",
                      ", ".join(cited[:15]))
        else:
            print(f"   → 인용 {len(hits)}건 발견!\n")
            for r in hits:
                print(f"  [{r['keyword']}]")
                print(f"     → 제목: {r['title'] or '(제목 미검출)'}")
                print(f"     → 링크: {r['url']}")
                if r['date']:
                    print(f"     → 작성일: {r['date']}")
        export = hits
    else:
        # 타겟 없음: 인용된 모든 블로그 나열
        print(f"\n[타겟 미지정] AI 브리핑이 인용한 '블로그' 전체 ({len(blog_rows)}건)\n")
        print(f"{'키워드':22} {'블로그ID':16} {'포스팅 제목'}")
        print("-" * 80)
        for r in blog_rows:
            print(f"{r['keyword'][:20]:22} {(r['blog_id'] or ''):16} {r['title'][:34]}")
        export = blog_rows

    # CSV
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["keyword", "blog_name", "blog_id", "post_title", "post_url", "post_date", "ai_note"])
        for r in export:
            w.writerow([r["keyword"], r["name"], r["blog_id"] or "", r["title"],
                        r["url"], r["date"], r["note"]])
    print(f"\n[저장] {OUTPUT_CSV}  ({len(export)}행)")

    # 비-블로그 출처 요약(참고)
    nonblog = [r for r in all_rows if not r["blog_id"]]
    if nonblog and not target:
        print(f"\n(참고) AI가 인용한 비-블로그 출처 {len(nonblog)}건:",
              ", ".join(sorted({r['name'] for r in nonblog})[:12]))


if __name__ == "__main__":
    main()
