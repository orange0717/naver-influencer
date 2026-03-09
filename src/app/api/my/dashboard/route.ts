import { NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // 쿠키 기반 인증 (Bearer 토큰 불필요)
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();

  // users 테이블에서 프로필 조회
  let { data: userProfile } = await supabase
    .from('users')
    .select('id, nickname, point_balance, total_charged, total_used, linked_influencer_id, subscription_status, subscription_expires_at')
    .eq('auth_id', authUser.id)
    .single();

  // users 레코드가 없으면 자동 생성
  if (!userProfile) {
    const { data: newUser } = await supabase
      .from('users')
      .insert({
        auth_id: authUser.id,
        email: authUser.email,
        nickname: authUser.email?.split('@')[0] || 'User',
        point_balance: 100,
      })
      .select('id, nickname, point_balance, total_charged, total_used, linked_influencer_id, subscription_status, subscription_expires_at')
      .single();
    userProfile = newUser;
  }

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

  // 인플루언서 정보
  const { data: influencer } = await supabase
    .from('influencers')
    .select('*')
    .eq('id', userProfile.linked_influencer_id)
    .single();

  if (!influencer) {
    return NextResponse.json({ linked: false, influencer: null, stats: null, rankings: [], competitors: [], guide: [] });
  }

  // 최신 순위 데이터 (keyword_rankings)
  const today = new Date().toISOString().slice(0, 10);
  const { data: latestRankings } = await supabase
    .from('keyword_rankings')
    .select(`
      rank_position, previous_rank, rank_change, fan_count, is_integrated_top3,
      latest_post_title, snapshot_date,
      keyword_id,
      keyword_challenges!inner(keyword, category, participant_count, search_volume_monthly)
    `)
    .eq('influencer_id', userProfile.linked_influencer_id)
    .order('snapshot_date', { ascending: false })
    .limit(200);

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

  const competitors: { keyword: string; competitors: { name: string; rank: number; isMe: boolean }[] }[] = [];

  for (const kwId of topKeywordIds) {
    const { data: kwRankings } = await supabase
      .from('keyword_rankings')
      .select(`
        rank_position,
        influencer_id,
        influencers!inner(display_name, naver_id)
      `)
      .eq('keyword_id', kwId)
      .eq('snapshot_date', currentRankings.find(r => r.keyword_id === kwId)?.snapshot_date || today)
      .order('rank_position', { ascending: true })
      .limit(5);

    const kwInfo = currentRankings.find(r => r.keyword_id === kwId);
    const kwName = (kwInfo as Record<string, unknown>)?.keyword_challenges
      ? ((kwInfo as Record<string, unknown>).keyword_challenges as Record<string, unknown>).keyword as string
      : '';

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
    const kwData = (nearTop3 as Record<string, unknown>).keyword_challenges as Record<string, string> | undefined;
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
    const kwData = (r as Record<string, unknown>).keyword_challenges as Record<string, unknown> | undefined;
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

  return NextResponse.json({
    linked: true,
    influencer: {
      id: influencer.id,
      naver_id: influencer.naver_id,
      display_name: influencer.display_name,
      category: influencer.my_keyword_category || influencer.category,
      image_url: influencer.image_url,
      subscriber_count: influencer.subscriber_count,
      total_follower_count: influencer.total_follower_count,
    },
    stats,
    rankings,
    competitors,
    guide,
  });
}
