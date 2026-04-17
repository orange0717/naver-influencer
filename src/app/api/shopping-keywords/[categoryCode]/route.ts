import { NextRequest, NextResponse } from 'next/server';
import { findCategoryByCode } from '@/lib/shopping-categories';

export const runtime = 'nodejs';
export const revalidate = 1800; // 30분 캐시

const RANK_URL = 'https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver';
const REFERER = 'https://datalab.naver.com/shoppingInsight/sCategory.naver';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface RankItem {
  rank: number;
  keyword: string;
  linkId?: string;
}

/**
 * 네이버 쇼핑인사이트 카테고리별 인기검색어 랭크
 * 해당 엔드포인트는 공식 Open API에 없으므로 데이터랩 웹 내부 엔드포인트 이용
 */
async function fetchCategoryKeywordRank(
  cid: string,
  startDate: string,
  endDate: string,
  count = 20,
): Promise<RankItem[]> {
  const form = new URLSearchParams({
    cid,
    timeUnit: 'date',
    startDate,
    endDate,
    age: '',
    gender: '',
    device: '',
    page: '1',
    count: String(count),
  });

  const res = await fetch(RANK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': REFERER,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, text/plain, */*',
    },
    body: form.toString(),
  });

  if (!res.ok) {
    console.error(`[shopping-keywords] rank fetch ${res.status}`);
    return [];
  }

  const data = await res.json().catch(() => null);
  const ranks = data?.ranks;
  if (!Array.isArray(ranks)) return [];

  return ranks.map((r: { rank: number; keyword: string; linkId?: string }) => ({
    rank: r.rank,
    keyword: r.keyword,
    linkId: r.linkId,
  }));
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ categoryCode: string }> },
) {
  const { categoryCode } = await params;
  const category = findCategoryByCode(categoryCode);

  if (!category) {
    return NextResponse.json({ error: '지원하지 않는 카테고리입니다.' }, { status: 404 });
  }

  // 쇼핑인사이트는 전일 데이터가 최신 → 어제를 endDate로
  const today = new Date();
  const end = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  const endDate = end.toISOString().slice(0, 10);
  const startDate = start.toISOString().slice(0, 10);

  // 이전 주 랭크 (순위 변동 계산용)
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
  const prevEndDate = prevEnd.toISOString().slice(0, 10);
  const prevStartDate = prevStart.toISOString().slice(0, 10);

  try {
    const [current, previous] = await Promise.all([
      fetchCategoryKeywordRank(categoryCode, startDate, endDate, 20),
      fetchCategoryKeywordRank(categoryCode, prevStartDate, prevEndDate, 100),
    ]);

    const prevMap = new Map(previous.map(p => [p.keyword, p.rank]));

    const keywords = current.map(k => {
      const prevRank = prevMap.get(k.keyword);
      let change: 'new' | 'up' | 'down' | 'same';
      let changeAmount = 0;

      if (prevRank === undefined) {
        change = 'new';
      } else if (prevRank > k.rank) {
        change = 'up';
        changeAmount = prevRank - k.rank;
      } else if (prevRank < k.rank) {
        change = 'down';
        changeAmount = k.rank - prevRank;
      } else {
        change = 'same';
      }

      return {
        rank: k.rank,
        keyword: k.keyword,
        change,
        changeAmount,
      };
    });

    return NextResponse.json({
      category: { name: category.name, code: category.code },
      period: { startDate, endDate },
      keywords,
    });
  } catch (err) {
    console.error('[shopping-keywords] fatal:', err);
    return NextResponse.json(
      { error: '쇼핑인사이트 키워드 조회 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
