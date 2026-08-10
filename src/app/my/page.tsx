import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createServiceClient, createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { formatCount } from '@/lib/format';
import { cookies } from 'next/headers';
import { isTrialExpired } from '@/lib/trial';
import Top5Keywords from '@/components/dashboard/Top5Keywords';
import RankDistribution from '@/components/dashboard/RankDistribution';
import ProfileHeader from '@/components/dashboard/ProfileHeader';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import RankTrendSection from '@/components/dashboard/RankTrendSection';
import BlogVisitorChart from '@/components/dashboard/BlogVisitorChart';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import DashboardCard from '@/components/dashboard/DashboardCard';
import KpiGrid from '@/components/dashboard/KpiGrid';
import ChallengeStatsSection from '@/components/dashboard/ChallengeStatsSection';
import CategoryStrengthSection from '@/components/dashboard/CategoryStrengthSection';
import TopicPerformanceSection, { type TopicPerformanceRow } from '@/components/dashboard/TopicPerformanceSection';
import MyKeywordList from '@/components/dashboard/MyKeywordList';
import { generateActivityEvents } from '@/lib/activity-events';
import { analyzeRankAlerts } from '@/lib/rank-alerts';
import SmartAlerts from '@/components/dashboard/SmartAlerts';
import DailyBriefing from '@/components/dashboard/DailyBriefing';
import TrialBanner from '@/components/TrialBanner';
import SubscriptionExpiryBanner from '@/components/SubscriptionExpiryBanner';
import { after } from 'next/server';
import { refreshFollowerCount } from '@/lib/refresh-follower';
import { getBlogVisitorSummary } from '@/lib/blog-crawler';
import { fetchBlogPostList } from '@/lib/blog-posts-fetcher';
import { parseNaverPostDate } from '@/lib/naver-date';
import { calculateMissingRate, countMissing, type MissingResultsMap, type PostLike } from '@/lib/missing-rate';

import { classifyKeyword, GuestDashboard } from './page.helpers';

/** 외부 크롤링(방문자/포스트 목록)이 오래 걸려도 대시보드 전체 렌더가 막히지 않도록 상한을 둔다 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}
export const dynamic = 'force-dynamic';
// DB 쿼리(특히 keyword_rankings 1.5억 행 스캔)가 10~24초까지 걸릴 수 있어,
// Vercel 기본 함수 타임아웃(10초)에 걸려 응답이 중간에 끊기고 로딩 화면에서
// 멈춰버리는 문제(오렌지 리포트: "데이터가 안 뜹니다")를 막기 위한 안전장치.
// 근본 해결은 migration-114 인덱스 적용.
export const maxDuration = 30;

export default async function MyDashboard({ searchParams }: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
  const supabase = createServiceClient();
  let naverId: string | undefined;
  let internalUserId: string | undefined;
  /** 로그인 사용자의 가입 시 선택 주제 — 인플 주력 필드가 비어 있을 때 `/my` 주제 한정에 사용 */
  let signupKeywordCategoryFromUser: string | null = null;
  let subscriptionPlan: string | null = null;
  let subscriptionExpiresAt: string | null = null;
  const params = await searchParams;

  const cookieStore = await cookies();
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  let isLoggedIn = false;

  // ─── 1. Supabase 세션 우선 (가입 후 무료·유료 플랜은 여기서만 판정) ───
  if (authUser) {
    isLoggedIn = true;

    // 관리자/활성 유료 구독자는 무조건 통과. 그 외에만 제한 체크.
    const { isRestricted, getPaywallContext } = await import('@/lib/admin');
    const ctx = await getPaywallContext(authUser.id, authUser.email);
    if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
      if (await isRestricted(authUser.email)) {
        redirect('/subscribe');
      }
    }

    const { data: profile } = await supabase
      .from('users')
      .select('id, linked_influencer_id, blog_id, subscription_plan, subscription_expires_at, signup_keyword_category')
      .eq('auth_id', authUser.id)
      .single();

    subscriptionPlan = profile?.subscription_plan || null;
    subscriptionExpiresAt = profile?.subscription_expires_at || null;
    signupKeywordCategoryFromUser = profile?.signup_keyword_category?.trim() || null;
    internalUserId = profile?.id || undefined;

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
  } else {
    // ─── 2. 비로그인: 데모 체험 쿠키는 값 자체를 신뢰하지 않고 demo_sessions DB로 실재/만료를 검증 ───
    // (httpOnly 쿠키라도 서명되어 있지 않아 curl 등 raw 요청으로 위조 가능 — ?demo= 쿼리 파라미터 폴백도
    //  검증 없이 임의 naver_id를 그대로 신뢰하는 구멍이라 제거)
    if (cookieStore.get('demo_mode')?.value === 'true') {
      const cookieNaverId = cookieStore.get('naver_id')?.value;
      if (cookieNaverId) {
        const { data: demoSession } = await supabase
          .from('demo_sessions')
          .select('expires_at')
          .eq('naver_id', cookieNaverId)
          .maybeSingle();
        if (demoSession && new Date(demoSession.expires_at).getTime() > Date.now()) {
          naverId = cookieNaverId;
        }
      }
    }
  }

  /** UI용: 정식 로그인이 아닐 때만 데모 배너 등에 사용 */
  const isDemo = !isLoggedIn && cookieStore.get('demo_mode')?.value === 'true';

  if (!naverId) {
    if (isLoggedIn) {
      redirect('/profile');
    }
    // 비로그인(게스트): 강제 리다이렉트 없이 MY 대시보드의 빈 상태(Empty State)를 렌더.
    return <GuestDashboard />;
  }

  // 체험/데모 만료 체크 — 정식 로그인 사용자는 trial_started 잔존 쿠키와 무관하게 여기서 차단하지 않음
  const trialStarted = cookieStore.get('trial_started')?.value;
  const isTrial = !!trialStarted;
  const trialExpired = isTrialExpired(trialStarted);
  const hasActivePlan = !!(
    subscriptionPlan &&
    subscriptionExpiresAt &&
    new Date(subscriptionExpiresAt).getTime() > Date.now()
  );
  if (!isLoggedIn && trialExpired && !hasActivePlan) {
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
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="font-title text-xl font-bold text-text mb-3">내 대시보드</h1>
        <p className="text-sm text-dim mb-6 leading-relaxed">
          연결된 인플루언서 정보를 찾을 수 없습니다. 로그인 후 프로필에서 블로그를 연결하거나 데모 체험을 이용해 보세요.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/auth/login?redirect=/my"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition-colors"
          >
            로그인
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-border bg-surface font-semibold text-sm hover:border-accent transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  const influencerId = influencerData.id;

  // ─── 병렬 프리페치: naverId/internalUserId만 있으면 되고 rankings·keywords 계산과
  // 데이터 의존성이 없는 것들을 여기서 미리 시작해, 아래 refreshFollowerCount(최대 13초)와
  // 겹쳐서 실행되게 한다. 실제 await은 각자 원래 쓰이던 위치에서 한다. ───
  const topicCountPromise: Promise<number> = (async () => {
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
        const topicMatch = html.match(/토픽\s*(\d+)/);
        if (topicMatch) return parseInt(topicMatch[1]);
        const jsonMatch = html.match(/"topicCount"\s*:\s*(\d+)/);
        if (jsonMatch) return parseInt(jsonMatch[1]);
      }
    } catch {
      // 토픽 크롤링 실패 무시
    }
    return 0;
  })();

  const aiVisibilityPromise: Promise<{ exposedCount: number; tabExposedCount: number; checkedCount: number; exposedThisWeek: number; tabExposedThisWeek: number } | null> =
    (internalUserId && naverId)
      ? (async () => {
          const { data: briefingRows } = await supabase
            .from('ai_briefing_exposures')
            .select('exposed, tab_exposed, checked_at')
            .eq('user_id', internalUserId)
            .eq('blog_id', naverId)
            .not('checked_at', 'is', null);
          if (briefingRows && briefingRows.length > 0) {
            const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
            return {
              checkedCount: briefingRows.length,
              exposedCount: briefingRows.filter((r) => r.exposed === true).length,
              tabExposedCount: briefingRows.filter((r) => r.tab_exposed === true).length,
              exposedThisWeek: briefingRows.filter((r) => r.exposed === true && new Date(r.checked_at as string).getTime() >= weekAgoMs).length,
              tabExposedThisWeek: briefingRows.filter((r) => r.tab_exposed === true && new Date(r.checked_at as string).getTime() >= weekAgoMs).length,
            };
          }
          return null;
        })()
      : Promise.resolve(null);

  /** 대시보드 허브 — 누락률 카드: 누락률 메뉴가 이미 검사 결과를 저장해두는 post_missing_checks를 그대로 재집계 */
  const missingSummaryPromise: Promise<{ rate: number; missingCount: number; totalChecked: number }> = naverId
    ? (async () => {
        const { data: rows } = await supabase
          .from('post_missing_checks')
          .select('post_id, view_exposed, view_rank, blog_exposed, blog_rank')
          .eq('blog_id', naverId)
          .not('checked_at', 'is', null);
        if (!rows || rows.length === 0) return { rate: 0, missingCount: 0, totalChecked: 0 };
        const results: MissingResultsMap = {};
        const posts: PostLike[] = [];
        for (const r of rows) {
          results[r.post_id] = {
            blogTab: { exposed: r.blog_exposed, rank: r.blog_rank },
            viewTab: { exposed: r.view_exposed, rank: r.view_rank },
          };
          posts.push({ id: r.post_id });
        }
        return {
          rate: calculateMissingRate(posts, results),
          missingCount: countMissing(posts, results),
          totalChecked: posts.length,
        };
      })()
    : Promise.resolve({ rate: 0, missingCount: 0, totalChecked: 0 });

  /**
   * 대시보드 허브 — 방문자 카드: 조회수 차트(BlogVisitorChart)와 동일한 공용 함수 재사용.
   * fetchBlogVisitors가 순차 2회 요청(각 AbortSignal.timeout 8초)까지 갈 수 있어 최악 16초 소요 —
   * 기존 8초 타임아웃은 이 재크롤링을 중간에 잘라 DB에 최신값이 반영되기 전에 폴백 0을 반환했고,
   * 그 결과 KPI 카드("오늘 0")와 같은 데이터를 쓰는 그래프(BlogVisitorChart)의 값이 어긋났다.
   */
  const visitorSummaryPromise: Promise<{ todayVisitors: number; totalVisitors: number }> = naverId
    ? withTimeout(
        getBlogVisitorSummary(naverId, 30).then((s) => ({ todayVisitors: s.todayVisitors, totalVisitors: s.totalVisitors })),
        20000,
        { todayVisitors: 0, totalVisitors: 0 },
      )
    : Promise.resolve({ todayVisitors: 0, totalVisitors: 0 });

  /** 대시보드 허브 — 전체 포스팅 카드: 포스팅 분석 메뉴와 동일한 목록 조회 함수 재사용(최신 50건 기준 주/월 집계) */
  const postSummaryPromise: Promise<{ totalCount: number; weeklyCount: number; monthlyCount: number }> = naverId
    ? withTimeout(
        fetchBlogPostList(naverId, 1, 50).then(({ posts, totalCount }) => {
          const now = Date.now();
          const weeklyCount = posts.filter((p) => {
            const t = parseNaverPostDate(p.date);
            return t !== null && now - t <= 7 * 24 * 60 * 60 * 1000;
          }).length;
          const monthlyCount = posts.filter((p) => {
            const t = parseNaverPostDate(p.date);
            return t !== null && now - t <= 30 * 24 * 60 * 60 * 1000;
          }).length;
          return { totalCount, weeklyCount, monthlyCount };
        }),
        6000,
        { totalCount: 0, weeklyCount: 0, monthlyCount: 0 },
      )
    : Promise.resolve({ totalCount: 0, weeklyCount: 0, monthlyCount: 0 });

/** 대시보드 허브 — 토픽 카드 + 토픽 성과 테이블: curate-blog-topics 크론이 채우는 topics 재사용 */
  const topicSummaryPromise: Promise<{ count: number; topName: string | null; topics: TopicPerformanceRow[] }> = (internalUserId && naverId)
    ? (async () => {
        const { data } = await supabase
          .from('topics')
          .select('id, topic_type, name, post_count, total_view_count, last_post_at, avg_integrated_rank, avg_blog_rank, ai_briefing_count, ai_tab_count, challenge_top3_count, new_posts_30d, is_representative')
          .eq('user_id', internalUserId)
          .eq('blog_id', naverId)
          .order('is_representative', { ascending: false })
          .order('post_count', { ascending: false })
          .order('total_view_count', { ascending: false });
        const rows = data || [];
        const topics: TopicPerformanceRow[] = rows.map(r => ({
          id: r.id as string,
          topicType: r.topic_type as string,
          name: r.name as string,
          postCount: r.post_count as number,
          lastPostAt: r.last_post_at as string | null,
          avgIntegratedRank: r.avg_integrated_rank as number | null,
          avgBlogRank: r.avg_blog_rank as number | null,
          aiBriefingCount: (r.ai_briefing_count as number | null) ?? 0,
          aiTabCount: (r.ai_tab_count as number | null) ?? 0,
          challengeTop3Count: (r.challenge_top3_count as number | null) ?? 0,
          newPosts30d: (r.new_posts_30d as number | null) ?? 0,
          isRepresentative: !!r.is_representative,
        }));
        const topName = topics.find(t => t.isRepresentative)?.name ?? topics[0]?.name ?? null;
        return { count: topics.length, topName, topics };
      })()
    : Promise.resolve({ count: 0, topName: null, topics: [] });

  const mateStatusPromise: Promise<{ selected: boolean; expertiseValue: string | null } | null> = naverId
    ? (async () => {
        const { data: mateRow } = await supabase
          .from('naver_mates')
          .select('id')
          .eq('platform', 'blog')
          .eq('platform_key', naverId)
          .maybeSingle();
        if (mateRow) {
          const { data: monthlyRow } = await supabase
            .from('naver_mate_monthly')
            .select('expertise_value')
            .eq('mate_id', mateRow.id)
            .order('year', { ascending: false })
            .order('month', { ascending: false })
            .limit(1)
            .maybeSingle();
          return { selected: true, expertiseValue: monthlyRow?.expertise_value || null };
        }
        return { selected: false, expertiseValue: null };
      })()
    : Promise.resolve(null);

  // 인플루언서 정보를 먼저 조회해 페이지 렌더는 절대 기다리지 않게 하고,
  // 팬수 갱신(KST 6시간 창당 최대 1회, refresh-follower)은 응답 전송 후 백그라운드에서 처리.
  // in.naver.com 외부 fetch(최대 8초+5초)가 이 요청의 렌더링을 막지 않는다 — 갱신된 값은
  // DB에는 반영되고, 화면에는 다음 방문 때부터 보인다(최대 6시간 창 지연은 기존과 동일한 정책).
  const { data: influencer } = await supabase.from('influencers').select('*').eq('id', influencerId).single();
  after(() => {
    refreshFollowerCount(supabase, influencerId, naverId!).catch(() => {});
  });

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

  // TEMP DEBUG (원인 특정 후 제거 예정): 렌더 도중 예외가 스트리밍 커밋 이후 발생하면
  // Next가 error.tsx로 전환하지 못하고 loading.tsx에 무한히 멈추는 문제(오렌지 리포트)를
  // 진단하기 위해 예외를 화면에 직접 노출한다.
  try {

  // ─── 1. 최신 순위 데이터 (keyword_rankings) ───
  // crawl-challenge-ranks가 부분 적재로 끊기면 오늘 snapshot_date에 일부만 들어가,
  // 기존 "최신 snapshot 1일치만" 로직이 어제 풀 데이터를 통째로 가려버린다.
  // 최근 7일을 가져와 keyword_id별 가장 최신 record만 남긴다.
  type RankingRow = {
    rank_position: number;
    previous_rank: number | null;
    rank_change: number;
    is_integrated_top3: boolean;
    keyword_id: string;
    latest_post_title: string | null;
    latest_post_url: string | null;
    snapshot_date: string;
    blog_search_rank: number | null;
    view_tab_rank: number | null;
    keyword_challenges: unknown;
  };

  interface KeywordChallengeJoin {
    keyword: string;
    category: string;
    participant_count: number;
    search_volume_monthly: number;
  }

  const sinceDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  // recentRows 페이지네이션 루프와 myKeywords 조회는 둘 다 influencerId만 필요해
  // 데이터 의존성이 없으므로 병렬로 실행한다 (myKeywords는 원래 아래쪽에서 쓰임).
  const recentRowsPromise: Promise<RankingRow[]> = (async () => {
    const rows: RankingRow[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: batch } = await supabase
        .from('keyword_rankings')
        .select(`
          rank_position, previous_rank, rank_change, is_integrated_top3,
          keyword_id, latest_post_title, latest_post_url, snapshot_date,
          blog_search_rank, view_tab_rank,
          keyword_challenges(keyword, category, participant_count, search_volume_monthly)
        `)
        .eq('influencer_id', influencerId)
        .gte('snapshot_date', sinceDate)
        .order('snapshot_date', { ascending: false })
        .range(from, from + PAGE - 1);
      if (!batch || batch.length === 0) break;
      rows.push(...(batch as unknown as RankingRow[]));
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  })();

  const myKeywordsPromise = supabase
    .from('influencer_keywords')
    .select(`keyword_id, keyword_challenges(id, keyword, category, participant_count, search_volume_monthly)`)
    .eq('influencer_id', influencerId);

  const [recentRows, { data: myKeywords }] = await Promise.all([recentRowsPromise, myKeywordsPromise]);

  const seenKw = new Set<string>();
  let latestRankings = recentRows.filter(r => {
    if (seenKw.has(r.keyword_id)) return false;
    seenKw.add(r.keyword_id);
    return true;
  });

  /** 프로필 주력(도서/경제 등)이 있으면 순위·키워드·미참여 풀은 그 주제만 사용 */
  const myCategory =
    signupKeywordCategoryFromUser ||
    influencer.my_keyword_category ||
    influencer.category ||
    '';
  const topicScope = myCategory.trim();
  if (topicScope.length > 0) {
    latestRankings = latestRankings.filter((r) => {
      const kw = r.keyword_challenges as unknown as KeywordChallengeJoin;
      return (kw?.category || '').trim() === topicScope;
    });
  }

  const currentRankings = latestRankings;

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

  // ─── 토픽 수 (컴포넌트 진입 직후 미리 시작해둔 fetch를 여기서 회수) ───
  const topicCount = await topicCountPromise;

  // 통계 계산
  const totalRankedKeywords = rankings.length;
  const top3Count = rankings.filter(r => r.rank_position <= 3).length;
  const rank1Count = rankings.filter(r => r.rank_position === 1).length;
  const top10Count = rankings.filter(r => r.rank_position <= 10).length;
  const integratedCount = rankings.filter(r => r.is_integrated_top3).length;
  const rankUpCount = rankings.filter(r => r.rank_change > 0).length;
  const rankDownCount = rankings.filter(r => r.rank_change < 0).length;
  const avgRankValue = totalRankedKeywords > 0
    ? parseFloat((rankings.reduce((s, r) => s + r.rank_position, 0) / totalRankedKeywords).toFixed(1))
    : 0;

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

  const avgParticipants = rankings.length > 0
    ? Math.round(rankings.reduce((s, r) => s + r.participant_count, 0) / rankings.length)
    : 0;

  // ─── 1-2. 전체 순위 & 카테고리 순위 계산 (myCategory / topicScope는 순위 구간 위에서 정의)
  // 카테고리 순위 계산 (인플루언서는 카테고리끼리 경쟁)
  // DB 레벨에서 카테고리 필터링 → 단일 쿼리로 순위/총원 계산
  let categoryRank = 0;
  let categoryTotal = 0;
  const myKeywordScore = influencer.keyword_score || 0;
  // totalCount는 keyword_score > 0인 인플루언서만 집계 대상(=경쟁 풀)으로 삼는다.
  // 내 점수가 0이면 애초에 그 풀에 속하지 않으므로 순위를 매기지 않는다.
  // (이전엔 이 가드가 없어 0점 유저가 higherCount+1로 순위에 포함되면서
  //  totalCount 분모엔 빠져 "56위/55" 같은 분자>분모 오류가 났다.)
  if (myCategory && myKeywordScore > 0) {
    // 같은 카테고리에서 나보다 점수 높은 사람 수 = 내 순위 - 1 / 전체 인원수(경쟁 풀) 를 병렬로 조회
    const [{ count: higherCount }, { count: totalCount }] = await Promise.all([
      supabase
        .from('influencers')
        .select('id', { count: 'exact', head: true })
        .gt('keyword_score', myKeywordScore)
        .or(`my_keyword_category.eq.${myCategory},and(my_keyword_category.is.null,category.eq.${myCategory})`),
      supabase
        .from('influencers')
        .select('id', { count: 'exact', head: true })
        .gt('keyword_score', 0)
        .or(`my_keyword_category.eq.${myCategory},and(my_keyword_category.is.null,category.eq.${myCategory})`),
    ]);

    categoryRank = (higherCount || 0) + 1;
    categoryTotal = totalCount || 0;
  }

  // ─── 2. 내 키워드 전체 목록 (myKeywords는 위 recentRowsPromise와 병렬로 이미 조회됨) ───
  const rankedMap = new Map(rankings.map(r => [r.keyword_id, r]));
  const ikKeywordIds = new Set((myKeywords || []).map(ik => ik.keyword_id));

  interface KeywordChallengeWithId extends KeywordChallengeJoin {
    id: string;
  }

  // influencer_keywords 기반 키워드 (참여 키워드)
  let participatedKeywords = (myKeywords || []).map(ik => {
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

  if (topicScope.length > 0) {
    participatedKeywords = participatedKeywords.filter(
      (kw) => (kw.category || '').trim() === topicScope
    );
  }

  // 참여 키워드의 카테고리 목록 추출
  const participatedCategories = [...new Set(participatedKeywords.map(kw => kw.category).filter(Boolean))];
  const participatedKeywordIds = new Set(participatedKeywords.map(kw => kw.keyword_id));

  /** 미참여 챌린지 풀: 프로필 주력이 있으면 그 주제만, 없으면 참여 중인 주제 전부 */
  const challengePoolCategories =
    topicScope.length > 0 ? [topicScope] : participatedCategories;

  // 해당 카테고리의 전체 키워드 조회 (미참여 키워드 포함)
  // Supabase 기본 1000건 제한 해제
  let categoryAllKeywords: { id: string; keyword: string; category: string; participant_count: number; search_volume_monthly: number }[] = [];
  if (challengePoolCategories.length > 0) {
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: batch } = await supabase
        .from('keyword_challenges')
        .select('id, keyword, category, participant_count, search_volume_monthly')
        .in('category', challengePoolCategories)
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

  /** 추천·기본 뷰: 프로필 주력이 있으면 항상 그 주제 기준(미참여 풀도 동일 주제로만 채워짐) */
  const recommendationCategory =
    topicScope.length > 0 ? topicScope : categoryGroups[0]?.[0] ?? '';
  const notParticipatedForRecommendations = recommendationCategory
    ? notParticipatedKeywords.filter((kw) => kw.category === recommendationCategory)
    : notParticipatedKeywords;

  const catStatMap = new Map<string, { total: number; top10: number; sumRank: number }>();
  for (const kw of participatedKeywords) {
    const topic = classifyKeyword(kw.keyword, kw.category);
    const entry = catStatMap.get(topic) || { total: 0, top10: 0, sumRank: 0 };
    entry.total++;
    if (kw.rank_position && kw.rank_position <= 10) entry.top10++;
    entry.sumRank += kw.rank_position || 0;
    catStatMap.set(topic, entry);
  }
  const categoryStats = Array.from(catStatMap.entries())
    .map(([category, s]) => ({
      category,
      totalKeywords: s.total,
      top10Count: s.top10,
      top10Rate: s.total > 0 ? Math.round((s.top10 / s.total) * 100) : 0,
      avgRank: s.total > 0 ? parseFloat((s.sumRank / s.total).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.top10Rate - a.top10Rate || a.avgRank - b.avgRank);

  // ─── 3. 활동 이벤트 생성 (7일 누적 변동 기준) ───
  // 키워드별 가장 오래된 record를 baseline으로 잡아 latest와의 단계차를 cumulativeChange로 사용.
  const oldestByKw = new Map<string, RankingRow>();
  for (const row of recentRows) {
    const ex = oldestByKw.get(row.keyword_id);
    if (!ex || row.snapshot_date < ex.snapshot_date) oldestByKw.set(row.keyword_id, row);
  }
  const weeklyEventInputs = currentRankings.map(latest => {
    const oldest = oldestByKw.get(latest.keyword_id);
    const sameRecord = !oldest || oldest.snapshot_date === latest.snapshot_date;
    const baseline = sameRecord
      ? (latest.previous_rank ?? latest.rank_position + latest.rank_change)
      : oldest!.rank_position;
    let cumulativeChange = baseline - latest.rank_position;
    // 7일 구간에 스냅샷이 1회뿐이면 누적이 0으로만 나오는 경우가 많음 → DB 일간 rank_change로 보완
    if (cumulativeChange === 0 && latest.rank_change !== 0) {
      cumulativeChange = latest.rank_change;
    }
    const kw = latest.keyword_challenges as unknown as KeywordChallengeJoin;
    return {
      keyword_id: latest.keyword_id,
      keyword: kw?.keyword || '',
      rank_position: latest.rank_position,
      rank_change: cumulativeChange,
      is_integrated_top3: latest.is_integrated_top3,
      participant_count: kw?.participant_count || 0,
    };
  });
  const activityEvents = generateActivityEvents(weeklyEventInputs);

  // ─── 5. 스마트 알림 (순위 트렌드 분석) ───
  const rankAlerts = analyzeRankAlerts(latestRankings || []);

  // ─── 6. NGI(Ninfle Growth Index) 계산용 데이터 수집 ───
  // AI 가시성: 네이버메이트에서 실제로 확인(checked_at 존재)한 건만 집계 — 한 번도 안 썼으면 null(측정 불가)
  // 네이버 메이트 선정 여부(블로그 홈 경로 = naverId 로 매칭) 포함, 둘 다 컴포넌트 진입 직후 미리 시작해둔 fetch를 여기서 회수
  // ─── 7. 대시보드 허브 KPI (누락률/방문자/전체 포스팅) — 컴포넌트 진입 직후 미리 시작해둔 fetch를 여기서 회수
  const [aiVisibility, mateStatus, missingSummary, visitorSummary, postSummary, topicSummary] = await Promise.all([
    aiVisibilityPromise,
    mateStatusPromise,
    missingSummaryPromise,
    visitorSummaryPromise,
    postSummaryPromise,
    topicSummaryPromise,
  ]);

  return (
    <div className="space-y-5">

      {/* ─── 체험/데모 배너 ─── */}
      {!isLoggedIn && isTrial && <TrialBanner isDemo={isDemo} />}

      {/* ─── 구독 만료 임박/만료 배너 ─── */}
      <SubscriptionExpiryBanner
        subscriptionPlan={subscriptionPlan}
        subscriptionExpiresAt={subscriptionExpiresAt}
      />


      {/* ─── 1. 프로필 헤더 ─── */}
      <ProfileHeader
        displayName={influencer.display_name}
        imageUrl={influencer.image_url}
        category={influencer.my_keyword_category || influencer.category}
        subscriberCount={influencer.subscriber_count || influencer.total_follower_count || 0}
        firstSeenAt={influencer.naver_created_at || undefined}
        type="influencer"
        subscribed={!!subscriptionPlan}
        subscriptionPlan={subscriptionPlan}
        subscriptionExpiresAt={subscriptionExpiresAt}
        top3Count={top3Count}
        totalKeywords={participatedCount}
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

      {/* ─── 네이버 메이트 선정 뱃지 (선정된 경우만 노출) ─── */}
      {mateStatus?.selected && (
        <div className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-4 py-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-gold shrink-0"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          <span className="text-[13px] font-bold text-text">네이버 메이트 선정</span>
          {mateStatus.expertiseValue && (
            <span className="text-[11px] text-dim">· {mateStatus.expertiseValue}</span>
          )}
        </div>
      )}

      {/* ─── 무료 공개 영역 (항상 보임) ─── */}
      <div className="space-y-5">

      {/* 상세 통계 바 */}
      {categoryRank > 0 && (
        <div className="bg-surface border border-border rounded-lg shadow-xs px-5 py-3">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs">
            <span className="text-dim">카테고리 순위 <strong className="text-text font-rank">{categoryRank}</strong>위{categoryTotal > 0 ? `/${categoryTotal}` : ''}</span>
            <span className="text-dim">1위 키워드 <strong className="text-text font-rank">{rank1Count}</strong>개</span>
            <span className="text-dim">TOP 3 <strong className="text-text font-rank">{top3Count}</strong>개</span>
            <span className="text-dim">TOP 10 <strong className="text-text font-rank">{top10Count}</strong>개</span>
            <span className="text-dim">순위 수집 <strong className="text-text font-rank">{totalRankedKeywords}</strong>건</span>
            <span className="text-dim">참여 키워드 <strong className="text-text font-rank">{participatedCount}</strong>개</span>
            <span className="text-dim">토픽 <strong className="text-text font-rank">{topicCount}</strong>개</span>
            <span className="text-dim">팬 <strong className="text-text font-rank">{formatCount(influencer.subscriber_count || influencer.total_follower_count || 0)}</strong></span>
          </div>
          {participatedCount > totalRankedKeywords && (
            <p className="text-center text-[10px] text-dim mt-2 leading-snug">
              순위 분포·1·TOP3·TOP10은 최근 수집된 순위가 있는 키워드만 집계합니다. 참여는 미수집·다른 주제 제외 전부입니다.
            </p>
          )}
        </div>
      )}

      {/* ─── 2. 대시보드 허브 KPI ─── 각 메뉴의 핵심 지표를 요약하고, 클릭하면 해당 메뉴로 이동 */}
      <KpiGrid>
        <AnimatedStatCard
          size="stat"
          label="누락률"
          value={missingSummary.rate}
          suffix="%"
          placeholder={missingSummary.totalChecked === 0 ? '—' : '0%'}
          description={missingSummary.totalChecked > 0 ? `누락포스팅 ${missingSummary.missingCount}건` : '누락률 메뉴에서 검사해보세요'}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>}
          color={missingSummary.totalChecked === 0 ? 'dim' : missingSummary.rate > 0 ? 'down' : 'up'}
          delay={60}
          href="/dashboard#blog-analysis"
        />
        <AnimatedStatCard
          size="stat"
          label="평균순위"
          value={avgRankValue}
          suffix="위"
          description={`노출 키워드 ${totalRankedKeywords}개`}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
          color={totalRankedKeywords > 0 ? 'accent' : 'dim'}
          delay={100}
          href="/my/keyword-ranking"
        />
        <AnimatedStatCard
          size="stat"
          label="AI 브리핑"
          value={aiVisibility?.exposedCount ?? 0}
          suffix="건"
          description={aiVisibility ? `이번주 +${aiVisibility.exposedThisWeek}` : '확인 전'}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/></svg>}
          color={aiVisibility && aiVisibility.exposedCount > 0 ? 'up' : 'dim'}
          delay={140}
          href="/my/naver-mate"
        />
        <AnimatedStatCard
          size="stat"
          label="AI 탭"
          value={aiVisibility?.tabExposedCount ?? 0}
          suffix="건"
          description={aiVisibility ? `이번주 +${aiVisibility.tabExposedThisWeek}` : '확인 전'}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>}
          color={aiVisibility && aiVisibility.tabExposedCount > 0 ? 'up' : 'dim'}
          delay={180}
          href="/my/naver-mate"
        />
        <AnimatedStatCard
          size="stat"
          label="키워드 챌린지"
          value={participatedCount}
          suffix="개"
          description={`진행중 · TOP3 ${top3Count}개`}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>}
          color={participatedCount > 0 ? 'accent' : 'dim'}
          delay={220}
          href="/keywords"
        />
        <AnimatedStatCard
          size="stat"
          label="전체 포스팅"
          value={postSummary.totalCount}
          suffix="건"
          description={`이번주 ${postSummary.weeklyCount}건 · 이번달 ${postSummary.monthlyCount}건`}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>}
          color={postSummary.totalCount > 0 ? 'accent' : 'dim'}
          delay={260}
          href="/my/post-analysis"
        />
        <AnimatedStatCard
          size="stat"
          label="토픽"
          value={topicSummary.count}
          suffix="개"
          description={topicSummary.topName ? `대표 토픽 · ${topicSummary.topName}` : '분류된 토픽 없음'}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41L11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.82 0l4.6-4.6a2 2 0 0 0 0-2.82z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>}
          color={topicSummary.count > 0 ? 'accent' : 'dim'}
          delay={340}
          href="/my#topic-performance"
        />
        <AnimatedStatCard
          size="stat"
          label="오늘 방문자"
          value={visitorSummary.todayVisitors}
          suffix="명"
          description={`30일 ${formatCount(visitorSummary.totalVisitors)}명`}
          icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
          color="accent"
          delay={300}
        />
      </KpiGrid>

      {/* ─── 활동 현황 + 순위별 키워드 분포 ─── */}
      <DashboardCard title="활동 현황">
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
      </DashboardCard>

      {/* ─── 2-1. 키워드챌린지 참여 현황 ─── */}
      <ChallengeStatsSection
        totalKeywords={participatedCount}
        rankedKeywords={top10Count}
        rank1Count={rank1Count}
        top3Count={top3Count}
        integratedTop3Count={integratedCount}
        avgParticipants={avgParticipants}
      />

      {/* ─── 2-1-1. 주제별 강점 분석 ─── */}
      <CategoryStrengthSection categoryStats={categoryStats} />

      {/* ─── 2-1-2. 토픽 현황 · 성과 ─── */}
      <TopicPerformanceSection topics={topicSummary.topics} />

      {/* ─── 2-2. 스마트 알림 (오늘의 액션 포인트) ─── */}
      <SmartAlerts alerts={rankAlerts} />

      {/* ─── 2-3. 조회수(블로그 방문자) 추이 ─── */}
      <BlogVisitorChart blogId={naverId} />

      {/* ─── 3. 순위 추이 차트 ─── */}
      <RankTrendSection mode="influencer" naverId={naverId} />

      {/* ─── 4. 변동 피드 ─── */}
      <ActivityFeed events={activityEvents} />

      {/* ─── 5. 오늘의 추천키워드 (미참여 중 경쟁도 낮고 검색량 높은 키워드) ─── */}
      <Top5Keywords
        recommendations={notParticipatedForRecommendations
          .map(kw => ({
            ...kw,
            score: (kw.search_volume > 0 ? Math.log10(kw.search_volume) * 10 : 0) + Math.max(0, 50 - kw.participant_count),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 20)}
        totalNotParticipated={notParticipatedForRecommendations.length}
      />

      {/* ─── 7. 내 키워드 리스트 (주제별, 무료 공개) ─── */}
      <MyKeywordList
        categoryGroups={categoryGroups.map(([category, keywords]) => ({ category, keywords }))}
        totalKeywords={totalKeywords}
        participatedCount={participatedCount}
        defaultCategory={topicScope.length > 0 ? topicScope : myCategory || null}
      />

      </div>
    </div>
  );
  } catch (err) {
    // TEMP DEBUG: 위 try와 짝. 원인 특정 후 제거 예정.
    console.error('[my-dashboard-error]', err);
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="font-title text-xl font-bold text-down mb-3">대시보드 로딩 중 오류 (임시 디버그)</h1>
        <pre className="text-left text-xs bg-surface border border-border rounded-xl p-4 overflow-auto whitespace-pre-wrap">
          {err instanceof Error ? `${err.name}: ${err.message}\n\n${err.stack || ''}` : String(err)}
        </pre>
      </div>
    );
  }
}
