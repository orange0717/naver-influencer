import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchCategories } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

/**
 * 인플루언서 랭킹 API
 *
 * 팩트 데이터 기반 정렬 (자체 점수 산정 없음)
 * - 1위 키워드 수, TOP 3 수, 통합검색 TOP 3 수, 참여 키워드 수, 팬 수
 * - 이전 스냅샷과 비교하여 순위 변동 (rankChange) 계산
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

    // 이전 스냅샷 날짜
    const { data: prevDate } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .lt('snapshot_date', snapshotDate)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    // 이전 스냅샷 데이터
    let prevRankingsData: { influencer_id: string; rank_position: number; is_integrated_top3: boolean }[] | null = null;
    if (prevDate) {
      const { data } = await supabase
        .from('keyword_rankings')
        .select('influencer_id, rank_position, is_integrated_top3')
        .eq('snapshot_date', prevDate.snapshot_date);
      prevRankingsData = data;
    }

    // 통계 집계 함수
    function aggregateStats(data: { influencer_id: string; rank_position: number; is_integrated_top3: boolean }[] | null) {
      const map = new Map<string, {
        rank1Count: number; top3Count: number; top10Count: number;
        integratedCount: number; totalKeywords: number;
      }>();
      for (const r of (data || [])) {
        let s = map.get(r.influencer_id);
        if (!s) { s = { rank1Count: 0, top3Count: 0, top10Count: 0, integratedCount: 0, totalKeywords: 0 }; map.set(r.influencer_id, s); }
        s.totalKeywords++;
        if (r.rank_position === 1) s.rank1Count++;
        if (r.rank_position <= 3) s.top3Count++;
        if (r.rank_position <= 10) s.top10Count++;
        if (r.is_integrated_top3) s.integratedCount++;
      }
      return map;
    }

    // 정렬 함수
    function sortList(list: { rank1Count: number; top3Count: number; totalKeywords: number; subscriberCount: number }[]) {
      switch (sortBy) {
        case 'top3':
          list.sort((a, b) => b.top3Count - a.top3Count || b.rank1Count - a.rank1Count || b.totalKeywords - a.totalKeywords);
          break;
        case 'keywords':
          list.sort((a, b) => b.totalKeywords - a.totalKeywords || b.rank1Count - a.rank1Count);
          break;
        case 'fans':
          list.sort((a, b) => b.subscriberCount - a.subscriberCount || b.rank1Count - a.rank1Count);
          break;
        default:
          list.sort((a, b) => b.rank1Count - a.rank1Count || b.top3Count - a.top3Count || b.totalKeywords - a.totalKeywords);
      }
    }

    const statsMap = aggregateStats(rankings);

    // 현재 리스트 생성
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
        ...stats,
      };
    });

    sortList(influencerList);

    // 이전 순위 계산 (변동 비교용)
    const prevRankMap = new Map<string, number>();
    if (prevRankingsData) {
      const prevStatsMap = aggregateStats(prevRankingsData);
      const prevList = allInfluencers.map(inf => {
        const stats = prevStatsMap.get(inf.id) || {
          rank1Count: 0, top3Count: 0, top10Count: 0, integratedCount: 0, totalKeywords: 0
        };
        return {
          id: inf.id,
          subscriberCount: inf.subscriber_count || 0,
          ...stats,
        };
      });
      sortList(prevList);
      prevList.forEach((inf, i) => prevRankMap.set(inf.id, i + 1));
    }

    // 순위 부여 + 변동 계산
    const ranked = influencerList.map((inf, i) => {
      const currentRank = i + 1;
      const prevRank = prevRankMap.get(inf.id) || 0;
      const rankChange = prevRank > 0 ? prevRank - currentRank : 0;
      const isNew = !prevRank;

      return {
        ...inf,
        rank: currentRank,
        rankChange,
        isNew,
      };
    });

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
