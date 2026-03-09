import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchCategories } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

/**
 * 인플루언서 종합 랭킹 API
 *
 * 점수 산정:
 * - 키워드 1위 수 × 10점
 * - TOP 3 수 × 5점
 * - 통합검색 TOP 3 × 3점
 * - 팔로워 수 보너스 (log 스케일)
 * - 참여 키워드 수 × 1점
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const sortBy = searchParams.get('sort') || 'score'; // score, rank1, top3, followers
  const offset = (page - 1) * limit;

  // service client 사용 (RLS 우회 — 공개 데이터)
  const supabase = createServiceClient();

  try {
    // 1. 모든 인플루언서 조회
    let infQuery = supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, my_keyword_category, category, subscriber_count, category_my_type, first_seen_at');

    if (category && category !== '전체') {
      infQuery = infQuery.or(`my_keyword_category.eq.${category},category.eq.${category}`);
    }

    const { data: allInfluencers } = await infQuery;

    if (!allInfluencers || allInfluencers.length === 0) {
      return NextResponse.json({
        rankings: [],
        categories: ['전체'],
        total: 0,
        page,
        total_pages: 0,
      });
    }

    // 2. 최신 순위 데이터 가져오기 (최신 snapshot_date 기준)
    const { data: latestDate } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    const snapshotDate = latestDate?.snapshot_date || new Date().toISOString().slice(0, 10);

    // 3. 해당 날짜의 모든 순위 데이터
    const { data: rankings } = await supabase
      .from('keyword_rankings')
      .select('influencer_id, rank_position, is_integrated_top3, keyword_id')
      .eq('snapshot_date', snapshotDate);

    // 4. 인플루언서별 통계 집계
    const statsMap = new Map<string, {
      rank1Count: number;
      top3Count: number;
      top10Count: number;
      integratedCount: number;
      totalKeywords: number;
      keywordIds: Set<string>;
    }>();

    for (const r of (rankings || [])) {
      let stats = statsMap.get(r.influencer_id);
      if (!stats) {
        stats = { rank1Count: 0, top3Count: 0, top10Count: 0, integratedCount: 0, totalKeywords: 0, keywordIds: new Set() };
        statsMap.set(r.influencer_id, stats);
      }
      stats.totalKeywords++;
      stats.keywordIds.add(r.keyword_id);
      if (r.rank_position === 1) stats.rank1Count++;
      if (r.rank_position <= 3) stats.top3Count++;
      if (r.rank_position <= 10) stats.top10Count++;
      if (r.is_integrated_top3) stats.integratedCount++;
    }

    // 5. 종합 점수 계산 (키워드 챌린지 기반)
    const scoredInfluencers = allInfluencers.map(inf => {
      const stats = statsMap.get(inf.id) || {
        rank1Count: 0, top3Count: 0, top10Count: 0, integratedCount: 0, totalKeywords: 0, keywordIds: new Set()
      };

      const score =
        stats.rank1Count * 10 +
        stats.top3Count * 5 +
        stats.integratedCount * 3 +
        stats.totalKeywords * 1;

      return {
        id: inf.id,
        naverId: inf.naver_id,
        displayName: inf.display_name,
        imageUrl: inf.image_url || '',
        category: inf.my_keyword_category || inf.category || '',
        categoryMyType: inf.category_my_type || '',
        subscriberCount: inf.subscriber_count || 0,
        firstSeenAt: inf.first_seen_at,
        rank1Count: stats.rank1Count,
        top3Count: stats.top3Count,
        top10Count: stats.top10Count,
        integratedCount: stats.integratedCount,
        totalKeywords: stats.totalKeywords,
        score: parseFloat(score.toFixed(1)),
      };
    });

    // 6. 정렬
    switch (sortBy) {
      case 'rank1':
        scoredInfluencers.sort((a, b) => b.rank1Count - a.rank1Count || b.score - a.score);
        break;
      case 'top3':
        scoredInfluencers.sort((a, b) => b.top3Count - a.top3Count || b.score - a.score);
        break;
      case 'keywords':
        scoredInfluencers.sort((a, b) => b.totalKeywords - a.totalKeywords || b.score - a.score);
        break;
      default: // score
        scoredInfluencers.sort((a, b) => b.score - a.score);
    }

    // 7. 순위 부여
    const ranked = scoredInfluencers.map((inf, i) => ({
      ...inf,
      rank: i + 1,
    }));

    const total = ranked.length;
    const totalPages = Math.ceil(total / limit);
    const paged = ranked.slice(offset, offset + limit);

    // 8. 카테고리 목록: 키워드/인플루언서 페이지와 동일한 소스 (네이버 API)
    const apiCategories = await fetchCategories();
    const categories = ['전체', ...apiCategories.map(c => c.name)];

    return NextResponse.json({
      rankings: paged,
      categories,
      total,
      page,
      total_pages: totalPages,
      snapshot_date: snapshotDate,
      sort: sortBy,
    });

  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch rankings' },
      { status: 500 },
    );
  }
}
