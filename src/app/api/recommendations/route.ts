import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/recommendations?category=도서
 * 실시간 이슈 키워드: 트렌드 상승 + 검색량 높은 키워드
 */
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get('category') || undefined;
    const supabase = createServiceClient();

    // DB에서 트렌드 상승 중인 키워드 조회
    let query = supabase
      .from('keyword_challenges')
      .select('id, keyword, category, participant_count, search_volume_monthly, trend_direction, trend_percentage')
      .gt('search_volume_monthly', 0)
      .order('trend_percentage', { ascending: false })
      .limit(100);

    if (category) {
      query = query.eq('category', category);
    }

    const { data: keywords } = await query;

    if (!keywords || keywords.length === 0) {
      // DB에 데이터 없으면 빈 배열
      return NextResponse.json({
        recommendations: [],
        category: category || '전체',
        free_count: 0,
        total_count: 0,
      });
    }

    // 이슈 점수: 트렌드 상승률 * 검색량 가중치
    const scored = keywords.map(kw => {
      const trendBonus = kw.trend_direction === 'up' ? 2 : kw.trend_direction === 'stable' ? 1 : 0.3;
      const trendPct = Math.abs(kw.trend_percentage || 0);
      const volumeScore = Math.log10(Math.max(kw.search_volume_monthly || 1, 1));
      const competitionBonus = (kw.participant_count || 1) < 30 ? 1.5 : 1;
      const score = trendPct * trendBonus * volumeScore * competitionBonus;
      return { ...kw, score };
    }).sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 8);

    const recommendations = top.map((kw, i) => {
      const reasons: string[] = [];
      if (kw.trend_direction === 'up' && kw.trend_percentage > 0) {
        reasons.push(`검색량 ${kw.trend_percentage}% 상승`);
      }
      if ((kw.participant_count || 0) < 30) {
        reasons.push(`참여자 ${kw.participant_count}명`);
      }
      if ((kw.search_volume_monthly || 0) > 10000) {
        reasons.push(`월 ${Math.round(kw.search_volume_monthly / 1000)}K 검색`);
      }

      return {
        id: `issue-${kw.id}`,
        keyword_id: kw.id,
        keyword: kw.keyword,
        category: kw.category || '기타',
        participant_count: kw.participant_count || 0,
        search_volume_monthly: kw.search_volume_monthly || 0,
        recommendation_score: Math.round(kw.score * 10) / 10,
        trend_direction: kw.trend_direction || 'stable',
        trend_percentage: kw.trend_percentage || 0,
        rank_in_day: i + 1,
        reason: reasons.length > 0 ? reasons.join(' · ') : '이슈 키워드',
        is_free: true,
      };
    });

    return NextResponse.json({
      recommendations,
      category: category || '전체',
      free_count: recommendations.length,
      total_count: recommendations.length,
    });
  } catch {
    return NextResponse.json(
      { error: '추천 키워드를 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
