/**
 * 블로그 순위(iblog_rank_*) 독립 시스템 — 수집 · 집계 유틸
 *
 * 공식 순위 기준: "네이버 통합검색"에서 분석 대상 키워드들을 검색했을 때
 * 블로그 콘텐츠가 특정 블로거의 것으로 노출된 횟수(여러 키워드 누적 합산).
 *
 * 수집 방식(하이브리드):
 *   1) 통합검색 HTML(search.naver.com, where 미지정) 파싱을 우선.
 *   2) 통합검색에서 잡힌 블로그 노출이 부족하면 블로그검색 API 상위 N개로 보완.
 *   출처는 결과에 source(integrated|blog_api|hybrid)로 남긴다.
 *
 * 기존 키워드순위(keyword_rankings)·블로그탭(blog_rank_history) 데이터는
 * 일절 재사용하지 않는다.
 */

import * as cheerio from 'cheerio';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchWithRetry, sleep } from './crawler';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

/** 통합검색에서 얻은 블로그 노출 포스팅 수가 이 값 미만이면 블로그검색 API 로 보완 */
const MIN_INTEGRATED_POSTS = 5;
/** 보완 시 블로그검색 API 상위 N개를 "노출"로 간주 */
const BLOG_API_TOP_N = 10;

export type ExposureSource = 'integrated' | 'blog_api' | 'hybrid';

/** 순위 변화 표기: 신규=NEW, 상승=▲n, 하락=▼n, 유지=- */
export function formatRankChange(
  previousRank: number | null,
  rankChange: number | null,
): string {
  if (previousRank === null || rankChange === null) return 'NEW';
  if (rankChange > 0) return `▲${rankChange}`;
  if (rankChange < 0) return `▼${-rankChange}`;
  return '-';
}

export interface BlogExposure {
  exposureCount: number;
  bestPosition: number | null;
  postIds: string[];
  source: ExposureSource;
  blogName?: string;
}

/** blog.naver.com/{blogId}/{postNo} 형태의 포스팅 링크에서 [blogId, postNo] 추출 */
function parseBlogPostLink(href: string): { blogId: string; postNo: string } | null {
  const m = href.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
  if (!m) return null;
  const blogId = m[1].toLowerCase();
  // 블로그 홈/시스템 경로 방어
  if (blogId === 'influencer_search' || blogId === 'postview') return null;
  return { blogId, postNo: m[2] };
}

/**
 * 통합검색 HTML 에서 블로그 콘텐츠 노출을 블로거별로 집계한다.
 * DOM 등장 순서를 노출 위치(1-based)의 근사로 사용한다.
 */
export async function crawlIntegratedBlogExposure(
  keyword: string,
): Promise<Map<string, BlogExposure>> {
  const result = new Map<string, BlogExposure>();
  const seenPosts = new Set<string>();
  let position = 0;

  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}`;

  let html: string;
  try {
    const res = await fetchWithRetry(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Referer: 'https://search.naver.com/',
      },
    });
    html = await res.text();
  } catch (err) {
    console.error(`[iblog-rank] 통합검색 요청 실패 (${keyword}):`, err);
    return result;
  }

  const $ = cheerio.load(html);

  $('a[href*="blog.naver.com"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const parsed = parseBlogPostLink(href);
    if (!parsed) return;

    const postKey = `${parsed.blogId}/${parsed.postNo}`;
    if (seenPosts.has(postKey)) return;
    seenPosts.add(postKey);

    position += 1;
    const existing = result.get(parsed.blogId);
    if (existing) {
      existing.exposureCount += 1;
      existing.postIds.push(postKey);
    } else {
      result.set(parsed.blogId, {
        exposureCount: 1,
        bestPosition: position,
        postIds: [postKey],
        source: 'integrated',
      });
    }
  });

  return result;
}

/**
 * 블로그검색 API(openapi blog.json) 상위 N개로 노출을 블로거별 집계 (보완용).
 * 자격증명이 없으면 빈 결과.
 */
export async function crawlBlogApiExposure(
  keyword: string,
  topN = BLOG_API_TOP_N,
): Promise<Map<string, BlogExposure>> {
  const result = new Map<string, BlogExposure>();
  if (!NAVER_SEARCH_CLIENT_ID || !NAVER_SEARCH_CLIENT_SECRET) return result;

  try {
    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}&display=${topN}&sort=sim`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
      },
    });
    if (!res.ok) {
      console.error(`[iblog-rank] 블로그검색 API 오류 (${keyword}): ${res.status}`);
      return result;
    }

    const data = await res.json();
    const items: Array<{ link?: string; bloggerlink?: string; bloggername?: string }> =
      data.items || [];

    let position = 0;
    const seenPosts = new Set<string>();
    for (const item of items) {
      const link = `${item.link || ''} ${item.bloggerlink || ''}`;
      const parsed = parseBlogPostLink(link);
      if (!parsed) continue;

      const postKey = `${parsed.blogId}/${parsed.postNo}`;
      if (seenPosts.has(postKey)) continue;
      seenPosts.add(postKey);

      position += 1;
      const existing = result.get(parsed.blogId);
      if (existing) {
        existing.exposureCount += 1;
        existing.postIds.push(postKey);
      } else {
        result.set(parsed.blogId, {
          exposureCount: 1,
          bestPosition: position,
          postIds: [postKey],
          source: 'blog_api',
          blogName: item.bloggername || undefined,
        });
      }
    }
  } catch (err) {
    console.error(`[iblog-rank] 블로그검색 API 실패 (${keyword}):`, err);
  }

  return result;
}

/**
 * 하이브리드 수집: 통합검색을 우선하고, 노출이 부족하면 블로그검색 API 로 보완.
 * 동일 (blogId, postNo) 는 중복 집계하지 않는다.
 */
export async function collectKeywordExposure(
  keyword: string,
): Promise<Map<string, BlogExposure>> {
  const integrated = await crawlIntegratedBlogExposure(keyword);

  const totalIntegratedPosts = [...integrated.values()].reduce(
    (sum, e) => sum + e.exposureCount,
    0,
  );

  if (totalIntegratedPosts >= MIN_INTEGRATED_POSTS) {
    return integrated;
  }

  // 보완: 통합검색 노출이 부족 → 블로그검색 API 상위 N 병합
  await sleep(1200);
  const api = await crawlBlogApiExposure(keyword);

  for (const [blogId, apiExp] of api) {
    const base = integrated.get(blogId);
    if (!base) {
      integrated.set(blogId, { ...apiExp, source: 'blog_api' });
      continue;
    }
    // 이미 통합검색에서 잡힌 포스팅은 제외하고 새 포스팅만 합산
    const existingPosts = new Set(base.postIds);
    let added = 0;
    for (const pid of apiExp.postIds) {
      if (existingPosts.has(pid)) continue;
      base.postIds.push(pid);
      added += 1;
    }
    base.exposureCount += added;
    if (added > 0) base.source = 'hybrid';
    if (!base.blogName && apiExp.blogName) base.blogName = apiExp.blogName;
  }

  return integrated;
}

/** supabase 기본 1000행 한도를 넘겨 특정 날짜의 전체 결과를 range 로 모두 로드 */
async function loadAllResults(
  supabase: SupabaseClient,
  snapshotDate: string,
): Promise<Array<{ keyword: string; blog_id: string; exposure_count: number }>> {
  const all: Array<{ keyword: string; blog_id: string; exposure_count: number }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('iblog_rank_results')
      .select('keyword, blog_id, exposure_count')
      .eq('snapshot_date', snapshotDate)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

export interface AggregateSummary {
  snapshotDate: string;
  blogs: number;
  previousDate: string | null;
}

/**
 * 특정 날짜의 iblog_rank_results 를 블로거별로 합산하여 순위를 산정하고,
 * iblog_rank_daily 와 iblog_rank_history 에 저장한다.
 * 직전 스냅샷 대비 순위 변화를 계산한다(신규는 previous_rank=NULL → NEW).
 */
export async function aggregateDailyRanking(
  supabase: SupabaseClient,
  snapshotDate: string,
): Promise<AggregateSummary> {
  const rows = await loadAllResults(supabase, snapshotDate);

  // 블로거별 노출 합산 + 노출 키워드 수 집계
  const agg = new Map<string, { total: number; keywords: Set<string> }>();
  for (const r of rows) {
    const cur = agg.get(r.blog_id) || { total: 0, keywords: new Set<string>() };
    cur.total += r.exposure_count;
    cur.keywords.add(r.keyword);
    agg.set(r.blog_id, cur);
  }

  // 노출량 내림차순 정렬 → 순위 부여 (동점은 blog_id 로 안정 정렬)
  const ranked = [...agg.entries()]
    .map(([blogId, v]) => ({ blogId, total: v.total, keywordCount: v.keywords.size }))
    .sort((a, b) => b.total - a.total || a.blogId.localeCompare(b.blogId));

  // 직전 스냅샷(가장 최근 이전 날짜) 순위 로드
  const { data: prevRow } = await supabase
    .from('iblog_rank_daily')
    .select('snapshot_date')
    .lt('snapshot_date', snapshotDate)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousDate: string | null = prevRow?.snapshot_date ?? null;
  const prevRankMap = new Map<string, number>();
  if (previousDate) {
    const { data: prevDaily } = await supabase
      .from('iblog_rank_daily')
      .select('blog_id, rank')
      .eq('snapshot_date', previousDate);
    for (const p of prevDaily || []) prevRankMap.set(p.blog_id, p.rank);
  }

  const dailyRows = ranked.map((r, idx) => {
    const rank = idx + 1;
    const previousRank = prevRankMap.has(r.blogId) ? prevRankMap.get(r.blogId)! : null;
    const rankChange = previousRank === null ? null : previousRank - rank; // 양수=상승
    return {
      snapshot_date: snapshotDate,
      blog_id: r.blogId,
      total_exposure: r.total,
      keyword_count: r.keywordCount,
      rank,
      previous_rank: previousRank,
      rank_change: rankChange,
    };
  });

  // 배치 upsert (1000행씩)
  for (let i = 0; i < dailyRows.length; i += 1000) {
    const chunk = dailyRows.slice(i, i + 1000);
    const { error: dErr } = await supabase
      .from('iblog_rank_daily')
      .upsert(chunk, { onConflict: 'snapshot_date,blog_id' });
    if (dErr) throw dErr;

    const historyChunk = chunk.map((d) => ({
      blog_id: d.blog_id,
      snapshot_date: d.snapshot_date,
      rank: d.rank,
      total_exposure: d.total_exposure,
      previous_rank: d.previous_rank,
      rank_change: d.rank_change,
    }));
    const { error: hErr } = await supabase
      .from('iblog_rank_history')
      .upsert(historyChunk, { onConflict: 'blog_id,snapshot_date' });
    if (hErr) throw hErr;
  }

  return { snapshotDate, blogs: dailyRows.length, previousDate };
}
