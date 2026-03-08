import { NextResponse } from 'next/server';
import { fetchAllKeywordsSummary } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 전체 카테고리 키워드에서 참여자 적은 순 = 블루오션 추천
    const result = await fetchAllKeywordsSummary(200);

    const sorted = [...result.keywords]
      .filter(kw => kw.participantCount > 0)
      .sort((a, b) => a.participantCount - b.participantCount);

    const recommendations = sorted.slice(0, 8).map((kw, i) => ({
      id: `rec-${kw.id}`,
      keyword_id: String(kw.id),
      keyword: kw.name,
      category: kw.categoryName || '기타',
      search_volume_monthly: 0,
      recommendation_score: Math.round((9.5 - i * 0.3) * 10) / 10,
      trend_direction: 'stable' as const,
      trend_percentage: 0,
      rank_in_day: i + 1,
      reason: `참여자 ${kw.participantCount}명 — 진입 기회`,
      is_free: true,
    }));

    return NextResponse.json({
      recommendations,
      free_count: recommendations.length,
      total_count: recommendations.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch recommendations' },
      { status: 500 },
    );
  }
}
