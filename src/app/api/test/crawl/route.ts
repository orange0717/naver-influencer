import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/crawler';
import * as cheerio from 'cheerio';

const GRAPHQL_URL = 'https://in.naver.com/graphql';
const REST_API_BASE = 'https://gw.in.naver.com/keyword-challenge/api/v2';
const NAVER_SEARCH_URL = 'https://search.naver.com/search.naver';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 카테고리 테스트 */
async function testCategories() {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, 'Referer': 'https://in.naver.com/' },
    body: JSON.stringify({ query: '{ keywordCategories { id name code keywordCount } }' }),
  });
  const json = await res.json();
  return json?.data?.keywordCategories || [];
}

/** 키워드 목록 테스트 */
async function testKeywords(categoryId: number) {
  const url = `${REST_API_BASE}/categories/${categoryId}/keywords?name=&limit=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://in.naver.com/' },
  });
  return await res.json();
}

/** 인플루언서 순위 파싱 테스트 */
async function testRankings(keyword: string) {
  const url = `${NAVER_SEARCH_URL}?where=influencer&query=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko-KR,ko;q=0.9' },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  const items = $('li.keyword_bx._item');
  const rankings: unknown[] = [];

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

    rankings.push({
      rank: i + 1,
      name,
      naverId: naverIdMatch?.[1] || '',
      fanCount: fanText,
      category: categories.join(' · '),
      postTitle: postTitle || null,
    });
  });

  return { keyword, totalFound: rankings.length, rankings: rankings.slice(0, 5) };
}

/**
 * 크롤링 로직 검증용 테스트 엔드포인트
 * GET /api/test/crawl?type=categories
 * GET /api/test/crawl?type=keywords&categoryId=170711493439264
 * GET /api/test/crawl?type=rankings&keyword=행복명언
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type') || 'categories';

  try {
    switch (type) {
      case 'categories': {
        const categories = await testCategories();
        return NextResponse.json({ success: true, count: categories.length, categories });
      }
      case 'keywords': {
        const categoryId = Number(request.nextUrl.searchParams.get('categoryId') || '170711493439264');
        const data = await testKeywords(categoryId);
        return NextResponse.json({ success: true, data });
      }
      case 'rankings': {
        const keyword = request.nextUrl.searchParams.get('keyword') || '추천도서';
        const data = await testRankings(keyword);
        return NextResponse.json({ success: true, data });
      }
      default:
        return NextResponse.json({ error: 'Unknown type. Use: categories, keywords, rankings' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
