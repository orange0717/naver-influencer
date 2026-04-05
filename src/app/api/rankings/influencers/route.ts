import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchCategories } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

/**
 * 인플루언서 랭킹 API
 *
 * 팩트 데이터 기반 정렬
 * - 1위 키워드 수, TOP 3 수, 유효 키워드 수, 팬 수, N인플 점수
 * - 이전 스냅샷과 비교하여 순위 변동 (rankChange) 계산
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawCategory = searchParams.get('category') || undefined;
  const category = rawCategory?.replace(/[.,()%_'"\\]/g, '') || undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
  const validSorts = ['rank1', 'top3', 'keywords', 'fans', 'score'];
  const sortBy = validSorts.includes(searchParams.get('sort') || '') ? searchParams.get('sort')! : 'rank1';
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  try {
    // 카테고리 목록은 항상 필요
    const apiCategories = await fetchCategories();
    const categories = ['전체', ...apiCategories.map(c => c.name)];

    // 팬수 정렬: DB 레벨에서 직접 정렬 + 페이지네이션
    if (sortBy === 'fans') {
      const orderCol = 'subscriber_count';

      let countQuery = supabase.from('influencers').select('*', { count: 'exact', head: true });
      let dataQuery = supabase.from('influencers').select('*');

      if (category && category !== '전체') {
        const filter = `my_keyword_category.eq.${category},category.eq.${category}`;
        countQuery = countQuery.or(filter);
        dataQuery = dataQuery.or(filter);
      }

      const { count: total } = await countQuery;
      const { data: influencers } = await dataQuery
        .order(orderCol, { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (!influencers || influencers.length === 0) {
        return NextResponse.json({ rankings: [], categories, total: 0, page, total_pages: 0 });
      }

      // 현재 페이지 인플루언서들의 키워드 순위 데이터 조회
      const infIds = influencers.map(i => i.id);

      const { data: latestDate } = await supabase
        .from('keyword_rankings')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

      const snapshotDate = latestDate?.snapshot_date || new Date().toISOString().slice(0, 10);

      const { data: rankings } = await supabase
        .from('keyword_rankings')
        .select('influencer_id, rank_position, is_integrated_top3')
        .eq('snapshot_date', snapshotDate)
        .in('influencer_id', infIds);

      const statsMap = aggregateStats(rankings);

      const ranked = influencers.map((inf, i) => {
        const stats = statsMap.get(inf.id) || emptyStats();
        return {
          id: inf.id,
          naverId: inf.naver_id,
          displayName: inf.display_name,
          imageUrl: inf.image_url || '',
          category: inf.my_keyword_category || inf.category || '',
          categoryMyType: inf.category_my_type || '',
          subscriberCount: inf.subscriber_count || 0,
          ninflScore: Number(inf.ninfl_score) || 0,
          firstSeenAt: inf.naver_created_at || inf.first_seen_at,
          ...stats,
          rank: offset + i + 1,
          rankChange: 0,
          isNew: false,
        };
      });

      const totalCount = total || 0;
      return NextResponse.json({
        rankings: ranked,
        categories,
        total: totalCount,
        page,
        total_pages: Math.ceil(totalCount / limit),
        snapshot_date: snapshotDate,
        sort: sortBy,
      });
    }

    // rank1 / top3 / keywords 정렬: keyword_rankings 기반
    const { data: latestDate } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    const snapshotDate = latestDate?.snapshot_date || new Date().toISOString().slice(0, 10);

    // 현재 스냅샷의 모든 keyword_rankings 가져오기 (기본 1000행 제한 해제)
    const allRankings: { influencer_id: string; rank_position: number; is_integrated_top3: boolean; keyword_id: string }[] = [];
    let rankOffset = 0;
    const rankBatchSize = 1000;
    while (true) {
      const { data: batch } = await supabase
        .from('keyword_rankings')
        .select('influencer_id, rank_position, is_integrated_top3, keyword_id')
        .eq('snapshot_date', snapshotDate)
        .range(rankOffset, rankOffset + rankBatchSize - 1);
      if (!batch || batch.length === 0) break;
      allRankings.push(...batch);
      if (batch.length < rankBatchSize) break;
      rankOffset += rankBatchSize;
    }
    const rankings = allRankings;

    if (!rankings || rankings.length === 0) {
      return NextResponse.json({ rankings: [], categories, total: 0, page, total_pages: 0, snapshot_date: snapshotDate, sort: sortBy });
    }

    // 통계 집계
    const statsMap = aggregateStats(rankings);

    // 고유 인플루언서 ID 추출
    const uniqueIds = [...statsMap.keys()];

    // 인플루언서 상세 정보 조회 (배치)
    const infMap = new Map<string, Record<string, unknown>>();
    const batchSize = 500;
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize);
      let q = supabase
        .from('influencers')
        .select('*')
        .in('id', batch);

      if (category && category !== '전체') {
        q = q.or(`my_keyword_category.eq.${category},category.eq.${category}`);
      }

      const { data: infs } = await q;
      for (const inf of (infs || [])) {
        infMap.set(inf.id, inf);
      }
    }

    // 리스트 생성 (인플루언서 정보 있는 것만)
    const influencerList = uniqueIds
      .filter(id => infMap.has(id))
      .map(id => {
        const inf = infMap.get(id)!;
        const stats = statsMap.get(id) || emptyStats();
        return {
          id: inf.id as string,
          naverId: inf.naver_id as string,
          displayName: inf.display_name as string,
          imageUrl: (inf.image_url as string) || '',
          category: (inf.my_keyword_category as string) || (inf.category as string) || '',
          categoryMyType: (inf.category_my_type as string) || '',
          subscriberCount: (inf.subscriber_count as number) || 0,
          ninflScore: Number(inf.ninfl_score) || 0,
          firstSeenAt: (inf.naver_created_at || inf.first_seen_at) as string,
          ...stats,
        };
      });

    // 정렬
    sortList(influencerList, sortBy);

    // 이전 스냅샷으로 순위 변동 계산
    const prevRankMap = new Map<string, number>();
    const { data: prevDate } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .lt('snapshot_date', snapshotDate)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (prevDate) {
      const { data: prevRankings } = await supabase
        .from('keyword_rankings')
        .select('influencer_id, rank_position, is_integrated_top3')
        .eq('snapshot_date', prevDate.snapshot_date);

      if (prevRankings) {
        const prevStatsMap = aggregateStats(prevRankings);
        const prevList = [...prevStatsMap.entries()]
          .filter(([id]) => infMap.has(id))
          .map(([id, stats]) => {
            const inf = infMap.get(id)!;
            return {
              id,
              subscriberCount: (inf.subscriber_count as number) || 0,
              ninflScore: Number(inf.ninfl_score) || 0,
              ...stats,
            };
          });
        sortList(prevList, sortBy);
        prevList.forEach((inf, i) => prevRankMap.set(inf.id, i + 1));
      }
    }

    // 순위 부여 + 변동 계산 + 페이지네이션
    const total = influencerList.length;
    const totalPages = Math.ceil(total / limit);
    const paged = influencerList.slice(offset, offset + limit).map((inf, i) => {
      const currentRank = offset + i + 1;
      const prevRank = prevRankMap.get(inf.id) || 0;
      const rankChange = prevRank > 0 ? prevRank - currentRank : 0;
      const isNew = !prevRank;
      return { ...inf, rank: currentRank, rankChange, isNew };
    });

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
    console.error('[rankings/influencers]', err);
    return NextResponse.json(
      { error: '랭킹 데이터를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

function emptyStats() {
  return { rank1Count: 0, top3Count: 0, top10Count: 0, integratedCount: 0, totalKeywords: 0 };
}

function aggregateStats(data: { influencer_id: string; rank_position: number; is_integrated_top3: boolean }[] | null) {
  const map = new Map<string, {
    rank1Count: number; top3Count: number; top10Count: number;
    integratedCount: number; totalKeywords: number;
  }>();
  for (const r of (data || [])) {
    let s = map.get(r.influencer_id);
    if (!s) { s = emptyStats(); map.set(r.influencer_id, s); }
    s.totalKeywords++;
    if (r.rank_position === 1) s.rank1Count++;
    if (r.rank_position <= 3) s.top3Count++;
    if (r.rank_position <= 10) s.top10Count++;
    if (r.is_integrated_top3) s.integratedCount++;
  }
  return map;
}

function sortList(list: { rank1Count: number; top3Count: number; totalKeywords: number; subscriberCount: number; ninflScore: number }[], sortBy: string) {
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
    case 'score':
      list.sort((a, b) => b.ninflScore - a.ninflScore || b.rank1Count - a.rank1Count || b.top3Count - a.top3Count);
      break;
    default:
      list.sort((a, b) => b.rank1Count - a.rank1Count || b.top3Count - a.top3Count || b.totalKeywords - a.totalKeywords);
  }
}
