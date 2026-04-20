import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { refreshFollowerCount } from '@/lib/refresh-follower';

interface JoinedKeywordChallenge {
  keyword: string;
  category: string;
  participant_count: number;
  search_volume_monthly: number;
}

function getKwData(r: { keyword_challenges: unknown }): JoinedKeywordChallenge | null {
  const kw = r.keyword_challenges;
  if (kw && typeof kw === 'object' && 'keyword' in kw) return kw as JoinedKeywordChallenge;
  return null;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await dashboardLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (await isRestrictedByUserId(auth.userId)) return NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 });

  const supabase = createServiceClient();

  // users 테이블에서 프로필 조회 (getAuthUser에서 이미 확인되었으므로 존재 보장)
  const { data: userProfile } = await supabase
    .from('users')
    .select('id, nickname, linked_influencer_id, subscription_status, subscription_expires_at')
    .eq('id', auth.userId)
    .single();

  if (!userProfile || !userProfile.linked_influencer_id) {
    return NextResponse.json({
      linked: false,
      influencer: null,
      stats: null,
      rankings: [],
      competitors: [],
      guide: [],
    });
  }

  // 인플루언서 정보 (필요한 필드만 선택)
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id, naver_id, display_name, category, my_keyword_category, image_url, subscriber_count, total_follower_count, last_crawled_at')
    .eq('id', userProfile.linked_influencer_id)
    .single();

  if (!influencer) {
    return NextResponse.json({ linked: false, influencer: null, stats: null, rankings: [], competitors: [], guide: [] });
  }

  // 팔로워수 실시간 갱신 (6시간 캐시, 백그라운드 병렬 실행)
  const followerRefresh = refreshFollowerCount(supabase, influencer.id, influencer.naver_id, influencer.last_crawled_at);

  // 최신 순위 데이터 (keyword_rankings) - 최근 30일로 제한
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: latestRankings } = await supabase
    .from('keyword_rankings')
    .select(`
      rank_position, previous_rank, rank_change, fan_count, is_integrated_top3,
      latest_post_title, snapshot_date,
      keyword_id,
      keyword_challenges!inner(keyword, category, participant_count, search_volume_monthly)
    `)
    .eq('influencer_id', userProfile.linked_influencer_id)
    .gte('snapshot_date', thirtyDaysAgo.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: false })
    .limit(500);

  // 최신 날짜의 순위만 추출 (같은 키워드 중복 제거)
  const latestByKeyword = new Map<string, typeof latestRankings extends (infer T)[] | null ? T : never>();
  for (const r of (latestRankings || [])) {
    if (!latestByKeyword.has(r.keyword_id)) {
      latestByKeyword.set(r.keyword_id, r);
    }
  }
  const currentRankings = Array.from(latestByKeyword.values());

  // 통계 계산
  const totalKeywords = currentRankings.length;
  const avgRank = totalKeywords > 0
    ? (currentRankings.reduce((s, r) => s + r.rank_position, 0) / totalKeywords)
    : 0;
  const top3Count = currentRankings.filter(r => r.rank_position <= 3).length;
  const integratedCount = currentRankings.filter(r => r.is_integrated_top3).length;
  const rankUpCount = currentRankings.filter(r => r.rank_change > 0).length;
  const rankDownCount = currentRankings.filter(r => r.rank_change < 0).length;

  const stats = {
    total_keywords: totalKeywords,
    avg_rank: parseFloat(avgRank.toFixed(1)),
    top3_count: top3Count,
    integrated_top3_count: integratedCount,
    rank_up_count: rankUpCount,
    rank_down_count: rankDownCount,
  };

  // 순위 이력 (최근 15일)
  const fifteenDaysAgo = new Date();
  fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

  const { data: historyData } = await supabase
    .from('keyword_rankings')
    .select('keyword_id, rank_position, snapshot_date')
    .eq('influencer_id', userProfile.linked_influencer_id)
    .gte('snapshot_date', fifteenDaysAgo.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true });

  // 키워드별 이력 정리
  const historyMap = new Map<string, { date: string; rank: number }[]>();
  for (const h of (historyData || [])) {
    const arr = historyMap.get(h.keyword_id) || [];
    arr.push({ date: h.snapshot_date, rank: h.rank_position });
    historyMap.set(h.keyword_id, arr);
  }

  // 경쟁자 데이터 (상위 5개 키워드의 TOP 5)
  const topKeywordIds = currentRankings
    .sort((a, b) => a.rank_position - b.rank_position)
    .slice(0, 5)
    .map(r => r.keyword_id);

  // 경쟁자 데이터 배치 조회 (N+1 -> 1 쿼리)
  const competitors: { keyword: string; competitors: { name: string; rank: number; isMe: boolean }[] }[] = [];

  if (topKeywordIds.length > 0) {
    // 상위 키워드들의 snapshot_date 수집
    const snapshotDate = currentRankings.find(r => topKeywordIds.includes(r.keyword_id))?.snapshot_date || today;

    const { data: allCompetitorRankings } = await supabase
      .from('keyword_rankings')
      .select(`
        keyword_id,
        rank_position,
        influencer_id,
        influencers!inner(display_name, naver_id)
      `)
      .in('keyword_id', topKeywordIds)
      .eq('snapshot_date', snapshotDate)
      .order('rank_position', { ascending: true });

    // 키워드별로 그룹핑 (TOP 5만)
    const competitorMap = new Map<string, typeof allCompetitorRankings>();
    for (const kr of (allCompetitorRankings || [])) {
      const arr = competitorMap.get(kr.keyword_id) || [];
      if (arr.length < 5) {
        arr.push(kr);
        competitorMap.set(kr.keyword_id, arr);
      }
    }

    for (const kwId of topKeywordIds) {
      const kwInfo = currentRankings.find(r => r.keyword_id === kwId);
      const kwData = kwInfo?.keyword_challenges as Record<string, unknown> | undefined;
      const kwName = (kwData?.keyword as string) || '';
      const kwRankings = competitorMap.get(kwId);

      if (kwRankings && kwName) {
        competitors.push({
          keyword: kwName,
          competitors: kwRankings.map(kr => ({
            name: ((kr.influencers as unknown) as Record<string, unknown>)?.display_name as string || '',
            rank: kr.rank_position,
            isMe: kr.influencer_id === userProfile.linked_influencer_id,
          })),
        });
      }
    }
  }

  // 가이드 생성
  const guide = [];
  if (totalKeywords < 10) {
    guide.push({
      factor: '서비스 활성도',
      status: 'warning',
      message: `참여 키워드 ${totalKeywords}개`,
      action: '더 많은 키워드 챌린지에 참여하세요',
    });
  }
  const nearTop3 = currentRankings.find(r => r.rank_position === 4);
  if (nearTop3) {
    const kwData = getKwData(nearTop3 as { keyword_challenges: unknown });
    guide.push({
      factor: 'TOP 3 기회',
      status: 'opportunity',
      message: `'${kwData?.keyword || ''}' ${nearTop3.rank_position}위 - TOP 3까지 1단계`,
      action: '콘텐츠 품질 개선으로 TOP 3 진입 가능',
    });
  }
  if (rankDownCount > 0) {
    guide.push({
      factor: '순위 하락 주의',
      status: 'actionable',
      message: `${rankDownCount}개 키워드 순위 하락`,
      action: '해당 키워드 콘텐츠를 업데이트하세요',
    });
  }

  // 응답
  const rankings = currentRankings.map(r => {
    const kwData = getKwData(r as { keyword_challenges: unknown });
    const history = historyMap.get(r.keyword_id) || [];
    return {
      keyword_id: r.keyword_id,
      keyword: kwData?.keyword || '',
      category: kwData?.category || '',
      rank_position: r.rank_position,
      previous_rank: r.previous_rank,
      rank_change: r.rank_change,
      is_integrated_top3: r.is_integrated_top3,
      participant_count: kwData?.participant_count || 0,
      search_volume_monthly: kwData?.search_volume_monthly || 0,
      rank_history: history.map(h => h.rank),
      rank_history_dates: history.map(h => h.date),
    };
  }).sort((a, b) => a.rank_position - b.rank_position);

  // 주제별 강점 통계
  const catMap = new Map<string, { total: number; top10: number; sumRank: number }>();
  for (const r of rankings) {
    const cat = r.category || '기타';
    const entry = catMap.get(cat) || { total: 0, top10: 0, sumRank: 0 };
    entry.total++;
    if (r.rank_position <= 10) entry.top10++;
    entry.sumRank += r.rank_position;
    catMap.set(cat, entry);
  }
  const categoryStats = Array.from(catMap.entries())
    .map(([category, s]) => ({
      category,
      totalKeywords: s.total,
      top10Count: s.top10,
      top10Rate: s.total > 0 ? Math.round((s.top10 / s.total) * 100) : 0,
      avgRank: s.total > 0 ? parseFloat((s.sumRank / s.total).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.top10Rate - a.top10Rate || a.avgRank - b.avgRank);

  // 팔로워수 갱신 대기 (최대 8초, 실패해도 기존 데이터 사용)
  const freshFollowerCount = await followerRefresh;

  return NextResponse.json({
    linked: true,
    influencer: {
      id: influencer.id,
      naver_id: influencer.naver_id,
      display_name: influencer.display_name,
      category: influencer.my_keyword_category || influencer.category,
      image_url: influencer.image_url,
      subscriber_count: influencer.subscriber_count || freshFollowerCount || influencer.total_follower_count,
      total_follower_count: freshFollowerCount || influencer.total_follower_count,
    },
    stats,
    rankings,
    categoryStats,
    competitors,
    guide,
  });
}
