/**
 * 네이버 인플루언서 키워드챌린지 실시간 API
 * - 카테고리: GraphQL (in.naver.com)
 * - 키워드 목록: REST API (gw.in.naver.com/keyword-challenge)
 * - 인플루언서 순위: HTML 파싱 (search.naver.com)
 * - 인플루언서 목록: REST API (gw.in.naver.com/feed - discover)
 */
import { fetchWithRetry } from './crawler';

const GRAPHQL_URL = 'https://in.naver.com/graphql';
const REST_API_BASE = 'https://gw.in.naver.com/keyword-challenge/api/v2';
const FEED_API_BASE = 'https://gw.in.naver.com/feed/query/v1';
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
const DEFAULT_PAGE_SIZE = 50;
const MAX_INFLUENCER_PAGES = 2; // 키워드당 최대 페이지 (50명/페이지)
const PARALLEL_BATCH_SIZE = 5; // 병렬 요청 배치 크기

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

export async function fetchKeywordsByCategory(
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

// ─── 인플루언서 목록 (Feed Discover REST API) ───
//
// API: gw.in.naver.com/feed/query/v1/discover/collection/searched
// 키워드 ID별로 참여 인플루언서 50명씩 (최대 100명/키워드) 반환
// 구조화된 JSON: nickname, urlId, subscriberCount, followerCount, category 등

export interface InfluencerEntry {
  name: string;
  naverId: string;
  profileUrl: string;
  imageUrl: string;
  introduction: string;
  subscriberCount: number;
  totalFollowerCount: number;
  myKeywordCategory: string;
  myKeyword: string;
  categoryMyType: string;
  foundInKeywords: string[];
}

/** 키워드 ID로 인플루언서 참여자 가져오기 (최대 100명: 2페이지) */
async function fetchInfluencersByKeywordId(
  keywordId: number,
  keywordName: string,
): Promise<InfluencerEntry[]> {
  const cacheKey = `inf-kw-${keywordId}`;
  const cached = getCached<InfluencerEntry[]>(cacheKey);
  if (cached) return cached;

  const results: InfluencerEntry[] = [];
  const seenIds = new Set<string>();

  let cursor: string | undefined;
  for (let page = 0; page < MAX_INFLUENCER_PAGES; page++) {
    let url = `${FEED_API_BASE}/discover/collection/searched?keywordId=${keywordId}&limit=${DEFAULT_PAGE_SIZE}`;
    if (cursor) url += `&cursor=${cursor}`;

    try {
      const res = await fetchWithRetry(url);
      const json = await res.json();
      const items = json?.data || [];

      for (const item of items) {
        const c = item.creator;
        if (!c?.urlId || seenIds.has(c.urlId)) continue;
        seenIds.add(c.urlId);

        results.push({
          name: c.nickname || '',
          naverId: c.urlId || '',
          profileUrl: `https://in.naver.com/${c.urlId}`,
          imageUrl: c.imageUrl || '',
          introduction: c.introduction || '',
          subscriberCount: c.subscriberCount || 0,
          totalFollowerCount: c.totalFollowerCount || 0,
          myKeywordCategory: c.myKeywordCategory || '',
          myKeyword: c.myKeyword || '',
          categoryMyType: c.categoryMyType || '',
          foundInKeywords: [keywordName],
        });
      }

      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < DEFAULT_PAGE_SIZE) break;
    } catch (err) {
      console.warn(`[naver-api] fetchInfluencersByKeywordId: 키워드 ${keywordId} 페이지 ${page + 1} 실패`, err instanceof Error ? err.message : err);
      break;
    }
  }

  setCache(cacheKey, results);
  return results;
}

/** 카테고리별 인플루언서 수집 (키워드 기반, 서버 사이드 페이지네이션) */
export async function fetchInfluencersForCategory(
  categoryName: string,
  page = 1,
  pageSize = 50,
  keywordsToSearch = 10,
): Promise<{
  influencers: InfluencerEntry[];
  categories: NaverCategory[];
  total: number;
  totalPages: number;
}> {
  const cacheKey = `inf-cat-full-${categoryName}-${keywordsToSearch}`;
  type CachedResult = { allInfluencers: InfluencerEntry[]; categories: NaverCategory[] };
  const cached = getCached<CachedResult>(cacheKey);

  let allInfluencers: InfluencerEntry[];
  let categories: NaverCategory[];

  if (cached) {
    allInfluencers = cached.allInfluencers;
    categories = cached.categories;
  } else {
    categories = await fetchCategories();
    const cat = categories.find(c => c.name === categoryName);
    if (!cat) {
      return { influencers: [], categories, total: 0, totalPages: 0 };
    }

    // 해당 카테고리의 TOP 키워드들 가져오기
    const kwResult = await fetchKeywordsByCategory(cat.id, keywordsToSearch);
    const keywords = kwResult.items;

    // 각 키워드로 인플루언서 수집 (배치 병렬)
    const influencerMap = new Map<string, InfluencerEntry>();

    for (let i = 0; i < keywords.length; i += PARALLEL_BATCH_SIZE) {
      const batch = keywords.slice(i, i + PARALLEL_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(kw => fetchInfluencersByKeywordId(kw.id, kw.name).catch(() => [] as InfluencerEntry[])),
      );

      for (const infList of batchResults) {
        for (const inf of infList) {
          const existing = influencerMap.get(inf.naverId);
          if (existing) {
            for (const kw of inf.foundInKeywords) {
              if (!existing.foundInKeywords.includes(kw)) {
                existing.foundInKeywords.push(kw);
              }
            }
          } else {
            influencerMap.set(inf.naverId, { ...inf });
          }
        }
      }
    }

    allInfluencers = Array.from(influencerMap.values());
    allInfluencers.sort((a, b) => b.subscriberCount - a.subscriberCount);

    setCache(cacheKey, { allInfluencers, categories });
  }

  const total = allInfluencers.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const influencers = allInfluencers.slice(start, start + pageSize);

  return { influencers, categories, total, totalPages };
}

/** 전체 카테고리 인플루언서 요약 (카테고리별 TOP 3 키워드 활용) */
export async function fetchAllInfluencersSummary(
  keywordsPerCategory = 3,
): Promise<{
  influencers: InfluencerEntry[];
  categories: NaverCategory[];
  total: number;
}> {
  const cacheKey = `all-inf-summary-${keywordsPerCategory}`;
  const cached = getCached<{
    influencers: InfluencerEntry[];
    categories: NaverCategory[];
    total: number;
  }>(cacheKey);
  if (cached) return cached;

  const categories = await fetchCategories();
  const influencerMap = new Map<string, InfluencerEntry>();

  // 각 카테고리의 TOP N 키워드로 인플루언서 수집
  await Promise.all(
    categories.map(async (cat) => {
      try {
        const kwResult = await fetchKeywordsByCategory(cat.id, keywordsPerCategory);
        for (const kw of kwResult.items) {
          try {
            const infList = await fetchInfluencersByKeywordId(kw.id, kw.name);
            for (const inf of infList) {
              const existing = influencerMap.get(inf.naverId);
              if (existing) {
                for (const kwName of inf.foundInKeywords) {
                  if (!existing.foundInKeywords.includes(kwName)) {
                    existing.foundInKeywords.push(kwName);
                  }
                }
              } else {
                influencerMap.set(inf.naverId, { ...inf });
              }
            }
          } catch (err) {
            console.warn(`[naver-api] fetchAllInfluencersSummary: 키워드 ${kw.name} 실패`, err instanceof Error ? err.message : err);
          }
        }
      } catch (err) {
        console.warn(`[naver-api] fetchAllInfluencersSummary: 카테고리 ${cat.name} 실패`, err instanceof Error ? err.message : err);
      }
    }),
  );

  const influencers = Array.from(influencerMap.values());
  influencers.sort((a, b) => b.subscriberCount - a.subscriberCount);

  const result = { influencers, categories, total: influencers.length };
  setCache(cacheKey, result);
  return result;
}
