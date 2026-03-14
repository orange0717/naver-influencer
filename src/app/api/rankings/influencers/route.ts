import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchCategories } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

/**
 * 인플루언서 랭킹 API
 *
 * 팩트 데이터 기반 정렬 (자체 점수 산정 없음)
 * - 1위 키워드 수, TOP 3 수, 통합검색 TOP 3 수, 참여 키워드 수, 팬 수
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const sortBy = searchParams.get('sort') || 'rank1';
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  try {
    let infQuery = supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, my_keyword_category, category, subscriber_count, category_my_type, first_seen_at, naver_created_at');

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

    // 최신 순위 데이터
    const { data: latestDate } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    const snapshotDate = latestDate?.snapshot_date || new Date().toISOString().slice(0, 10);

    const { data: rankings } = await supabase
      .from('keyword_rankings')
      .select('influencer_id, rank_position, is_integrated_top3, keyword_id')
      .eq('snapshot_date', snapshotDate);

    // 인플루언서별 통계 집계
    const statsMap = new Map<string, {
      rank1Count: number;
      top3Count: number;
      top10Count: number;
      integratedCount: number;
      totalKeywords: number;
    }>();

    for (const r of (rankings || [])) {
      let stats = statsMap.get(r.influencer_id);
      if (!stats) {
        stats = { rank1Count: 0, top3Count: 0, top10Count: 0, integratedCount: 0, totalKeywords: 0 };
        statsMap.set(r.influencer_id, stats);
      }
      stats.totalKeywords++;
      if (r.rank_position === 1) stats.rank1Count++;
      if (r.rank_position <= 3) stats.top3Count++;
      if (r.rank_position <= 10) stats.top10Count++;
      if (r.is_integrated_top3) stats.integratedCount++;
    }

    // 데이터 조합
    const influencerList = allInfluencers.map(inf => {
      const stats = statsMap.get(inf.id) || {
        rank1Count: 0, top3Count: 0, top10Count: 0, integratedCount: 0, totalKeywords: 0
      };

      return {
        id: inf.id,
        naverId: inf.naver_id,
        displayName: inf.display_name,
        imageUrl: inf.image_url || '',
        category: inf.my_keyword_category || inf.category || '',
        categoryMyType: inf.category_my_type || '',
        subscriberCount: inf.subscriber_count || 0,
        firstSeenAt: inf.naver_created_at || inf.first_seen_at,
        rank1Count: stats.rank1Count,
        top3Count: stats.top3Count,
        top10Count: stats.top10Count,
        integratedCount: stats.integratedCount,
        totalKeywords: stats.totalKeywords,
      };
    });

    // 정렬 (팩트 데이터 기준)
    switch (sortBy) {
      case 'top3':
        influencerList.sort((a, b) => b.top3Count - a.top3Count || b.rank1Count - a.rank1Count || b.totalKeywords - a.totalKeywords);
        break;
      case 'keywords':
        influencerList.sort((a, b) => b.totalKeywords - a.totalKeywords || b.rank1Count - a.rank1Count);
        break;
      case 'fans':
        influencerList.sort((a, b) => b.subscriberCount - a.subscriberCount || b.rank1Count - a.rank1Count);
        break;
      default: // rank1
        influencerList.sort((a, b) => b.rank1Count - a.rank1Count || b.top3Count - a.top3Count || b.totalKeywords - a.totalKeywords);
    }

    // 순위 부여
    const ranked = influencerList.map((inf, i) => ({
      ...inf,
      rank: i + 1,
    }));

    const total = ranked.length;
    const totalPages = Math.ceil(total / limit);
    const paged = ranked.slice(offset, offset + limit);

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
