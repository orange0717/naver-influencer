import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { checkToolAnonQuota } from '@/lib/anon-quota';

export const dynamic = 'force-dynamic';

// 비회원/미인증 남용 방지 (네이버 검색광고 유료 API + 크롤링 보호)
// search-volume 라우트와 동일한 IP+UA 일일 캡 패턴 적용
const ANON_DAILY_LIMIT = 30;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface ShoppingKeyword {
  keyword: string;
  rank: number;
  category: string;
}

interface ShoppingProduct {
  title: string;
  price: string;
  mall: string;
  link: string;
  image: string;
}

/**
 * 네이버 쇼핑 인기검색어 크롤링
 */
async function fetchShoppingTrends(): Promise<ShoppingKeyword[]> {
  try {
    const res = await fetch('https://datalab.naver.com/shoppingInsight/sCategory.naver', {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);

    const keywords: ShoppingKeyword[] = [];

    // 인기 키워드 목록 추출
    $('.rank_lst li, .keyword_rank li').each((i, el) => {
      const keyword = $(el).find('.title, .keyword').text().trim();
      if (keyword) {
        keywords.push({
          keyword,
          rank: i + 1,
          category: '전체',
        });
      }
    });

    return keywords;
  } catch {
    return [];
  }
}

/**
 * 네이버 쇼핑 키워드 검색 — 쇼핑 탭 결과 가져오기
 */
async function searchShoppingKeyword(keyword: string): Promise<{
  products: ShoppingProduct[];
  totalCount: number;
  relatedKeywords: string[];
}> {
  try {
    const searchUrl = `https://search.naver.com/search.naver?where=nexearch&query=${encodeURIComponent(keyword)}&sm=top_hty&fbm=0`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) return { products: [], totalCount: 0, relatedKeywords: [] };

    const html = await res.text();
    const $ = cheerio.load(html);

    // 쇼핑 관련 제품 추출
    const products: ShoppingProduct[] = [];
    // 통합검색에서 쇼핑 영역
    $('.sp_nshop .product_item, .shopping_list .item').each((i, el) => {
      if (i >= 10) return; // 최대 10개
      const title = $(el).find('.product_title, .tit').text().trim();
      const price = $(el).find('.product_price, .price').text().trim();
      const mall = $(el).find('.product_mall, .mall_name').text().trim();
      const link = $(el).find('a').first().attr('href') || '';
      const image = $(el).find('img').first().attr('src') || '';

      if (title) {
        products.push({ title, price, mall, link, image });
      }
    });

    // 연관 검색어 추출
    const relatedKeywords: string[] = [];
    $('.related_srch .keyword, .lst_related_srch a').each((_, el) => {
      const text = $(el).text().trim();
      if (text) relatedKeywords.push(text);
    });

    return {
      products,
      totalCount: products.length,
      relatedKeywords,
    };
  } catch {
    return { products: [], totalCount: 0, relatedKeywords: [] };
  }
}

/**
 * 네이버 데이터랩 쇼핑인사이트 카테고리별 인기 키워드
 * (API 활용 — 네이버 검색광고 API 키 활용 가능)
 */
async function fetchShoppingKeywordVolume(keyword: string): Promise<{
  monthlySearchVolume: number;
  competitionRate: string;
  shoppingSearchRatio: number;
}> {
  try {
    // 네이버 검색광고 API가 있으면 활용
    const apiKey = process.env.NAVER_API_KEY;
    const secretKey = process.env.NAVER_SECRET_KEY;
    const customerId = process.env.NAVER_CUSTOMER_ID;

    if (!apiKey || !secretKey || !customerId) {
      return { monthlySearchVolume: 0, competitionRate: '정보없음', shoppingSearchRatio: 0 };
    }

    // HMAC-SHA256 서명 생성
    const crypto = await import('crypto');
    const timestamp = Date.now().toString();
    const method = 'GET';
    const path = '/keywordstool';
    const message = `${timestamp}.${method}.${path}`;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(message)
      .digest('base64');

    const url = `https://api.searchad.naver.com${path}?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`;
    const res = await fetch(url, {
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': apiKey,
        'X-Customer': customerId,
        'X-Signature': signature,
      },
    });

    if (!res.ok) {
      return { monthlySearchVolume: 0, competitionRate: '정보없음', shoppingSearchRatio: 0 };
    }

    const data = await res.json();
    const keywordData = data?.keywordList?.find(
      (k: { relKeyword: string }) => k.relKeyword === keyword
    );

    if (!keywordData) {
      return { monthlySearchVolume: 0, competitionRate: '정보없음', shoppingSearchRatio: 0 };
    }

    const pcSearch = Number(keywordData.monthlyPcQcCnt) || 0;
    const mobileSearch = Number(keywordData.monthlyMobileQcCnt) || 0;

    return {
      monthlySearchVolume: pcSearch + mobileSearch,
      competitionRate: keywordData.compIdx || '정보없음',
      shoppingSearchRatio: 0, // 쇼핑 비율은 별도 API 필요
    };
  } catch {
    return { monthlySearchVolume: 0, competitionRate: '정보없음', shoppingSearchRatio: 0 };
  }
}

export async function GET(request: NextRequest) {
  try {
    // 인증 없는 공개 엔드포인트 — IP+UA 일일 캡으로 네이버 API/크롤링 남용 차단
    const quota = await checkToolAnonQuota(request, 'shopping-keywords', ANON_DAILY_LIMIT);
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: `오늘 조회 한도(${ANON_DAILY_LIMIT}회)를 모두 사용했습니다.`,
          limitExceeded: true,
        },
        { status: 429 },
      );
    }

    const { searchParams } = new URL(request.url);
    const keyword = searchParams.get('keyword');
    const action = searchParams.get('action') || 'search';

    if (action === 'trends') {
      // 쇼핑 트렌드 키워드
      const trends = await fetchShoppingTrends();
      return NextResponse.json({ trends });
    }

    if (!keyword) {
      return NextResponse.json(
        { error: 'keyword 파라미터가 필요합니다.' },
        { status: 400 },
      );
    }

    if (action === 'volume') {
      // 키워드 검색량 조회
      const volume = await fetchShoppingKeywordVolume(keyword);
      return NextResponse.json(volume);
    }

    // 기본: 쇼핑 키워드 검색
    const [shoppingResult, volumeData] = await Promise.all([
      searchShoppingKeyword(keyword),
      fetchShoppingKeywordVolume(keyword),
    ]);

    return NextResponse.json({
      keyword,
      ...shoppingResult,
      ...volumeData,
    });
  } catch {
    return NextResponse.json(
      { error: '쇼핑 키워드 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
