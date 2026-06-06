#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""my_posts.py — 내 원본 발행 포스팅 '마스터 리스트'(기준점) 확보·로드

매칭 시스템의 진실의 원천(single source of truth).
AI 브리핑 화면에서 긁은 단편 텍스트가 아니라, 내가 '실제로 발행한 글 목록'
(logNo·정확한 전체 제목·원본 URL)을 기준점으로 삼아 1:1 대조한다.

제공 함수
  · build_my_posts(blog_id, count) : Worker 프록시로 내 블로그 글 목록 수집
  · save_my_posts(...)             : my_actual_posts.json 저장
  · load_my_posts(path)            : {logNo(str): {post_id,title,url,...}} 로 로드
  · extract_logno(url_or_text)     : URL/텍스트에서 글 고유번호(logNo) 추출
  · clean_ai_title(text)           : AI 화면 축약 제목(…/...) 정리

CLI
  python3 my_posts.py --blog orangelibrary_ --count 300
"""
from __future__ import annotations

import os
import re
import json
import time
import argparse
import urllib.parse
import urllib.request
from datetime import datetime

WORKER = "https://ninfl-proxy.orange-e65.workers.dev"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
MY_POSTS_JSON = "my_actual_posts.json"
PER = 30   # Worker 는 count>30 이면 오작동 → 30개씩 페이지네이션


# ─────────────────────────── 유틸 ───────────────────────────

def _http_get(url: str, timeout: int = 20) -> str | None:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Accept": "application/json,*/*",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"   (요청 실패: {e})")
        return None


def _decode_title(t: str) -> str:
    t = t or ""
    if "%" in t or "+" in t:
        try:
            return urllib.parse.unquote(t.replace("+", " ")).strip()
        except Exception:
            pass
    return t.strip()


def extract_logno(s: str) -> str:
    """URL/텍스트에서 글 고유번호(logNo) 추출. logNo= / postNo= / .../<숫자> 모두 대응."""
    if not s:
        return ""
    m = re.search(r'(?:log|post)No[=/](\d{6,})', s, re.I)
    if m:
        return m.group(1)
    m = re.search(r'blog\.naver\.com/[A-Za-z0-9_-]+/(\d{6,})', s)
    if m:
        return m.group(1)
    m = re.search(r'/(\d{8,})(?:[/?#]|$)', s)
    return m.group(1) if m else ""


def clean_ai_title(t: str) -> str:
    """AI 화면에서 말줄임표(…/...)로 축약된 제목을 비교용으로 정리."""
    t = (t or "").strip()
    t = re.sub(r'[.…]+$', '', t).strip()          # 끝의 ... 또는 …
    t = re.sub(r'\s+', ' ', t)                          # 공백 정규화
    return t


# ─────────────────────────── 수집/저장/로드 ───────────────────────────

def build_my_posts(blog_id: str, count: int = 300, delay: float = 0.4):
    """Worker 프록시로 내 블로그 글 목록을 누적 수집. (posts: dict, total_count)."""
    posts: dict[str, dict] = {}
    total_count = None
    pages = (count + PER - 1) // PER
    for pg in range(1, pages + 1):
        need = min(PER, count - len(posts))
        if need <= 0:
            break
        url = (f"{WORKER}/blog-posts?blogId={urllib.parse.quote(blog_id)}"
               f"&page={pg}&count={need}")
        raw = _http_get(url)
        if not raw:
            break
        try:
            data = json.loads(raw)
        except Exception:
            break
        tc = data.get("totalCount")
        if tc is not None and str(tc).isdigit():
            total_count = int(tc)
        page_posts = data.get("postList") or []
        if not page_posts:
            break
        new_in_page = 0
        for p in page_posts:
            logno = str(p.get("logNo") or "").strip()
            if not logno or logno in posts:
                continue
            posts[logno] = {
                "post_id": logno,
                "title": _decode_title(p.get("title") or ""),
                "url": f"https://blog.naver.com/{blog_id}/{logno}",
                "category_no": p.get("categoryNo"),
                "date": p.get("addDate") or "",
            }
            new_in_page += 1
        if new_in_page == 0:           # 더 새 글 없음 → 종료
            break
        if len(posts) >= count:
            break
        time.sleep(delay)
    return posts, total_count


def save_my_posts(posts: dict, blog_id: str, total_count, path: str = MY_POSTS_JSON) -> dict:
    payload = {
        "blog_id": blog_id,
        "total_count": total_count,
        "collected": len(posts),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "posts": list(posts.values()),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return payload


def load_my_posts(path: str = MY_POSTS_JSON):
    """my_actual_posts.json → ({logNo(str): post}, raw_payload). 없으면 ({}, None)."""
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            index = {str(p.get("post_id")): p for p in data.get("posts", []) if p.get("post_id")}
            return index, data
        except Exception:
            pass
    return {}, None


# ─────────────────────────── CLI ───────────────────────────

def main():
    ap = argparse.ArgumentParser(description="내 원본 발행 포스팅 마스터 리스트 수집")
    ap.add_argument("--blog", "-b", required=True, help="내 blogId (예: orangelibrary_)")
    ap.add_argument("--count", "-c", type=int, default=300, help="최대 수집 글 수(기본 300)")
    ap.add_argument("--out", default=MY_POSTS_JSON, help=f"저장 경로(기본 {MY_POSTS_JSON})")
    args = ap.parse_args()

    print(f"📥 내 원본 포스팅 마스터 리스트 수집 · blogId={args.blog} (최대 {args.count}개)…")
    posts, total = build_my_posts(args.blog, args.count)
    if not posts:
        raise SystemExit("   글 목록을 가져오지 못했습니다. blogId/네트워크를 확인하세요.")
    payload = save_my_posts(posts, args.blog, total, args.out)
    print(f"   전체 발행 {total}개 중 {payload['collected']}개 수집 → {args.out}")
    for p in payload["posts"][:5]:
        print(f"   · [{p['post_id']}] {p['title'][:42]}")
    if payload["collected"] < (total or 0):
        print(f"   (더 받으려면 --count {min((total or 0), payload['collected']+300)} 등으로 늘리세요)")


if __name__ == "__main__":
    main()
