import { redirect } from 'next/navigation';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { formatCount } from '@/lib/format';
import { cookies } from 'next/headers';
import Top5Keywords from '@/components/dashboard/Top5Keywords';
import RankDistribution from '@/components/dashboard/RankDistribution';
import WidgetSection from '@/components/dashboard/WidgetSection';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import RankTrendSection from '@/components/dashboard/RankTrendSection';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import GlassCard from '@/components/dashboard/GlassCard';
import KeywordSyncButton from '@/components/dashboard/KeywordSyncButton';
import ChallengeStatsSection from '@/components/dashboard/ChallengeStatsSection';
import MyKeywordList from '@/components/dashboard/MyKeywordList';
import { generateActivityEvents } from '@/lib/activity-events';
import { analyzeRankAlerts } from '@/lib/rank-alerts';
import SmartAlerts from '@/components/dashboard/SmartAlerts';
import KeywordPlanner from '@/components/dashboard/KeywordPlanner';
import SavedKeywords from '@/components/dashboard/SavedKeywords';
import DailyBriefing from '@/components/dashboard/DailyBriefing';
import TrialBanner from '@/components/TrialBanner';
import { refreshFollowerCount } from '@/lib/refresh-follower';

export const dynamic = 'force-dynamic';

export default async function MyDashboard({ searchParams }: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const supabase = createServiceClient();
  let naverId: string | undefined;
  const params = await searchParams;

  const cookieStore = await cookies();

  // ─── 1. 데모 쿠키 체크 (우선: 데모 중이면 Supabase 인증 무시) ───
  const isDemo = cookieStore.get('demo_mode')?.value === 'true';
  if (isDemo) {
    naverId = cookieStore.get('naver_id')?.value;
  }

  // URL 파라미터 폴백 (쿠키가 안 설정된 경우)
  if (!naverId && params.demo) {
    naverId = params.demo;
  }

  // ─── 2. Supabase Auth 세션 체크 ───
  let isLoggedIn = false;
  if (!naverId) {
    const supabaseAuth = await createRouteHandlerClient();
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

    if (authUser) {
      isLoggedIn = true;

      // 제한 사용자 체크
      const { isRestricted } = await import('@/lib/admin');
      if (await isRestricted(authUser.email)) {
        redirect('/subscribe');
      }

      const { data: profile } = await supabase
        .from('users')
        .select('linked_influencer_id, blog_id')
        .eq('auth_id', authUser.id)
        .single();

      if (profile?.linked_influencer_id) {
        const { data: linkedInf } = await supabase
          .from('influencers')
          .select('naver_id')
          .eq('id', profile.linked_influencer_id)
          .single();
        naverId = linkedInf?.naver_id || undefined;
      }

      // 인플루언서 미연결이지만 블로그가 있으면 blog_id를 naverId로 사용
      if (!naverId && profile?.blog_id) {
        naverId = profile.blog_id;
      }
    }
  }

  // ─── 3. 기존 쿠키 기반 체크 (하위 호환) ───
  if (!naverId) {
    naverId = cookieStore.get('naver_id')?.value;
  }

  if (!naverId) {
    if (isLoggedIn) {
      redirect('/profile');
    }
    redirect('/auth/login');
  }

  // 체험/데모 만료 체크
  const trialStarted = cookieStore.get('trial_started')?.value;
  const isTrial = !!trialStarted;
  const durationMs = (isDemo ? 7 : 3) * 24 * 60 * 60 * 1000;
  let trialExpired = false;
  if (trialStarted) {
    const elapsed = Date.now() - Number(trialStarted);
    trialExpired = elapsed > durationMs;
  }
  if (trialExpired) {
    redirect('/subscribe');
  }

  // naver_id로 인플루언서 조회
  const { data: influencerData } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .single();

  if (!influencerData) {
    // 블로거로 접속한 경우 (blog_id만 있는 사용자 포함)
    const blogId = cookieStore.get('blog_id')?.value || params.demo;
    if (blogId) {
      redirect(`/my/blogger?blogId=${blogId}`);
    }
    // Supabase Auth 로그인 상태이고 blog_id로 naverId가 설정된 경우
    if (isLoggedIn && naverId) {
      redirect(`/my/blogger?blogId=${naverId}`);
    }
    if (isLoggedIn) {
      redirect('/profile');
    }
    redirect('/auth/login');
  }

  const influencerId = influencerData.id;

  // 인플루언서 정보
  const { data: influencer } = await supabase
    .from('influencers')
    .select('*')
    .eq('id', influencerId)
    .single();

  // 팬수 갱신 (6시간 캐시)
  if (influencer) {
    const updated = await refreshFollowerCount(supabase, influencerId, naverId!, influencer.last_crawled_at);
    if (updated !== null) {
      // DB 갱신 후 현재 객체에도 반영
      const { data: refreshed } = await supabase
        .from('influencers')
        .select('subscriber_count, total_follower_count')
        .eq('id', influencerId)
        .single();
      if (refreshed) {
        influencer.subscriber_count = refreshed.subscriber_count;
        influencer.total_follower_count = refreshed.total_follower_count;
      }
    }
  }

  // 모든 기능 무료 개방
  const canAccess = true;

  if (!influencer) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-down/15 flex items-center justify-center text-down text-xl font-bold">!</div>
          <p className="text-sm text-dim">인플루언서 정보를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  // ─── 1. 최신 순위 데이터 (keyword_rankings) ───
  // 먼저 이 인플루언서의 최신 스냅샷 날짜를 조회
  const { data: myLatestDate } = await supabase
    .from('keyword_rankings')
    .select('snapshot_date')
    .eq('influencer_id', influencerId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();

  const mySnapshotDate = myLatestDate?.snapshot_date;

  // 최신 날짜의 랭킹만 가져오기 (limit 5000 -> 정확한 최신 데이터만)
  const { data: latestRankings } = mySnapshotDate
    ? await supabase
        .from('keyword_rankings')
        .select(`
          rank_position, previous_rank, rank_change, is_integrated_top3,
          keyword_id, latest_post_title, latest_post_url, snapshot_date,
          blog_search_rank, view_tab_rank,
          keyword_challenges(keyword, category, participant_count, search_volume_monthly)
        `)
        .eq('influencer_id', influencerId)
        .eq('snapshot_date', mySnapshotDate)
    : { data: null };

  const currentRankings = latestRankings || [];

  interface KeywordChallengeJoin {
    keyword: string;
    category: string;
    participant_count: number;
    search_volume_monthly: number;
  }

  const rankings = currentRankings.map(r => {
    const kw = r.keyword_challenges as unknown as KeywordChallengeJoin;
    return {
      keyword_id: r.keyword_id,
      keyword: kw?.keyword || '',
      category: kw?.category || '',
      rank_position: r.rank_position,
      rank_change: r.rank_change,
      is_integrated_top3: r.is_integrated_top3,
      participant_count: kw?.participant_count || 0,
      search_volume: kw?.search_volume_monthly || 0,
      latest_post_title: r.latest_post_title || '',
      latest_post_url: r.latest_post_url || '',
      snapshot_date: r.snapshot_date || '',
      blog_search_rank: (r as Record<string, unknown>).blog_search_rank as number | null,
      view_tab_rank: (r as Record<string, unknown>).view_tab_rank as number | null,
    };
  }).sort((a, b) => a.rank_position - b.rank_position);

  // ─── 내 포스팅 리스트 (중복 제거) ───
  const postMap = new Map<string, {
    title: string;
    url: string;
    keywords: { keyword: string; rank: number; isTop3: boolean }[];
    bestRank: number;
    date: string;
  }>();
  for (const r of rankings) {
    if (!r.latest_post_title || !r.latest_post_url) continue;
    const key = r.latest_post_url;
    const existing = postMap.get(key);
    if (existing) {
      existing.keywords.push({ keyword: r.keyword, rank: r.rank_position, isTop3: r.is_integrated_top3 });
      if (r.rank_position < existing.bestRank) existing.bestRank = r.rank_position;
    } else {
      postMap.set(key, {
        title: r.latest_post_title,
        url: r.latest_post_url,
        keywords: [{ keyword: r.keyword, rank: r.rank_position, isTop3: r.is_integrated_top3 }],
        bestRank: r.rank_position,
        date: r.snapshot_date,
      });
    }
  }
  const myPosts = Array.from(postMap.values())
    .sort((a, b) => a.bestRank - b.bestRank);

  // ─── 토픽 수 크롤링 (3초 타임아웃) ───
  let topicCount = 0;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const inRes = await fetch(`https://in.naver.com/${naverId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    clearTimeout(timeout);
    if (inRes.ok) {
      const html = await inRes.text();
      // "토픽 N" 또는 토픽 카운트 패턴 매칭
      const topicMatch = html.match(/토픽\s*(\d+)/);
      if (topicMatch) {
        topicCount = parseInt(topicMatch[1]);
      } else {
        // JSON 데이터에서 topicCount 추출 시도
        const jsonMatch = html.match(/"topicCount"\s*:\s*(\d+)/);
        if (jsonMatch) topicCount = parseInt(jsonMatch[1]);
      }
    }
  } catch {
    // 토픽 크롤링 실패 무시
  }

  // 통계 계산
  const totalRankedKeywords = rankings.length;
  const avgRank = totalRankedKeywords > 0
    ? rankings.reduce((s, r) => s + r.rank_position, 0) / totalRankedKeywords
    : 0;
  const top3Count = rankings.filter(r => r.rank_position <= 3).length;
  const rank1Count = rankings.filter(r => r.rank_position === 1).length;
  const top10Count = rankings.filter(r => r.rank_position <= 10).length;
  const integratedCount = rankings.filter(r => r.is_integrated_top3).length;
  const rankUpCount = rankings.filter(r => r.rank_change > 0).length;
  const rankDownCount = rankings.filter(r => r.rank_change < 0).length;

  // ─── TOP3 진입/이탈 + 최대 변동 (브리핑용) ───
  const top3Entered = (latestRankings || []).filter(r =>
    r.rank_position <= 3 && r.previous_rank !== null && r.previous_rank > 3
  ).length;
  const top3Exited = (latestRankings || []).filter(r =>
    r.rank_position > 3 && r.previous_rank !== null && r.previous_rank <= 3
  ).length;

  const bestUp = rankings.filter(r => r.rank_change > 0)
    .sort((a, b) => b.rank_change - a.rank_change)[0] || null;
  const worstDown = rankings.filter(r => r.rank_change < 0)
    .sort((a, b) => a.rank_change - b.rank_change)[0] || null;

  // ─── 데이터 최신 날짜 ───
  const latestSnapshotDate = rankings.length > 0
    ? rankings.reduce((latest, r) => r.snapshot_date > latest ? r.snapshot_date : latest, rankings[0].snapshot_date)
    : '';
  const dataDateLabel = latestSnapshotDate
    ? `${latestSnapshotDate.slice(5, 7).replace(/^0/, '')}월 ${latestSnapshotDate.slice(8, 10).replace(/^0/, '')}일 기준`
    : '';

  // ─── 순위별 키워드 데이터 (1~5위) ───
  const rankKeywords = (rank: number) => rankings.filter(r => r.rank_position === rank).map(r => ({
    keyword_id: r.keyword_id,
    keyword: r.keyword,
    rank_position: r.rank_position,
    rank_change: r.rank_change,
    category: r.category,
  }));
  const rank2Count = rankings.filter(r => r.rank_position === 2).length;
  const rank3Count = rankings.filter(r => r.rank_position === 3).length;
  const rank4Count = rankings.filter(r => r.rank_position === 4).length;
  const rank5Count = rankings.filter(r => r.rank_position === 5).length;

  // ─── 챌린지 경쟁도 분포 ───
  const avgParticipants = rankings.length > 0
    ? Math.round(rankings.reduce((s, r) => s + r.participant_count, 0) / rankings.length)
    : 0;
  const compLow = rankings.filter(r => r.participant_count <= 30).length;
  const compMid = rankings.filter(r => r.participant_count > 30 && r.participant_count <= 100).length;
  const compHigh = rankings.filter(r => r.participant_count > 100).length;

  // ─── 1-2. 전체 순위 & 카테고리 순위 계산 ───
  const myCategory = influencer.my_keyword_category || influencer.category || '';

  // 카테고리 순위 계산 (인플루언서는 카테고리끼리 경쟁)
  // DB 레벨에서 카테고리 필터링 → 단일 쿼리로 순위/총원 계산
  let categoryRank = 0;
  let categoryTotal = 0;
  if (myCategory) {
    const myKeywordScore = influencer.keyword_score || 0;

    // 같은 카테고리에서 나보다 점수 높은 사람 수 = 내 순위 - 1
    const { count: higherCount } = await supabase
      .from('influencers')
      .select('id', { count: 'exact', head: true })
      .gt('keyword_score', myKeywordScore)
      .or(`my_keyword_category.eq.${myCategory},and(my_keyword_category.is.null,category.eq.${myCategory})`);

    // 같은 카테고리 전체 인원수
    const { count: totalCount } = await supabase
      .from('influencers')
      .select('id', { count: 'exact', head: true })
      .gt('keyword_score', 0)
      .or(`my_keyword_category.eq.${myCategory},and(my_keyword_category.is.null,category.eq.${myCategory})`);

    categoryRank = (higherCount || 0) + 1;
    categoryTotal = totalCount || 0;
  }

  // ─── 2. 내 키워드 전체 목록 ───
  const { data: myKeywords } = await supabase
    .from('influencer_keywords')
    .select(`keyword_id, keyword_challenges(id, keyword, category, participant_count, search_volume_monthly)`)
    .eq('influencer_id', influencerId);

  const rankedMap = new Map(rankings.map(r => [r.keyword_id, r]));
  const ikKeywordIds = new Set((myKeywords || []).map(ik => ik.keyword_id));

  interface KeywordChallengeWithId extends KeywordChallengeJoin {
    id: string;
  }

  // influencer_keywords 기반 키워드 (참여 키워드)
  const participatedKeywords = (myKeywords || []).map(ik => {
    const kw = ik.keyword_challenges as unknown as KeywordChallengeWithId;
    const ranked = rankedMap.get(ik.keyword_id);
    return {
      keyword_id: kw?.id || ik.keyword_id,
      keyword: kw?.keyword || '',
      category: kw?.category || '기타',
      participant_count: kw?.participant_count || 0,
      search_volume: kw?.search_volume_monthly || 0,
      rank_position: ranked?.rank_position ?? null,
      rank_change: ranked?.rank_change ?? 0,
      is_integrated_top3: ranked?.is_integrated_top3 ?? false,
      blog_search_rank: ranked?.blog_search_rank ?? null,
      view_tab_rank: ranked?.view_tab_rank ?? null,
      is_participated: true,
    };
  });

  // rankings에는 있지만 influencer_keywords에는 없는 키워드 추가
  for (const r of rankings) {
    if (!ikKeywordIds.has(r.keyword_id)) {
      participatedKeywords.push({
        keyword_id: r.keyword_id,
        keyword: r.keyword,
        category: r.category,
        participant_count: r.participant_count,
        search_volume: r.search_volume,
        rank_position: r.rank_position,
        rank_change: r.rank_change,
        is_integrated_top3: r.is_integrated_top3,
        blog_search_rank: r.blog_search_rank ?? null,
        view_tab_rank: r.view_tab_rank ?? null,
        is_participated: true,
      });
    }
  }

  // 참여 키워드의 카테고리 목록 추출
  const participatedCategories = [...new Set(participatedKeywords.map(kw => kw.category).filter(Boolean))];
  const participatedKeywordIds = new Set(participatedKeywords.map(kw => kw.keyword_id));

  // 해당 카테고리의 전체 키워드 조회 (미참여 키워드 포함)
  // Supabase 기본 1000건 제한 해제
  let categoryAllKeywords: { id: string; keyword: string; category: string; participant_count: number; search_volume_monthly: number }[] = [];
  if (participatedCategories.length > 0) {
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await supabase
        .from('keyword_challenges')
        .select('id, keyword, category, participant_count, search_volume_monthly')
        .in('category', participatedCategories)
        .eq('is_active', true)
        .order('participant_count', { ascending: false })
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (batch && batch.length > 0) {
        categoryAllKeywords.push(...batch);
        from += PAGE_SIZE;
        hasMore = batch.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }
  }

  // 페이지네이션 경계 중복 제거
  const seenIds = new Set<string>();
  categoryAllKeywords = categoryAllKeywords.filter(kw => {
    if (seenIds.has(kw.id)) return false;
    seenIds.add(kw.id);
    return true;
  });

  // 미참여 키워드 추가 (keyword_id + keyword 이름 기준 중복 제거)
  const participatedKeywordNames = new Set(participatedKeywords.map(kw => kw.keyword.toLowerCase()));
  const notParticipatedKeywords = categoryAllKeywords
    .filter(kw => !participatedKeywordIds.has(kw.id) && !participatedKeywordNames.has(kw.keyword.toLowerCase()))
    .map(kw => ({
      keyword_id: kw.id,
      keyword: kw.keyword || '',
      category: kw.category || '기타',
      participant_count: kw.participant_count || 0,
      search_volume: kw.search_volume_monthly || 0,
      rank_position: null,
      rank_change: 0,
      is_integrated_top3: false,
      blog_search_rank: null,
      view_tab_rank: null,
      is_participated: false,
    }));

  // 전체 키워드 = 참여 + 미참여
  const allKeywords = [...participatedKeywords, ...notParticipatedKeywords];

  allKeywords.sort((a, b) => {
    // 참여 키워드 우선
    if (a.is_participated && !b.is_participated) return -1;
    if (!a.is_participated && b.is_participated) return 1;
    // 참여 키워드 내에서는 순위순
    if (a.is_participated && b.is_participated) {
      if (a.rank_position !== null && b.rank_position === null) return -1;
      if (a.rank_position === null && b.rank_position !== null) return 1;
      if (a.rank_position !== null && b.rank_position !== null) return a.rank_position - b.rank_position;
    }
    return (b.search_volume || 0) - (a.search_volume || 0);
  });

  const grouped = new Map<string, typeof allKeywords>();
  for (const kw of allKeywords) {
    const cat = kw.category || '기타';
    const arr = grouped.get(cat) || [];
    arr.push(kw);
    grouped.set(cat, arr);
  }
  const categoryGroups = Array.from(grouped.entries())
    .sort((a, b) => b[1].length - a[1].length);
  const totalKeywords = allKeywords.length;
  const participatedCount = participatedKeywords.length;

  // ─── 3. 활동 이벤트 생성 ───
  const activityEvents = generateActivityEvents(rankings);

  // ─── 5. 스마트 알림 (순위 트렌드 분석) ───
  const rankAlerts = analyzeRankAlerts(latestRankings || []);

  return (
    <div className="space-y-6">

      {/* ─── 체험/데모 배너 ─── */}
      {isTrial && <TrialBanner isDemo={isDemo} />}

      {/* ─── 1. 프로필 헤더 ─── */}
      <ProfileHeader
        displayName={influencer.display_name}
        imageUrl={influencer.image_url}
        category={influencer.my_keyword_category || influencer.category}
        subscriberCount={influencer.subscriber_count || 0}
        firstSeenAt={influencer.naver_created_at || undefined}
        type="influencer"
        subscribed={true}
        top3Count={top3Count}
        totalKeywords={totalRankedKeywords}
        myKeyword={influencer.my_keyword || undefined}
        naverId={naverId}
      />

      {/* ─── 오늘의 브리핑 ─── */}
      <DailyBriefing
        rankUpCount={rankUpCount}
        rankDownCount={rankDownCount}
        top3Entered={top3Entered}
        top3Exited={top3Exited}
        bestUp={bestUp ? { keyword: bestUp.keyword, change: bestUp.rank_change } : null}
        worstDown={worstDown ? { keyword: worstDown.keyword, change: worstDown.rank_change } : null}
        dataDateLabel={dataDateLabel}
      />

      {/* ─── 무료 공개 영역 (항상 보임) ─── */}
      <div className="space-y-6">

      {/* ─── 카테고리 순위 + 전체 평균순위 ─── */}
      {categoryRank > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <GlassCard padding="none">
            <div className="flex items-center justify-center py-6 px-4">
              <div className="text-center">
                <p className="text-[11px] text-dim font-semibold mb-1">
                  {myCategory || '카테고리'} 순위
                </p>
                <p className="text-3xl font-black font-rank text-accent">
                  {categoryRank.toLocaleString()}<span className="text-lg font-bold">위</span>
                </p>
                <p className="text-xs text-dim mt-1">{categoryTotal.toLocaleString()}명 중</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard padding="none">
            <div className="flex items-center justify-center py-6 px-4">
              <div className="text-center">
                <p className="text-[11px] text-dim font-semibold mb-1">
                  전체 키챌 평균순위
                </p>
                <p className="text-3xl font-black font-rank text-accent">
                  {avgRank > 0 ? avgRank.toFixed(1) : '—'}<span className="text-lg font-bold">{avgRank > 0 ? '위' : ''}</span>
                </p>
                <p className="text-xs text-dim mt-1">{participatedCount}개 키워드 평균</p>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* 상세 통계 바 */}
      {categoryRank > 0 && (
        <div className="bg-surface border border-border rounded-2xl px-5 py-3">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs">
            <span className="text-dim">1위 키워드 <strong className="text-text font-rank">{rank1Count}</strong>개</span>
            <span className="text-dim">TOP 3 <strong className="text-text font-rank">{top3Count}</strong>개</span>
            <span className="text-dim">TOP 10 <strong className="text-text font-rank">{top10Count}</strong>개</span>
            <span className="text-dim">통합검색 <strong className="text-text font-rank">{integratedCount}</strong>개</span>
            <span className="text-dim">참여 키워드 <strong className="text-text font-rank">{participatedCount}</strong>개</span>
            <span className="text-dim">팬 <strong className="text-text font-rank">{formatCount(influencer.subscriber_count || 0)}</strong></span>
          </div>
        </div>
      )}

      {/* ─── 2. 통계 카드 4개 ─── */}
      <div className="grid grid-cols-4 gap-3">
        <AnimatedStatCard
          label="참여 키워드"
          value={participatedCount}
          suffix="개"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>}
          color={participatedCount > 0 ? 'accent' : 'dim'}
          delay={100}
        />
        <AnimatedStatCard
          label="TOP 3 키워드"
          value={top3Count}
          suffix="개"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
          color={top3Count > 0 ? 'gold' : 'dim'}
          delay={150}
        />
        <AnimatedStatCard
          label="순위 변동"
          value={rankUpCount + rankDownCount}
          suffix="건"
          trend={rankUpCount > rankDownCount ? { direction: 'up', value: rankUpCount } : rankDownCount > 0 ? { direction: 'down', value: rankDownCount } : undefined}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>}
          color={rankUpCount > 0 ? 'up' : rankDownCount > 0 ? 'down' : 'dim'}
          delay={200}
        />
        <AnimatedStatCard
          label="토픽"
          value={topicCount}
          suffix="개"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>}
          color={topicCount > 0 ? 'accent' : 'dim'}
          delay={250}
        />
      </div>

      {/* ─── 활동 현황 + 순위별 키워드 분포 ─── */}
      <GlassCard>
        <h3 className="font-bold text-[15px] mb-4">활동 현황</h3>
        {/* 순위별 키워드 분포 (클릭 시 키워드 목록 표시) */}
        <RankDistribution
          rankings={rankings.map(r => ({
            keyword_id: r.keyword_id,
            keyword: r.keyword,
            rank_position: r.rank_position,
            rank_change: r.rank_change,
            category: r.category,
          }))}
        />
      </GlassCard>

      {/* ─── 2-1. 키워드챌린지 참여 현황 ─── */}
      <ChallengeStatsSection
        totalKeywords={participatedCount}
        rankedKeywords={top10Count}
        rank1Count={rank1Count}
        top3Count={top3Count}
        integratedTop3Count={integratedCount}
        avgParticipants={avgParticipants}
        compLow={compLow}
        compMid={compMid}
        compHigh={compHigh}
      />

      {/* ─── 2-2. 스마트 알림 (오늘의 액션 포인트) ─── */}
      <SmartAlerts alerts={rankAlerts} />

      {/* ─── 2-3. 포스팅 키워드 플래너 ─── */}
      <KeywordPlanner
        existingKeywords={participatedKeywords.map(kw => ({
          id: kw.keyword_id,
          keyword: kw.keyword,
        }))}
      />

      {/* ─── 2-4. 저장된 키워드 ─── */}
      <SavedKeywords />

      {/* ─── 3. 순위 추이 차트 ─── */}
      <RankTrendSection mode="influencer" naverId={naverId} />

      {/* ─── 4. 변동 피드 ─── */}
      <ActivityFeed events={activityEvents} />

      {/* ─── 5. 오늘의 추천키워드 (미참여 중 경쟁도 낮고 검색량 높은 키워드) ─── */}
      <Top5Keywords
        recommendations={notParticipatedKeywords
          .map(kw => ({
            ...kw,
            score: (kw.search_volume > 0 ? Math.log10(kw.search_volume) * 10 : 0) + Math.max(0, 50 - kw.participant_count),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)}
        totalNotParticipated={notParticipatedKeywords.length}
      />

      {/* ─── 6. 위젯 (순위 + TOP3 달성률) ─── */}
      <WidgetSection naverId={naverId} displayName={influencer.display_name || naverId} />


      {/* ─── 7. 내 키워드 리스트 (주제별, 무료 공개) ─── */}
      <MyKeywordList
        categoryGroups={categoryGroups.map(([category, keywords]) => ({ category, keywords }))}
        totalKeywords={totalKeywords}
        participatedCount={participatedCount}
      />

      </div>
    </div>
  );
}
