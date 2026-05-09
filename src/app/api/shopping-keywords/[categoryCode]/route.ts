import { NextRequest, NextResponse } from 'next/server';
import { findCategoryByCode } from '@/lib/shopping-categories';
import { fetchCategoryKeywordRank, getRecentWindows } from '@/lib/shopping-insight';

export const runtime = 'nodejs';
export const revalidate = 1800; // 30분 캐시

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
