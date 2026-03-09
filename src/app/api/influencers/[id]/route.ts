import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  // UUID 또는 naver_id로 검색
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);

  const { data: influencer } = await supabase
    .from('influencers')
    .select('*')
    .eq(isUuid ? 'id' : 'naver_id', id)
    .single();

  if (!influencer) {
    return NextResponse.json({ error: '인플루언서를 찾을 수 없습니다' }, { status: 404 });
  }

  // 1) influencer_keywords 테이블에서 참여 키워드 조회
  const { data: ikKeywords } = await supabase
    .from('influencer_keywords')
    .select(`
      keyword_id,
      keyword_challenges(id, keyword, category, participant_count, search_volume_monthly)
    `)
    .eq('influencer_id', influencer.id)
    .limit(50);

  // 2) keyword_rankings에서 최근 순위 데이터 (최근 스냅샷 기준)
  const { data: rankings } = await supabase
    .from('keyword_rankings')
    .select(`
      rank_position, rank_change, is_integrated_top3, snapshot_date,
      keyword_id,
      keyword_challenges(id, keyword, category, participant_count, search_volume_monthly)
    `)
    .eq('influencer_id', influencer.id)
    .order('snapshot_date', { ascending: false })
    .limit(100);

  // 3) keyword_rankings에서 키워드 목록 추출 (influencer_keywords가 비어있을 때 fallback)
  let keywordsResult = ikKeywords?.map(k => ({
    keyword_id: k.keyword_id,
    ...k.keyword_challenges,
  })) || [];

  if (keywordsResult.length === 0 && rankings && rankings.length > 0) {
    // keyword_rankings에서 unique keyword 추출
    const seen = new Set<string>();
    keywordsResult = rankings
      .filter(r => {
        if (!r.keyword_id || seen.has(r.keyword_id)) return false;
        seen.add(r.keyword_id);
        return true;
      })
      .map(r => ({
        keyword_id: r.keyword_id,
        ...r.keyword_challenges,
      }));
  }

  // 4) 키워드별 최신 순위 정보 매핑
  const latestRankByKeyword = new Map<string, {
    rank_position: number;
    rank_change: number;
    is_integrated_top3: boolean;
    snapshot_date: string;
  }>();

  rankings?.forEach(r => {
    if (r.keyword_id && !latestRankByKeyword.has(r.keyword_id)) {
      latestRankByKeyword.set(r.keyword_id, {
        rank_position: r.rank_position,
        rank_change: r.rank_change,
        is_integrated_top3: r.is_integrated_top3,
        snapshot_date: r.snapshot_date,
      });
    }
  });

  // 5) 키워드 + 순위 합치기
  const keywordsWithRank = keywordsResult.map(kw => ({
    ...kw,
    ...(latestRankByKeyword.get(kw.keyword_id) || {}),
  }));

  // 6) 순위 히스토리 (최근 7일, snapshot_date별 그룹)
  const rankHistory: Record<string, { keyword: string; rank_position: number; snapshot_date: string }[]> = {};
  rankings?.forEach(r => {
    const kw = r.keyword_challenges;
    const keyword = typeof kw === 'object' && kw !== null && 'keyword' in kw
      ? (kw as { keyword: string }).keyword
      : 'unknown';
    if (!rankHistory[r.snapshot_date]) {
      rankHistory[r.snapshot_date] = [];
    }
    rankHistory[r.snapshot_date].push({
      keyword,
      rank_position: r.rank_position,
      snapshot_date: r.snapshot_date,
    });
  });

  return NextResponse.json({
    influencer: {
      ...influencer,
      keywords: keywordsWithRank,
      recent_rankings: rankings || [],
      rank_history: rankHistory,
    },
  });
}
