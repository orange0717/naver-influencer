import { redirect } from 'next/navigation';
import { createServiceClient, createRouteHandlerClient } from '@/lib/supabase-server';
import { formatCount } from '@/lib/format';
import { cookies } from 'next/headers';
import CompetitorSection from '@/components/CompetitorSection';
import Top5Keywords from '@/components/dashboard/Top5Keywords';
import WidgetSection from '@/components/dashboard/WidgetSection';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import RankTrendSection from '@/components/dashboard/RankTrendSection';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import GlassCard from '@/components/dashboard/GlassCard';
import PostAnalysisSection from '@/components/dashboard/PostAnalysisSection';
import KeywordSyncButton from '@/components/dashboard/KeywordSyncButton';
import ChallengeStatsSection from '@/components/dashboard/ChallengeStatsSection';
import MyKeywordList from '@/components/dashboard/MyKeywordList';
import { generateActivityEvents } from '@/lib/activity-events';
import { analyzeRankAlerts } from '@/lib/rank-alerts';
import SmartAlerts from '@/components/dashboard/SmartAlerts';

export const dynamic = 'force-dynamic';

export default async function MyDashboard() {
  const supabase = createServiceClient();
  let naverId: string | undefined;

  // ─── 1. Supabase Auth 세션 체크 (우선) ───
  const supabaseAuth = await createRouteHandlerClient();
  const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

  if (authUser) {
    const { data: profile } = await supabase
      .from('users')
      .select('linked_influencer_id')
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
  }

  // ─── 2. 기존 쿠키 기반 체크 (하위 호환) ───
  if (!naverId) {
    const cookieStore = await cookies();
    naverId = cookieStore.get('naver_id')?.value;
  }

  if (!naverId) {
    redirect('/auth/login');
  }

  // naver_id로 인플루언서 조회
  const { data: influencerData } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .single();

  if (!influencerData) {
    redirect('/auth/login');
  }

  const influencerId = influencerData.id;

  // 인플루언서 정보
  const { data: influencer } = await supabase
    .from('influencers')
    .select('*')
    .eq('id', influencerId)
    .single();

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
          keyword_challenges!inner(keyword, category, participant_count, search_volume_monthly)
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

  // ─── 데이터 최신 날짜 ───
  const latestSnapshotDate = rankings.length > 0
    ? rankings.reduce((latest, r) => r.snapshot_date > latest ? r.snapshot_date : latest, rankings[0].snapshot_date)
    : '';
  const dataDateLabel = latestSnapshotDate
    ? `${latestSnapshotDate.slice(5, 7).replace(/^0/, '')}월 ${latestSnapshotDate.slice(8, 10).replace(/^0/, '')}일 기준`
    : '';

  // ─── 순위별 키워드 수 (1~5위) ───
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

  // 최신 스냅샷 날짜
  const { data: latestDateRow } = await supabase
    .from('keyword_rankings')
    .select('snapshot_date')
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .single();
  const snapshotDate = latestDateRow?.snapshot_date || new Date().toISOString().slice(0, 10);

  // 전체 인플루언서 순위 데이터
  const { data: allInfData } = await supabase
    .from('influencers')
    .select('id, category, my_keyword_category');

  const { data: allRankData } = await supabase
    .from('keyword_rankings')
    .select('influencer_id, rank_position, is_integrated_top3')
    .eq('snapshot_date', snapshotDate);

  // 통계 집계
  const globalStats = new Map<string, { r1: number; t3: number; total: number }>();
  for (const r of (allRankData || [])) {
    let s = globalStats.get(r.influencer_id);
    if (!s) { s = { r1: 0, t3: 0, total: 0 }; globalStats.set(r.influencer_id, s); }
    s.total++;
    if (r.rank_position === 1) s.r1++;
    if (r.rank_position <= 3) s.t3++;
  }

  // 전체 정렬
  const globalSorted = (allInfData || [])
    .map(inf => {
      const s = globalStats.get(inf.id) || { r1: 0, t3: 0, total: 0 };
      return { id: inf.id, cat: inf.my_keyword_category || inf.category || '', ...s };
    })
    .sort((a, b) => b.r1 - a.r1 || b.t3 - a.t3 || b.total - a.total);

  const overallRank = globalSorted.findIndex(x => x.id === influencerId) + 1;
  const overallTotal = globalSorted.length;

  // 카테고리 순위
  const catFiltered = globalSorted.filter(x => x.cat === myCategory);
  const categoryRank = catFiltered.findIndex(x => x.id === influencerId) + 1;
  const categoryTotal = catFiltered.length;

  // 등급 계산
  function getGradeInfo(rank: number, total: number) {
    const pct = rank / total;
    if (rank <= 3) return { label: 'TOP 3', color: 'text-yellow-500', bg: 'bg-yellow-500/15' };
    if (rank <= 10) return { label: 'TOP 10', color: 'text-red-500', bg: 'bg-red-500/10' };
    if (pct <= 0.01) return { label: 'TOP 1%', color: 'text-amber-500', bg: 'bg-amber-500/10' };
    if (pct <= 0.05) return { label: 'TOP 5%', color: 'text-green-500', bg: 'bg-green-500/10' };
    if (pct <= 0.1) return { label: 'TOP 10%', color: 'text-blue-500', bg: 'bg-blue-500/10' };
    if (pct <= 0.3) return { label: 'GOOD', color: 'text-indigo-500', bg: 'bg-indigo-500/10' };
    return { label: 'ACTIVE', color: 'text-dim', bg: 'bg-border/30' };
  }

  const overallGrade = overallRank > 0 ? getGradeInfo(overallRank, overallTotal) : null;

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
        is_participated: true,
      });
    }
  }

  // 참여 키워드의 카테고리 목록 추출
  const participatedCategories = [...new Set(participatedKeywords.map(kw => kw.category).filter(Boolean))];
  const participatedKeywordIds = new Set(participatedKeywords.map(kw => kw.keyword_id));

  // 해당 카테고리의 전체 키워드 조회 (미참여 키워드 포함)
  const { data: categoryAllKeywords } = participatedCategories.length > 0
    ? await supabase
        .from('keyword_challenges')
        .select('id, keyword, category, participant_count, search_volume_monthly')
        .in('category', participatedCategories)
        .eq('is_active', true)
        .order('participant_count', { ascending: false })
    : { data: null };

  // 미참여 키워드 추가
  const notParticipatedKeywords = (categoryAllKeywords || [])
    .filter(kw => !participatedKeywordIds.has(kw.id))
    .map(kw => ({
      keyword_id: kw.id,
      keyword: kw.keyword || '',
      category: kw.category || '기타',
      participant_count: kw.participant_count || 0,
      search_volume: kw.search_volume_monthly || 0,
      rank_position: null,
      rank_change: 0,
      is_integrated_top3: false,
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

      {/* ─── 무료 공개 영역 (항상 보임) ─── */}
      <div className="space-y-6">

      {/* ─── 1-2. 전체/카테고리 순위 + 등급 ─── */}
      {overallRank > 0 && (
        <GlassCard padding="none">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/30">
            {/* 등급 배지 */}
            <div className="flex flex-col items-center justify-center py-6 px-4">
              {overallGrade && (
                <>
                  <span className={`text-lg font-black ${overallGrade.color} ${overallGrade.bg} px-4 py-1.5 rounded-full`}>
                    {overallGrade.label}
                  </span>
                  <p className="text-[11px] text-dim mt-2">인플루언서 등급</p>
                </>
              )}
            </div>

            {/* 전체 순위 */}
            <div className="flex flex-col items-center justify-center py-6 px-4">
              <p className="text-[11px] text-dim font-semibold mb-1">전체 순위</p>
              <p className="text-3xl font-black font-rank text-text">
                {overallRank.toLocaleString()}<span className="text-lg font-bold">위</span>
              </p>
              <p className="text-xs text-dim mt-1">{overallTotal.toLocaleString()}명 중</p>
            </div>

            {/* 카테고리 순위 */}
            <div className="flex flex-col items-center justify-center py-6 px-4">
              <p className="text-[11px] text-dim font-semibold mb-1">
                {myCategory || '카테고리'} 순위
              </p>
              <p className="text-3xl font-black font-rank text-accent">
                {categoryRank > 0 ? categoryRank.toLocaleString() : '-'}<span className="text-lg font-bold">위</span>
              </p>
              <p className="text-xs text-dim mt-1">{categoryTotal.toLocaleString()}명 중</p>
            </div>
          </div>

          {/* 상세 통계 바 */}
          <div className="border-t border-border/30 px-5 py-3 bg-bg/30">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs">
              <span className="text-dim">1위 키워드 <strong className="text-text font-rank">{rank1Count}</strong>개</span>
              <span className="text-dim">TOP 3 <strong className="text-text font-rank">{top3Count}</strong>개</span>
              <span className="text-dim">TOP 10 <strong className="text-text font-rank">{top10Count}</strong>개</span>
              <span className="text-dim">통합검색 <strong className="text-text font-rank">{integratedCount}</strong>개</span>
              <span className="text-dim">참여 키워드 <strong className="text-text font-rank">{totalKeywords}</strong>개</span>
              <span className="text-dim">팬 <strong className="text-text font-rank">{formatCount(influencer.subscriber_count || 0)}</strong></span>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── 2. 통계 카드 4개 ─── */}
      {dataDateLabel && (
        <div className="flex justify-end">
          <span className="text-[11px] text-dim bg-border/30 px-3 py-1 rounded-full">{dataDateLabel}</span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-3">
        <AnimatedStatCard
          label="참여 키워드"
          value={totalKeywords}
          suffix="개"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>}
          color={totalKeywords > 0 ? 'accent' : 'dim'}
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
          value={categoryGroups.length}
          suffix="개"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
          color={categoryGroups.length > 0 ? 'accent' : 'dim'}
          delay={250}
        />
      </div>

      {/* ─── 활동 현황 + 순위별 키워드 분포 ─── */}
      <GlassCard>
        <h3 className="font-bold text-[15px] mb-4">활동 현황</h3>
        <div className="grid grid-cols-3 gap-4 text-center mb-5">
          <div>
            <p className="text-xl font-black font-rank">{formatCount(influencer.subscriber_count || 0)}</p>
            <p className="text-xs text-dim mt-1">팬수</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{totalKeywords}</p>
            <p className="text-xs text-dim mt-1">참여 키워드</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank text-accent">{totalRankedKeywords}</p>
            <p className="text-xs text-dim mt-1">노출 키워드</p>
          </div>
        </div>
        {/* 순위별 키워드 수 (1~5위) */}
        <div className="border-t border-border/50 pt-4">
          <p className="text-[11px] text-dim font-semibold mb-3">순위별 키워드 분포</p>
          <div className="grid grid-cols-5 gap-2 text-center">
            <div className="rounded-xl bg-gold/10 py-2.5">
              <p className="text-lg font-black text-gold">{rank1Count}</p>
              <p className="text-[10px] text-dim font-semibold mt-0.5">1위</p>
            </div>
            <div className="rounded-xl bg-accent/10 py-2.5">
              <p className="text-lg font-black text-accent">{rank2Count}</p>
              <p className="text-[10px] text-dim font-semibold mt-0.5">2위</p>
            </div>
            <div className="rounded-xl bg-accent/10 py-2.5">
              <p className="text-lg font-black text-accent">{rank3Count}</p>
              <p className="text-[10px] text-dim font-semibold mt-0.5">3위</p>
            </div>
            <div className="rounded-xl bg-border/30 py-2.5">
              <p className="text-lg font-black text-dim">{rank4Count}</p>
              <p className="text-[10px] text-dim font-semibold mt-0.5">4위</p>
            </div>
            <div className="rounded-xl bg-border/30 py-2.5">
              <p className="text-lg font-black text-dim">{rank5Count}</p>
              <p className="text-[10px] text-dim font-semibold mt-0.5">5위</p>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ─── 2-1. 키워드챌린지 참여 현황 ─── */}
      <ChallengeStatsSection
        totalKeywords={totalKeywords}
        rankedKeywords={top10Count}
        rank1Count={rank1Count}
        top3Count={top3Count}
        integratedTop3Count={top3Count}
        avgParticipants={avgParticipants}
        compLow={compLow}
        compMid={compMid}
        compHigh={compHigh}
      />

      {/* ─── 2-2. 스마트 알림 (오늘의 액션 포인트) ─── */}
      <SmartAlerts alerts={rankAlerts} />

      {/* ─── 3. 순위 추이 차트 ─── */}
      <RankTrendSection mode="influencer" naverId={naverId} />

      {/* ─── 3-2. 내 포스팅 분석 ─── */}
      <PostAnalysisSection
        posts={myPosts.map(p => ({
          title: p.title,
          url: p.url,
          keywords: p.keywords,
          bestRank: p.bestRank,
          date: p.date,
        }))}
        naverId={naverId}
        canSearchRank={canAccess}
      />

      {/* ─── 4. 변동 피드 ─── */}
      <ActivityFeed events={activityEvents} />

      {/* ─── 5. TOP 5 키워드 ─── */}
      <Top5Keywords rankings={rankings} totalRankedKeywords={totalRankedKeywords} />

      {/* ─── 6. 위젯 (순위 + TOP3 달성률) ─── */}
      <WidgetSection naverId={naverId} />


      {/* ─── 7. 경쟁자 분석 ─── */}
      <CompetitorSection
        naverId={naverId}
        myStats={{ avgRank: Math.round(avgRank * 10) / 10, totalKeywords, top3Count }}
        mySubscriberCount={influencer.subscriber_count || 0}
        myDisplayName={influencer.display_name || '나'}
      />

      {/* ─── 8. 내 키워드 리스트 (주제별, 무료 공개) ─── */}
      <MyKeywordList
        categoryGroups={categoryGroups.map(([category, keywords]) => ({ category, keywords }))}
        totalKeywords={totalKeywords}
        participatedCount={participatedCount}
      />

      {/* 활동 현황은 상단으로 이동됨 */}

      </div>
    </div>
  );
}
