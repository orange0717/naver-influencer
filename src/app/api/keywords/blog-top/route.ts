import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { requireFeature } from '@/lib/guards/requireFeature';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const NAVER_SEARCH_CLIENT_ID = process.env.NAVER_SEARCH_CLIENT_ID || '';
const NAVER_SEARCH_CLIENT_SECRET = process.env.NAVER_SEARCH_CLIENT_SECRET || '';

// 캐시 (5분)
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

interface BlogResult {
  rank: number;
  blogName: string;
  blogId: string;
  postId: string;
  title: string;
  snippet: string;
  date: string;
  url: string;
}

const FETCH_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  'Referer': 'https://search.naver.com/',
};

/**
 * 네이버 블로그 검색 API로 제목/블로그명 조회
 */
async function fetchBlogApiResults(query: string, count: number): Promise<Map<string, { title: string; blogName: string; snippet: string; date: string }>> {
  const map = new Map<string, { title: string; blogName: string; snippet: string; date: string }>();
  if (!NAVER_SEARCH_CLIENT_ID) return map;

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=${Math.min(count, 100)}&sort=sim`,
      {
        headers: {
          'X-Naver-Client-Id': NAVER_SEARCH_CLIENT_ID,
          'X-Naver-Client-Secret': NAVER_SEARCH_CLIENT_SECRET,
        },
      }
    );
    if (!res.ok) return map;
    const data = await res.json();

    for (const item of data.items || []) {
      const link = item.link || '';
      const m = link.match(/blog\.naver\.com\/([a-zA-Z0-9_.-]+)\/(\d+)/);
      if (!m) continue;
      const key = `${m[1]}/${m[2]}`;
      const title = (item.title || '').replace(/<[^>]+>/g, '');
      const blogName = (item.bloggername || '').replace(/<[^>]+>/g, '');
      const snippet = (item.description || '').replace(/<[^>]+>/g, '').slice(0, 150);
      const date = item.postdate ? `${item.postdate.slice(0, 4)}.${item.postdate.slice(4, 6)}.${item.postdate.slice(6, 8)}.` : '';
      map.set(key, { title, blogName, snippet, date });
    }
  } catch { /* ignore */ }

  return map;
}

/**
 * HTML에서 블로그 순위 + 메타 정보 추출 (공통 로직)
 */
function extractRanksFromHtml(html: string, seen: Set<string>): BlogResult[] {
  const results: BlogResult[] = [];

  // 1순위: data-cr-on 속성에서 공식 순위 추출
  const rankRegex = /data-url="(https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_.-]+)\/(\d+))"[^>]*data-cr-on="r=(\d+)/g;
  let match;

  while ((match = rankRegex.exec(html)) !== null) {
    const [, postUrl, blogId, postId, rankStr] = match;
    const key = `${blogId}/${postId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      rank: parseInt(rankStr),
      blogName: '',
      blogId,
      postId,
      title: '',
      snippet: '',
      date: '',
      url: postUrl,
    });
  }

  // 2순위 폴백: a 태그에서 수동 카운트
  if (results.length === 0) {
    const $ = cheerio.load(html);
    let globalRank = 0;
    const seenFb = new Set<string>();

    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/blog\.naver\.com\/([a-zA-Z0-9_.-]+)\/(\d+)/);
      if (!m) return;
      const key = `${m[1]}/${m[2]}`;
      if (seenFb.has(key) || seen.has(key)) return;
      seenFb.add(key);
      seen.add(key);
      globalRank++;

      results.push({
        rank: globalRank,
        blogName: '',
        blogId: m[1],
        postId: m[2],
        title: '',
        snippet: '',
        date: '',
        url: href,
      });
    });
  }

  return results;
}

/**
 * 네이버 블로그탭 검색
 */
async function crawlBlogTab(query: string, count: number): Promise<BlogResult[]> {
  const results: BlogResult[] = [];
  const seen = new Set<string>();
  const pages = Math.ceil(count / 10);

  for (let page = 1; page <= pages; page++) {
    const start = (page - 1) * 10 + 1;
    const url = page === 1
      ? `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(query)}`
      : `https://search.naver.com/search.naver?ssc=tab.blog.all&sm=tab_jum&query=${encodeURIComponent(query)}&start=${start}`;

    try {
      const res = await fetch(url, { headers: FETCH_HEADERS });
      if (!res.ok) continue;
      const html = await res.text();
      results.push(...extractRanksFromHtml(html, seen));
    } catch { continue; }

    if (page < pages) await new Promise(r => setTimeout(r, 500));
  }

  return results.sort((a, b) => a.rank - b.rank).slice(0, count);
}

/**
 * 네이버 통합검색(VIEW탭) 검색
 */
async function crawlViewTab(query: string, count: number): Promise<BlogResult[]> {
  const results: BlogResult[] = [];
  const seen = new Set<string>();
  const pages = Math.ceil(count / 10);

  for (let page = 1; page <= pages; page++) {
    const start = (page - 1) * 10 + 1;
    const url = page === 1
      ? `https://search.naver.com/search.naver?ssc=tab.view.all&sm=tab_jum&query=${encodeURIComponent(query)}`
      : `https://search.naver.com/search.naver?ssc=tab.view.all&sm=tab_jum&query=${encodeURIComponent(query)}&start=${start}`;

    try {
      const res = await fetch(url, { headers: FETCH_HEADERS });
      if (!res.ok) continue;
      const html = await res.text();
      results.push(...extractRanksFromHtml(html, seen));
    } catch { continue; }

    if (page < pages) await new Promise(r => setTimeout(r, 500));
  }

  return results.sort((a, b) => a.rank - b.rank).slice(0, count);
}

/**
 * 네이버 인플루언서탭 검색
 */
async function crawlInfluencerTab(query: string, count: number): Promise<BlogResult[]> {
  const results: BlogResult[] = [];
  const seen = new Set<string>();

  const url = `https://search.naver.com/search.naver?ssc=tab.influencer.all&sm=tab_jum&query=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) return results;
    const html = await res.text();
    results.push(...extractRanksFromHtml(html, seen));
  } catch { /* ignore */ }

  return results.sort((a, b) => a.rank - b.rank).slice(0, count);
}

export async function GET(request: NextRequest) {
  try {
    // 미들웨어는 로그인만 확인해서 무료 회원이 그대로 받아 갔다(외부 검색 API 비용도 함께 샜다).
    const guard = await requireFeature(request, 'keywords.blog-ranking');
    if (guard.error) return guard.error;

    const ip = getClientIp(request);
    if (await blogAnalyzeLimiter.check(ip)) return rateLimitResponse();

    const keyword = request.nextUrl.searchParams.get('keyword');
    if (!keyword || keyword.trim().length < 1) {
      return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
    }

    const count = Math.min(parseInt(request.nextUrl.searchParams.get('count') || '30'), 50);
    const tab = request.nextUrl.searchParams.get('tab') || 'blog'; // blog | view | influencer

    // 캐시 확인
    const cacheKey = `blog-top-${tab}-${keyword.trim()}-${count}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(cached.data);
    }

    // 탭별 크롤링
    let results: BlogResult[];
    switch (tab) {
      case 'view':
        results = await crawlViewTab(keyword.trim(), count);
        break;
      case 'influencer':
        results = await crawlInfluencerTab(keyword.trim(), count);
        break;
      default:
        results = await crawlBlogTab(keyword.trim(), count);
    }

    // 블로그 검색 API로 제목/블로그명 보완
    const apiData = await fetchBlogApiResults(keyword.trim(), count);
    for (const r of results) {
      const key = `${r.blogId}/${r.postId}`;
      const info = apiData.get(key);
      if (info) {
        r.title = info.title;
        r.blogName = info.blogName;
        r.snippet = info.snippet;
        r.date = info.date;
      }
    }

    const data = { keyword: keyword.trim(), tab, results, total: results.length };

    // 캐시 저장
    if (cache.size > 200) {
      const now = Date.now();
      for (const [k, v] of cache) { if (v.expires < now) cache.delete(k); }
    }
    cache.set(cacheKey, { data, expires: Date.now() + CACHE_TTL });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: '검색 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
