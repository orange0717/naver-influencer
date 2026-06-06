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
# 🧭 기준점: 내 원본 발행 포스팅 마스터 리스트 (logNo 1:1 매칭의 진실의 원천)
from my_posts import (  # noqa: E402
    load_my_posts, build_my_posts, save_my_posts, extract_logno, clean_ai_title,
    MY_POSTS_JSON,
)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

CSV_IN = "naver_ai_briefing_citations.csv"   # 있으면 키워드→내 글 URL 매핑 보강
RESULT_JS = "verification_result.js"
RESULT_JSON = "verification_result.json"
# 📚 전수 아카이브(누적): 네이버 AI가 가져간 '내 블로그 글'만 모은 자산 대장
ARCHIVE_JS = "ai_collected_my_posts.js"
ARCHIVE_JSON = "ai_collected_my_posts.json"
# 🧮 매칭 요약: 마스터 리스트(전체 발행) 대비 'AI 인용 / 미인용' 분리 결과
MATCH_JSON = "my_posts_match.json"

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


# ── 🎯 마스터 리스트 선행 매칭 (진실의 원천 = my_actual_posts.json) ──
# 원칙: AI 화면에서 긁은 단편이 아니라, '내가 실제 발행한 글 목록'을 기준점으로
#       1:1 대조한다. ① logNo(글 고유번호) 정확 일치  ② 제목 포함관계(축약 …)

def _title_norm(t: str) -> str:
    """포함관계 비교용 제목 정규화: 소문자·공백 제거(축약/띄어쓰기 흔들림 흡수)."""
    return re.sub(r"\s+", "", clean_ai_title(t or "")).lower()


def resolve_to_master(card: dict, master: dict):
    """AI 카드 1개 → 마스터 리스트의 '실제 발행 글'로 해소.

    반환: (master_post|None, matched_by)  matched_by ∈ {"logno","title",""}.
    ① card URL/텍스트에서 logNo 추출 → 마스터 키와 정확 일치(가장 강한 증거)
    ② 실패 시, AI 축약 제목(…)이 마스터 제목에 '포함'되면 채택(고유 1건일 때만).
       동일 부분문자열이 여러 글에 걸리면 오매칭 위험 → 보수적으로 버림.
    """
    if not master:
        return None, ""
    # ① logNo 1:1
    logno = extract_logno(card.get("url", "")) or extract_logno(card.get("title", ""))
    if logno and logno in master:
        return master[logno], "logno"
    # ② 제목 포함관계(축약 대응) — 유일 매칭만 신뢰
    ai_t = _title_norm(card.get("title", ""))
    if len(ai_t) >= 6:                       # 너무 짧은 조각은 오매칭 → 제외
        hits = [p for p in master.values() if ai_t in _title_norm(p.get("title", ""))]
        if len(hits) == 1:
            return hits[0], "title"
    return None, ""


INFLUENCER_LABELS = ["신규 인플루언서 리스트", "신규 인플루언서", "인플루언서 리스트"]


def _influencer_containers(soup):
    """'[신규 인플루언서 리스트]' 라벨이 붙은 '영역'만 골라낸다(없으면 []).

    ⚠️ 핵심: 페이지 전체를 훑으면 일반 검색결과(블로그 탭)의 내 글까지 잡혀
    'AI가 가져갔다'고 오인(허위 양성)한다. 반드시 이 라벨이 실제로 있는
    컨테이너 안에서만 링크를 수집해 환각을 차단한다.
    """
    label_re = re.compile("|".join(map(re.escape, INFLUENCER_LABELS)))
    out, seen = [], set()
    for s in soup.find_all(string=label_re):
        cur = s.parent
        for _ in range(10):                    # 라벨의 조상 중 링크 품은 최소 컨테이너
            if cur is None:
                break
            if cur.find("a", href=True):
                if id(cur) not in seen:
                    seen.add(id(cur)); out.append(cur)
                break
            cur = cur.parent
    return out


def influencer_cards(soup, target_blog: str):
    """하단 '[신규 인플루언서 리스트]' 영역 '안에서만' 내 블로그 링크를 수집.

    그 영역이 페이지에 없으면 빈 리스트(=일반 검색결과는 절대 포함하지 않음).
    """
    out, seen = [], set()
    for box in _influencer_containers(soup):
        for a in box.find_all("a", href=True):
            m = re.search(r"blog\.naver\.com/([A-Za-z0-9_-]+)/(\d{6,})", a["href"])
            if not m or m.group(1).lower() != target_blog:
                continue
            key = m.group(2)
            if key in seen:
                continue
            seen.add(key)
            out.append({
                "blog_id": m.group(1),
                "url": f"https://blog.naver.com/{m.group(1)}/{key}",
                "title": a.get_text(" ", strip=True) or "",
                "date": "",
            })
    return out


def _collect_resolved(soup, target_blog: str, master: dict):
    """이 검색결과에서 '마스터로 해소된 내 글'만 모은다.

    대상 = AI 브리핑 출처 카드 + 하단 신규 인플루언서 리스트.
    반환: [(master_post, card, matched_by)]  (마스터에 없는 글은 버림 = 환각 차단)
    """
    resolved, seen_logno = [], set()
    for card in mine_cards(soup, target_blog) + influencer_cards(soup, target_blog):
        post, by = resolve_to_master(card, master)
        if not post:
            continue
        pid = str(post.get("post_id"))
        if pid in seen_logno:                # 같은 글 중복 제거(섹션 간 겹침)
            continue
        seen_logno.add(pid)
        resolved.append((post, card, by))
    return resolved


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
    """기존 아카이브 + 이번 수집분 → 누적 병합.

    mine_hits = [(keyword, master_post, card, matched_by)]
    제목·URL 은 AI 화면 단편이 아니라 '마스터 리스트(실제 발행 글)'를 진실로 쓴다.
    """
    posts = {k: dict(v) for k, v in prev.items()}
    for kw, mpost, card, matched_by in mine_hits:
        url = mpost.get("url") or card.get("url", "")
        key = archive_key(url)
        rec = posts.get(key)
        if rec is None:
            rec = {
                "post_id": str(mpost.get("post_id") or ""),
                "post_url": url,
                "title": mpost.get("title", "") or card.get("title", "") or "",
                "post_date": mpost.get("date", "") or card.get("date", "") or "",
                "keywords": [],
                "matched_by": [],
                "category": "",
                "first_seen": today,
                "last_seen": today,
                "status": "관리중",
                "cite_count": 0,
            }
            posts[key] = rec
        # 마스터 제목이 더 정확하므로 항상 마스터 값으로 보정
        if mpost.get("post_id"):
            rec["post_id"] = str(mpost["post_id"])
        if mpost.get("title"):
            rec["title"] = mpost["title"]
        if mpost.get("date") and not rec.get("post_date"):
            rec["post_date"] = mpost["date"]
        if kw and kw not in rec["keywords"]:
            rec["keywords"].append(kw)
        if matched_by and matched_by not in rec.get("matched_by", []):
            rec.setdefault("matched_by", []).append(matched_by)
        rec["last_seen"] = today
        rec["cite_count"] = len(rec["keywords"])      # AI 유입 기여도 = 매칭 키워드 수
        rec["category"] = categorize(rec.get("title", ""), rec["keywords"])
    return posts


def save_archive(posts: dict, target: str, total_posts: int | None = None) -> dict:
    """기여도(매칭 키워드 수) 내림차순 정렬 후 json + js(window.ARCHIVE) 저장.

    total_posts = 마스터 리스트의 전체 발행 글 수(있으면 인용/미인용 분리 표시).
    """
    arr = sorted(posts.values(),
                 key=lambda p: (-p.get("cite_count", 0), p.get("first_seen", "")))
    cited = len(arr)
    payload = {
        "target": target,
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "total": cited,
        "total_posts": total_posts,                       # 전체 발행 글 수(기준점)
        "cited": cited,                                    # AI가 가져간 글 수
        "not_cited": (total_posts - cited) if total_posts is not None else None,
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


def save_match_summary(master_index: dict, archive_payload: dict, target: str,
                       master_raw: dict | None = None) -> dict:
    """마스터 리스트(전체 발행) 대비 'AI 인용 / 미인용'을 분리해 저장.

    진실의 원천 = my_actual_posts.json(전체 발행). 그중 이번까지 AI가 가져간
    글의 post_id 집합을 빼서 '아직 인용되지 않은 글'을 명확히 가른다.
    """
    cited_ids = {str(p.get("post_id")) for p in archive_payload.get("posts", [])
                 if p.get("post_id")}
    total = len(master_index)
    cited, not_cited = [], []
    for pid, post in master_index.items():
        slim = {"post_id": pid, "title": post.get("title", ""), "url": post.get("url", "")}
        (cited if pid in cited_ids else not_cited).append(slim)
    payload = {
        "target": target,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "total_posts": total,                          # 전체 발행 글 수
        "cited_count": len(cited),                     # AI가 가져간 글 수
        "not_cited_count": len(not_cited),             # 아직 인용 안 된 글 수
        "cited": cited,
        "not_cited_sample": not_cited[:50],            # 미인용은 표본만(파일 비대화 방지)
        "master_total_count": (master_raw or {}).get("total_count"),
        "master_collected": (master_raw or {}).get("collected"),
    }
    with open(MATCH_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload


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

def run_local(html_src: str, target: str, url_map: dict, master: dict):
    items, mine_hits = [], []
    for path in iter_html(html_src):
        soup = BeautifulSoup(read_html(path), "html.parser")
        kw = extract_keyword(soup, os.path.splitext(os.path.basename(path))[0])
        status, my, others = verify_soup(soup, target, url_map.get(kw))
        items.append(_record(kw, status, my, others, source=os.path.basename(path)))
        # 📚 아카이브 누적용 — 마스터 리스트로 해소된 '실제 발행 글'만
        for mpost, card, by in _collect_resolved(soup, target, master):
            mine_hits.append((kw, mpost, card, by))
    return items, mine_hits


def run_live(keywords: list[str], target: str, url_map: dict, master: dict):
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
        # 📚 아카이브 누적용 — 마스터 리스트로 해소된 '실제 발행 글'만
        for mpost, card, by in _collect_resolved(soup, target, master):
            mine_hits.append((kw, mpost, card, by))
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


def ensure_master(target: str, posts_path: str, do_build: bool, count: int):
    """기준점(마스터 리스트) 확보: 파일이 있으면 로드, --build-posts면 새로 수집.

    반환: (master_index{logNo: post}, master_raw_payload).
    매칭의 진실의 원천이므로, 비어 있으면 강하게 안내한다.
    """
    if do_build:
        print(f"📥 마스터 리스트 수집(Worker) · blogId={target} (최대 {count}개)…")
        built, total = build_my_posts(target, count)
        if built:
            save_my_posts(built, target, total, posts_path)
            print(f"   전체 발행 {total}개 중 {len(built)}개 수집 → {posts_path}")
        else:
            print("   ⚠️ 수집 실패 — 기존 파일이 있으면 그걸로 진행합니다.")
    index, raw = load_my_posts(posts_path)
    if not index:
        print(f"\n[기준점 없음] '{posts_path}' 가 비어 있습니다. 매칭은 마스터 리스트가 전제입니다.")
        print(f"  → 먼저 만들기:  python3 verify_naver_ai.py --target {target} --build-posts\n")
    else:
        tc = (raw or {}).get("total_count")
        print(f"🧭 기준점 로드 · 마스터 {len(index)}개"
              + (f" (블로그 전체 발행 {tc}개)" if tc else ""))
    return index, raw


def main():
    ap = argparse.ArgumentParser(description="네이버 AI 브리핑 인용 교차검증(마스터 리스트 선행 매칭)")
    ap.add_argument("--target", "-t", required=True,
                    help="내 블로그 (blogId / blog.naver.com/ID / URL)")
    ap.add_argument("--html", default="html", help="로컬 검증용 HTML 폴더/파일 (기본 ./html)")
    ap.add_argument("--live", action="store_true", help="Playwright 실시간 검증(설치 필요)")
    ap.add_argument("--keywords", default="", help="라이브 모드 검증 키워드(쉼표 구분)")
    # 🧭 기준점(마스터 리스트) 옵션
    ap.add_argument("--posts", default=MY_POSTS_JSON, help=f"마스터 리스트 경로(기본 {MY_POSTS_JSON})")
    ap.add_argument("--build-posts", action="store_true", help="Worker로 마스터 리스트를 새로 수집")
    ap.add_argument("--posts-count", type=int, default=1000, help="마스터 수집 최대 글 수(기본 1000)")
    args = ap.parse_args()

    target = normalize_target(args.target)
    url_map = load_url_map()

    # ① 기준점 먼저: 내가 실제 발행한 글 목록(진실의 원천)
    master, master_raw = ensure_master(target, args.posts, args.build_posts, args.posts_count)

    if args.live:
        kws = [k.strip() for k in args.keywords.split(",") if k.strip()]
        if not kws:
            kws = list(url_map.keys())
        if not kws:
            sys.exit("[안내] 라이브 모드는 --keywords \"a,b\" 또는 CSV의 키워드가 필요합니다.")
        items, mine_hits = run_live(kws, target, url_map, master)
        source = "live(playwright)"
    else:
        if not iter_html(args.html):
            print(f"[입력 없음] '{args.html}' 에 HTML이 없습니다. 검색결과를 Cmd+S로 저장해 넣으세요.")
            # 입력이 없어도 마스터가 있으면 '전체 발행 vs 인용 0' 요약은 낼 수 있다.
            items, mine_hits = [], []
            source = "local-html(없음)"
        else:
            items, mine_hits = run_local(args.html, target, url_map, master)
            source = "local-html"

    payload = {
        "target": target,
        "source": source,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "items": items,
    }
    save_outputs(payload)
    if items:
        report(payload)

    # ② 전수 아카이브 누적 — 마스터로 해소된 '실제 발행 글'만 대장에 적립
    total_posts = len(master) if master else None
    archive_payload = save_archive(
        merge_archive(load_archive_posts(), mine_hits, date.today().isoformat()),
        target, total_posts,
    )
    archive_report(archive_payload)

    # ③ 매칭 요약 — 전체 발행 대비 'AI 인용 / 미인용' 분리
    if master:
        ms = save_match_summary(master, archive_payload, target, master_raw)
        print("\n" + "─" * 70)
        print(f"  🧮 마스터 매칭 요약 · 전체 발행 {ms['total_posts']}개")
        print(f"     ✅ AI가 가져간 글 {ms['cited_count']}개"
              f"   ·   ⏳ 아직 인용 안 된 글 {ms['not_cited_count']}개")
        print(f"  [저장] {MATCH_JSON}")


if __name__ == "__main__":
    main()
