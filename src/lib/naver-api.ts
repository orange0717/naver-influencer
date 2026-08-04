/**
 * 네이버 인플루언서 키워드챌린지 실시간 API
 * - 카테고리: GraphQL (in.naver.com)
 * - 키워드 목록: REST API (gw.in.naver.com/keyword-challenge)
 * - 인플루언서 순위: HTML 파싱 (search.naver.com)
 */
import { fetchWithRetry } from './crawler';

const GRAPHQL_URL = 'https://in.naver.com/graphql';
const REST_API_BASE = 'https://gw.in.naver.com/keyword-challenge/api/v2';
const NAVER_SEARCH_URL = 'https://search.naver.com/search.naver';

// ─── 타입 ───

export interface NaverCategory {
  id: number;
  name: string;
  code: string;
  keywordCount: number;
}

export interface NaverKeyword {
  id: number;
  name: string;
  categoryId: number;
  categoryName: string;
  participantCount: number;
  thumbnailUrl?: string;
}

export interface NaverRanking {
  rank: number;
  name: string;
  naverId: string;
  profileUrl: string;
  fanCount: string;
  category: string;
  postTitle: string | null;
  postUrl: string | null;
}

// ─── 설정 상수 ───

const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const MAX_CACHE_SIZE = 500; // 캐시 엔트리 최대 개수

// ─── 캐시 (서버 메모리, 최대 크기 제한) ───

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // LRU: 접근 시 Map 끝으로 이동
  cache.delete(key);
  cache.set(key, entry);
  return entry.data as T;
}

let lastCacheCleanup = 0;

function setCache<T>(key: string, data: T): void {
  const now = Date.now();

  // 1분마다 만료 엔트리 일괄 정리
  if (now - lastCacheCleanup > 60_000) {
    lastCacheCleanup = now;
    for (const [k, entry] of cache) {
      if (now - entry.timestamp > CACHE_TTL_MS) cache.delete(k);
    }
  }

  // LRU: 초과 시 가장 오래 접근되지 않은 엔트리(Map 첫 번째) 제거
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, timestamp: now });
}

// ─── 카테고리 ───

export async function fetchCategories(): Promise<NaverCategory[]> {
  const cacheKey = 'categories';
  const cached = getCached<NaverCategory[]>(cacheKey);
  if (cached) return cached;

  const res = await fetchWithRetry(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ keywordCategories { id name code keywordCount } }' }),
  });

  const json = await res.json();
  const categories: NaverCategory[] = json?.data?.keywordCategories || [];
  setCache(cacheKey, categories);
  return categories;
}

// ─── 키워드 목록 (단일 카테고리, 커서 기반) ───

async function fetchKeywordsByCategory(
  categoryId: number,
  limit = 50,
  cursor?: string,
  searchName?: string,
): Promise<{ items: NaverKeyword[]; nextCursor: string | null; total: number }> {
  const params = new URLSearchParams({ name: searchName || '', limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const cacheKey = `cat-kw-${categoryId}-${limit}-${cursor || 'start'}-${searchName || ''}`;
  const cached = getCached<{ items: NaverKeyword[]; nextCursor: string | null; total: number }>(cacheKey);
  if (cached) return cached;

  const url = `${REST_API_BASE}/categories/${categoryId}/keywords?${params}`;
  const res = await fetchWithRetry(url);
  const json = await res.json();

  const result = {
    items: json?.data || [],
    nextCursor: json?.paging?.nextCursor ?? null,
    total: json?.paging?.total ?? 0,
  };
  setCache(cacheKey, result);
  return result;
}

// ─── 단일 카테고리 페이지 가져오기 (커서 기반) ───

export async function fetchCategoryPage(
  categoryName: string,
  limit: number = 50,
  cursor?: string,
  searchName?: string,
): Promise<{
  keywords: NaverKeyword[];
  total: number;
  nextCursor: string | null;
  categories: NaverCategory[];
}> {
  const categories = await fetchCategories();
  const cat = categories.find(c => c.name === categoryName);

  if (!cat) {
    return { keywords: [], total: 0, nextCursor: null, categories };
  }

  const result = await fetchKeywordsByCategory(cat.id, limit, cursor, searchName);

  const keywords = result.items.map(kw => ({
    ...kw,
    categoryName: cat.name,
    categoryId: cat.id,
  }));

  return {
    keywords,
    total: result.total,
    nextCursor: result.nextCursor,
    categories,
  };
}

// ─── 전체 카테고리 통합 (대시보드용, 제한적) ───

export async function fetchAllKeywordsSummary(
  limit = 200,
): Promise<{
  keywords: NaverKeyword[];
  categories: NaverCategory[];
  totalAll: number;
}> {
  const cacheKey = `all-summary-${limit}`;
  const cached = getCached<{
    keywords: NaverKeyword[];
    categories: NaverCategory[];
    totalAll: number;
  }>(cacheKey);
  if (cached) return cached;

  const categories = await fetchCategories();
  const allKeywords: NaverKeyword[] = [];
  const totalAll = categories.reduce((sum, c) => sum + c.keywordCount, 0);

  await Promise.all(
    categories.map(async (cat) => {
      try {
        const result = await fetchKeywordsByCategory(cat.id, limit);
        const enriched = result.items.map(kw => ({
          ...kw,
          categoryName: cat.name,
          categoryId: cat.id,
        }));
        allKeywords.push(...enriched);
      } catch (err) {
        console.warn(`[naver-api] fetchAllKeywordsSummary: 카테고리 ${cat.name} 실패`, err instanceof Error ? err.message : err);
      }
    }),
  );

  allKeywords.sort((a, b) => b.participantCount - a.participantCount);

  const result = { keywords: allKeywords, categories, totalAll };
  setCache(cacheKey, result);
  return result;
}

// ─── 키워드 검색 (전체 카테고리) ───

export async function searchKeywordsAcrossCategories(
  query: string,
  limit = 50,
): Promise<{
  keywords: NaverKeyword[];
  categories: NaverCategory[];
  total: number;
}> {
  const cacheKey = `search-${query}-${limit}`;
  const cached = getCached<{
    keywords: NaverKeyword[];
    categories: NaverCategory[];
    total: number;
  }>(cacheKey);
  if (cached) return cached;

  const categories = await fetchCategories();
  const allResults: NaverKeyword[] = [];

  // 모든 카테고리에서 검색어로 검색
  await Promise.all(
    categories.map(async (cat) => {
      try {
        const result = await fetchKeywordsByCategory(cat.id, 50, undefined, query);
        const enriched = result.items.map(kw => ({
          ...kw,
          categoryName: cat.name,
          categoryId: cat.id,
        }));
        allResults.push(...enriched);
      } catch (err) {
        console.warn(`[naver-api] searchKeywords: 카테고리 ${cat.name} 검색 실패`, err instanceof Error ? err.message : err);
      }
    }),
  );

  allResults.sort((a, b) => b.participantCount - a.participantCount);

  const result = { keywords: allResults.slice(0, limit), categories, total: allResults.length };
  setCache(cacheKey, result);
  return result;
}

// ─── 단일 키워드 찾기 (ID로) ───

export async function findKeywordById(
  keywordId: string,
): Promise<{ keyword: NaverKeyword; categoryName: string } | null> {
  const cacheKey = `kw-by-id-${keywordId}`;
  const cached = getCached<{ keyword: NaverKeyword; categoryName: string }>(cacheKey);
  if (cached) return cached;

  const categories = await fetchCategories();

  // 각 카테고리에서 해당 ID의 키워드 검색
  for (const cat of categories) {
    try {
      // 키워드 ID가 특정 카테고리에 속하는지 확인
      // REST API로 직접 조회하는 방법이 없으므로, 각 카테고리에서 검색
      const result = await fetchKeywordsByCategory(cat.id, 200);
      const found = result.items.find(kw => String(kw.id) === keywordId);
      if (found) {
        const kw = { ...found, categoryName: cat.name, categoryId: cat.id };
        const entry = { keyword: kw, categoryName: cat.name };
        setCache(cacheKey, entry);
        return entry;
      }
    } catch (err) {
      console.warn(`[naver-api] findKeywordById: 카테고리 ${cat.name} 조회 실패`, err instanceof Error ? err.message : err);
    }
  }

  return null;
}

// ─── 인플루언서 순위 (HTML 파싱) ───

export async function fetchRankings(keyword: string): Promise<NaverRanking[]> {
  const cacheKey = `rankings-${keyword}`;
  const cached = getCached<NaverRanking[]>(cacheKey);
  if (cached) return cached;

  const url = `${NAVER_SEARCH_URL}?where=influencer&query=${encodeURIComponent(keyword)}`;
  const res = await fetchWithRetry(url);
  const html = await res.text();
  const cheerio = await import('cheerio');
  const $ = cheerio.load(html);

  const rankings: NaverRanking[] = [];
  const items = $('li.keyword_bx._item');

  if (items.length === 0) {
    const isBlocked = /captcha|차단|비정상적인|blocked|access.*denied/i.test(html);
    console.warn(
      `[fetchRankings] 0건: keyword="${keyword}", status=${res.status}, htmlLen=${html.length}, blocked=${isBlocked}`,
    );
  }

  items.each((i, el) => {
    const $el = $(el);
    const name = $el.find('.name.elss .txt').first().text().trim();
    if (!name) return;

    const profileLink = $el.find('a[href*="in.naver.com"]').first().attr('href') || '';
    const naverIdMatch = profileLink.match(/in\.naver\.com\/([^/?#]+)/);
    const fanText = $el.find('._fan_count').text().trim();
    const categories: string[] = [];
    $el.find('.etc_area .etc').each((_, etcEl) => {
      const t = $(etcEl).text().trim();
      if (t) categories.push(t);
    });
    const postTitle = $el.find('.elss.tit').text().trim();
    const postLink = $el.find('a.title_link, a[href*="blog.naver.com"], a[href*="post.naver.com"], .detail_area a').first().attr('href') || '';

    rankings.push({
      rank: i + 1,
      name,
      naverId: naverIdMatch?.[1] || '',
      profileUrl: profileLink.split('?')[0],
      fanCount: fanText,
      category: categories.join(' · '),
      postTitle: postTitle || null,
      postUrl: postLink || null,
    });
  });

  setCache(cacheKey, rankings);
  return rankings;
}

