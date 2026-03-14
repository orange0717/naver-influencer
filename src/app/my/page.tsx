import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import CompetitorSection from '@/components/CompetitorSection';
import CopyButton from '@/components/CopyButton';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import RankTrendSection from '@/components/dashboard/RankTrendSection';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import RecommendationGrid from '@/components/dashboard/RecommendationGrid';
import GlassCard from '@/components/dashboard/GlassCard';
import PostAnalysisSection from '@/components/dashboard/PostAnalysisSection';
import KeywordSyncButton from '@/components/dashboard/KeywordSyncButton';
import { generateActivityEvents } from '@/lib/activity-events';

export const dynamic = 'force-dynamic';

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

interface Recommendation {
  keyword_id: string;
  keyword: string;
  category: string;
  participant_count: number;
  search_volume_monthly?: number;
  competition_level?: string;
  recommendation_score: number;
  reason: string;
}

export default async function MyDashboard() {
  const cookieStore = await cookies();
  const naverId = cookieStore.get('naver_id')?.value;

  if (!naverId) {
    redirect('/auth/login');
  }

  const supabase = createServiceClient();

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

  // 구독 상태 확인 (users 테이블에서 linked_influencer_id로 조회)
  const { data: userProfile } = await supabase
    .from('users')
    .select('subscription_status, subscription_expires_at')
    .eq('linked_influencer_id', influencerId)
    .single();

  // 구독 상태: DB 기반 검증 (이용권 or 결제)
  const isSubscribed =
    (userProfile?.subscription_status === 'active' &&
      !!userProfile?.subscription_expires_at &&
      new Date(userProfile.subscription_expires_at) > new Date()) ||
    // 이용권 기반 구독 확인
    await (async () => {
      const { data: license } = await supabase
        .from('licenses')
        .select('expires_at')
        .eq('buyer_id', influencer?.naver_id ?? '')
        .eq('is_used', true)
        .gte('expires_at', new Date().toISOString())
        .limit(1)
        .single();
      return !!license;
    })();

  // 관리자 확인
  const adminIds = (process.env.ADMIN_NAVER_IDS || 'orangebooks07').split(',').map(s => s.trim());
  const isAdmin = adminIds.includes(naverId);
  const canAccess = isSubscribed || isAdmin;

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
  const { data: latestRankings } = await supabase
    .from('keyword_rankings')
    .select(`
      rank_position, previous_rank, rank_change, is_integrated_top3,
      keyword_id, latest_post_title, latest_post_url, snapshot_date,
      keyword_challenges!inner(keyword, category, participant_count, search_volume_monthly)
    `)
    .eq('influencer_id', influencerId)
    .order('snapshot_date', { ascending: false })
    .limit(500);

  const latestByKeyword = new Map<string, (typeof latestRankings extends (infer T)[] | null ? T : never)>();
  for (const r of (latestRankings || [])) {
    if (!latestByKeyword.has(r.keyword_id)) {
      latestByKeyword.set(r.keyword_id, r);
    }
  }
  const currentRankings = Array.from(latestByKeyword.values());

  const rankings = currentRankings.map(r => {
    const kw = r.keyword_challenges as unknown as Record<string, unknown>;
    return {
      keyword_id: r.keyword_id,
      keyword: (kw?.keyword as string) || '',
      category: (kw?.category as string) || '',
      rank_position: r.rank_position,
      rank_change: r.rank_change,
      is_integrated_top3: r.is_integrated_top3,
      participant_count: (kw?.participant_count as number) || 0,
      search_volume: (kw?.search_volume_monthly as number) || 0,
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
  const top5 = rankings.slice(0, 5);
  const rankUpCount = rankings.filter(r => r.rank_change > 0).length;
  const rankDownCount = rankings.filter(r => r.rank_change < 0).length;

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
  const allKeywords = (myKeywords || []).map(ik => {
    const kw = ik.keyword_challenges as unknown as Record<string, unknown>;
    const ranked = rankedMap.get(ik.keyword_id);
    return {
      keyword_id: (kw?.id as string) || ik.keyword_id,
      keyword: (kw?.keyword as string) || '',
      category: (kw?.category as string) || '기타',
      participant_count: (kw?.participant_count as number) || 0,
      search_volume: (kw?.search_volume_monthly as number) || 0,
      rank_position: ranked?.rank_position ?? null,
      rank_change: ranked?.rank_change ?? 0,
    };
  }).sort((a, b) => {
    if (a.rank_position !== null && b.rank_position === null) return -1;
    if (a.rank_position === null && b.rank_position !== null) return 1;
    if (a.rank_position !== null && b.rank_position !== null) return a.rank_position - b.rank_position;
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

  // ─── 3. 오늘의 추천 키워드 ───
  let recommendations: Recommendation[] = [];
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const recRes = await fetch(`${baseUrl}/api/recommendations`, { cache: 'no-store' });
    if (recRes.ok) {
      const recData = await recRes.json();
      recommendations = (recData.recommendations || []).slice(0, 6);
    }
  } catch { /* ignore */ }

  // ─── 4. 활동 이벤트 생성 ───
  const activityEvents = generateActivityEvents(rankings);

  return (
    <div className="space-y-6">

      {/* ─── 1. 프로필 헤더 ─── */}
      <ProfileHeader
        displayName={influencer.display_name}
        imageUrl={influencer.image_url}
        category={influencer.my_keyword_category || influencer.category}
        subscriberCount={influencer.subscriber_count || 0}
        firstSeenAt={influencer.naver_created_at || influencer.first_seen_at}
        type="influencer"
        subscribed={isSubscribed}
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
              <span className="text-dim">유효 키워드 <strong className="text-text font-rank">{totalRankedKeywords}</strong>개</span>
              <span className="text-dim">팬 <strong className="text-text font-rank">{formatCount(influencer.subscriber_count || 0)}</strong></span>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ─── 2. 통계 카드 4개 ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AnimatedStatCard
          label="나의 평균 순위"
          value={avgRank > 0 ? Math.round(avgRank) : 0}
          suffix="위"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>}
          color="accent"
          delay={50}
        />
        <AnimatedStatCard
          label="유효 키워드"
          value={totalRankedKeywords}
          suffix="개"
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>}
          color={totalRankedKeywords > 0 ? 'accent' : 'dim'}
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
      </div>

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

      {/* ─── 프리미엄 영역 (이용권 필요) ─── */}
      {!canAccess && (
        <GlassCard className="text-center py-8">
          <div className="w-14 h-14 mx-auto rounded-full bg-accent/10 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h3 className="font-bold text-base mb-2">프리미엄 분석 기능</h3>
          <p className="text-sm text-dim mb-4 leading-relaxed">
            이용권을 등록하면 더 강력한 분석 도구를 사용할 수 있어요
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-5 text-xs">
            <span className="px-3 py-1.5 bg-border/30 rounded-full text-dim">블로그 검색 순위</span>
            <span className="px-3 py-1.5 bg-border/30 rounded-full text-dim">경쟁자 분석</span>
            <span className="px-3 py-1.5 bg-border/30 rounded-full text-dim">맞춤 추천 키워드</span>
            <span className="px-3 py-1.5 bg-border/30 rounded-full text-dim">순위 위젯</span>
            <span className="px-3 py-1.5 bg-border/30 rounded-full text-dim">전체 키워드 분석</span>
          </div>
          <Link href="/subscribe" className="px-8 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-sm inline-block">
            이용권 등록하기
          </Link>
          <p className="text-[11px] text-dim mt-3">키워드·랭킹·인플루언서 검색은 무료입니다</p>
        </GlassCard>
      )}

      {canAccess && (
      <>
      {/* ─── 4. 변동 피드 + 추천 키워드 (2열) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ActivityFeed events={activityEvents} />
        </div>
        <div className="lg:col-span-2">
          <RecommendationGrid recommendations={recommendations} compact />
        </div>
      </div>

      {/* ─── 5. TOP 5 키워드 ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <h3 className="font-bold text-[15px]">TOP 5 키워드</h3>
          {top5.length > 0 && (
            <span className="text-[11px] text-dim">{totalRankedKeywords}개 중</span>
          )}
        </div>
        {top5.length > 0 ? (
          <div className="divide-y divide-border/20">
            {top5.map((r, i) => (
              <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition group">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                    i === 0 ? 'bg-gold/20 text-gold' : i <= 2 ? 'bg-accent/15 text-accent' : 'bg-border/50 text-dim'
                  }`}>{i + 1}</span>
                  <div className="min-w-0">
                    <span className="font-semibold text-sm truncate block group-hover:text-accent transition-colors">{r.keyword}</span>
                    <span className="text-xs text-dim">{r.category} · {r.participant_count}명 참여{r.search_volume > 0 ? ` · 월 ${formatCount(r.search_volume)}회` : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {r.rank_change !== 0 && (
                    <span className={`text-xs font-bold ${r.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                      {r.rank_change > 0 ? '▲' : '▼'}{Math.abs(r.rank_change)}
                    </span>
                  )}
                  <span className={`text-sm font-black font-rank ${r.rank_position <= 3 ? 'text-accent' : ''}`}>
                    {r.rank_position}위
                  </span>
                  {r.is_integrated_top3 && <span className="text-xs font-bold text-gold">T3</span>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-dim text-sm">
            <p>아직 순위 데이터가 없습니다.</p>
            <p className="text-xs mt-1">데이터 수집이 매일 자동으로 진행됩니다.</p>
          </div>
        )}
      </GlassCard>

      {/* ─── 6. 순위 위젯 ─── */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-[15px]">키워드 순위 위젯</h3>
            <p className="text-[11px] text-dim mt-0.5">내 블로그에 키워드 순위 뱃지를 달아보세요</p>
          </div>
          <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full font-bold">NEW</span>
        </div>
        <div className="flex justify-center mb-4 p-4 bg-bg rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/widget/rank/${naverId}`} alt="키워드 순위 위젯" width={250} height={180} className="rounded-lg" />
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-dim mb-1.5">HTML 코드 (블로그 사이드바에 붙여넣기)</p>
            <div className="relative">
              <code className="block bg-bg border border-border rounded-lg p-3 text-[11px] text-dim font-mono break-all leading-relaxed select-all">
                {`<a href="https://naver-influencer.vercel.app/my" target="_blank" rel="noopener"><img src="https://naver-influencer.vercel.app/api/widget/rank/${naverId}" alt="N인플 키워드 순위" width="250" /></a>`}
              </code>
              <CopyButton text={`<a href="https://naver-influencer.vercel.app/my" target="_blank" rel="noopener"><img src="https://naver-influencer.vercel.app/api/widget/rank/${naverId}" alt="N인플 키워드 순위" width="250" /></a>`} />
            </div>
          </div>
          <p className="text-[10px] text-dim leading-relaxed">* 위젯은 매일 자동으로 업데이트됩니다.</p>
        </div>
      </GlassCard>

      {/* ─── 6-2. 블로그 순위 위젯 (HTML/iframe) ─── */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-[15px]">블로그 순위 위젯</h3>
            <p className="text-[11px] text-dim mt-0.5">BlogChart 스타일 순위 배지를 블로그에 달아보세요</p>
          </div>
          <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full font-bold">NEW</span>
        </div>
        <div className="flex justify-center mb-4 p-4 bg-bg rounded-xl">
          <iframe
            src={`/api/widget/rank-card/${naverId}`}
            width={200}
            height={280}
            style={{ border: 'none', overflow: 'hidden' }}
            title="N인플 순위 위젯"
          />
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-dim mb-1.5">HTML 코드 (블로그 사이드바에 붙여넣기)</p>
            <div className="relative">
              <code className="block bg-bg border border-border rounded-lg p-3 text-[11px] text-dim font-mono break-all leading-relaxed select-all">
                {`<iframe src="https://ninfl.co/api/widget/rank-card/${naverId}" width="200" height="280" frameborder="0" scrolling="no" style="border:none;overflow:hidden"></iframe>`}
              </code>
              <CopyButton text={`<iframe src="https://ninfl.co/api/widget/rank-card/${naverId}" width="200" height="280" frameborder="0" scrolling="no" style="border:none;overflow:hidden"></iframe>`} />
            </div>
          </div>
          <p className="text-[10px] text-dim leading-relaxed">* 위젯은 매일 자동으로 업데이트됩니다. iframe 방식으로 어떤 블로그에든 적용 가능합니다.</p>
        </div>
      </GlassCard>

      {/* ─── 7. 경쟁자 분석 ─── */}
      <CompetitorSection
        naverId={naverId}
        myStats={{ avgRank: Math.round(avgRank * 10) / 10, totalKeywords, top3Count }}
      />

      </>
      )}

      {/* ─── 8. 내 키워드 리스트 (주제별, 무료 공개) ─── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[15px]">내 키워드 리스트</h3>
          <span className="text-xs text-dim">{categoryGroups.length}개 주제 · {totalKeywords}개 키워드</span>
        </div>

        {categoryGroups.length > 0 ? (
          categoryGroups.map(([category, keywords]) => (
            <GlassCard key={category} padding="none">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-bg/30">
                <span className="text-sm font-bold">{category}</span>
                <span className="text-xs text-dim font-rank">{keywords.length}개</span>
              </div>
              <div className="divide-y divide-border/20">
                {keywords.map(kw => (
                  <Link key={kw.keyword_id} href={`/keywords/${kw.keyword_id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-surface-hover transition">
                    <div className="min-w-0">
                      <span className="text-sm truncate block">{kw.keyword}</span>
                      <span className="text-xs text-dim">
                        {kw.participant_count}명 참여
                        {kw.search_volume > 0 ? ` · 월 ${formatCount(kw.search_volume)}회` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {kw.rank_change !== 0 && (
                        <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                          {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                        </span>
                      )}
                      {kw.rank_position !== null ? (
                        <span className={`text-xs font-black font-rank px-2 py-0.5 rounded ${
                          kw.rank_position <= 3 ? 'bg-accent/15 text-accent' : 'bg-border/30 text-dim'
                        }`}>
                          {kw.rank_position}위
                        </span>
                      ) : (
                        <span className="text-xs text-dim">순위 없음</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </GlassCard>
          ))
        ) : (
          <GlassCard>
            <KeywordSyncButton />
          </GlassCard>
        )}
      </div>

      {/* ─── 9. 활동 현황 (무료) ─── */}
      <GlassCard>
        <h3 className="font-bold text-[15px] mb-4">활동 현황</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-black font-rank">{formatCount(influencer.subscriber_count || 0)}</p>
            <p className="text-xs text-dim mt-1">팬수</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{totalKeywords}</p>
            <p className="text-xs text-dim mt-1">참여 키워드</p>
          </div>
          <div>
            <p className="text-xl font-black font-rank">{totalRankedKeywords}</p>
            <p className="text-xs text-dim mt-1">순위 키워드</p>
          </div>
        </div>
      </GlassCard>

      </div>
    </div>
  );
}
