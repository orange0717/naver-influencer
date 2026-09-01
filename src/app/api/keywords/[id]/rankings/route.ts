import { NextRequest, NextResponse } from 'next/server';
import { findKeywordById, fetchRankings } from '@/lib/naver-api';
import { createServiceClient } from '@/lib/supabase-server';
import { requireFeature } from '@/lib/guards/requireFeature';

export const dynamic = 'force-dynamic';
// 네이버 search.naver.com HTML 스크래핑 시 해외 데이터센터 IP 차단 회피 — 서울 리전 고정
export const preferredRegion = 'icn1';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireFeature(request, 'keywords.challenge');
  if (gate.error) return gate.error;

  const { id } = await params;

  try {
    const found = await findKeywordById(id);

    if (!found) {
      return NextResponse.json({ error: '키워드를 찾을 수 없습니다' }, { status: 404 });
    }

    // 네이버 검색에서 실시간 순위 가져오기
    const naverRankings = await fetchRankings(found.keyword.name);

    if (naverRankings.length === 0) {
      console.warn(
        `[rankings] 빈 결과: keywordId=${id}, name="${found.keyword.name}"`,
      );
    }

    // DB에서 키챌 rank_change 조회 (naver_id 매칭)
    // naver search 순위와 별개로, 키워드챌린지 순위 변동을 표시하기 위함
    const rankChangeByNaverId = new Map<string, number>();
    const naverIds = naverRankings.map(r => r.naverId).filter(Boolean);
    if (naverIds.length > 0) {
      const supabase = createServiceClient();

      // id는 네이버 키워드 ID이므로, DB의 keyword_challenges.id(UUID)로 변환
      const naverKeywordIdNum = Number(id);
      const { data: kwRow } = await supabase
        .from('keyword_challenges')
        .select('id')
        .eq('naver_keyword_id', naverKeywordIdNum)
        .maybeSingle();
      const dbKeywordId = kwRow?.id as string | undefined;

      if (dbKeywordId) {
        // 인플루언서 조회
        const { data: influencers } = await supabase
          .from('influencers')
          .select('id, naver_id')
          .in('naver_id', naverIds);

        const influencerByNaverId = new Map<string, string>();
        influencers?.forEach(inf => {
          if (inf.naver_id) influencerByNaverId.set(inf.naver_id.toLowerCase(), inf.id);
        });

        const infIds = Array.from(influencerByNaverId.values());
        if (infIds.length > 0) {
          // 최근 8일 스냅샷 조회 — 최신 vs 7일 전 비교로 주간 rank_change 계산
          // 일일 변동은 0인 경우가 많아 주간 변동이 더 의미있음
          const { data: rankings } = await supabase
            .from('keyword_rankings')
            .select('influencer_id, rank_position, snapshot_date')
            .eq('keyword_id', dbKeywordId)
            .in('influencer_id', infIds)
            .order('snapshot_date', { ascending: false })
            .limit(infIds.length * 8);

          // 인플루언서별로 스냅샷 정렬 (최신순)
          const byInfluencer = new Map<string, { rank_position: number; snapshot_date: string }[]>();
          rankings?.forEach(r => {
            if (!byInfluencer.has(r.influencer_id)) byInfluencer.set(r.influencer_id, []);
            byInfluencer.get(r.influencer_id)!.push(r);
          });

          const changeByInfluencer = new Map<string, number>();
          for (const [infId, snapshots] of byInfluencer) {
            if (snapshots.length === 0) continue;
            const latest = snapshots[0];
            // 7일 이상 된 스냅샷 중 가장 최신 것을 baseline으로 사용
            const latestDate = new Date(latest.snapshot_date);
            const baseline = snapshots.find(s => {
              const diff = (latestDate.getTime() - new Date(s.snapshot_date).getTime()) / (1000 * 60 * 60 * 24);
              return diff >= 1; // 최소 하루 이전 스냅샷
            });
            // rank_change = 이전 순위 - 현재 순위 (양수 = 상승)
            const change = baseline ? baseline.rank_position - latest.rank_position : 0;
            changeByInfluencer.set(infId, change);
          }

          for (const [naverId, infId] of influencerByNaverId) {
            const change = changeByInfluencer.get(infId);
            if (change !== undefined) rankChangeByNaverId.set(naverId, change);
          }
        }
      }
    }

    const rankings = naverRankings.map((r, i) => ({
      id: `rank-${id}-${i + 1}`,
      keyword_id: id,
      influencer_name: r.name,
      influencer_url: r.profileUrl,
      influencer_category: r.category || '기타',
      rank_position: r.rank,
      previous_rank: null,
      rank_change: rankChangeByNaverId.get(r.naverId?.toLowerCase() || '') ?? 0,
      post_count: 0,
      fan_count: r.fanCount,
      naver_id: r.naverId,
      post_title: r.postTitle,
      post_url: r.postUrl,
      snapshot_date: new Date().toISOString().split('T')[0],
    }));

    return NextResponse.json({
      rankings,
      keyword_name: found.keyword.name,
      total_count: rankings.length,
      is_limited: false,
    });
  } catch (err) {
    console.error(
      `[rankings] 실패: keywordId=${id}`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: '순위 정보를 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
