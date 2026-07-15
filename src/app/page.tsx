import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { createRouteHandlerClient, createServiceClient, getUserWithTimeout } from '@/lib/supabase-server';
import { isRestricted, getPaywallContext, isAdmin } from '@/lib/admin';
import DemoFloatingButton from '@/components/DemoFloatingButton';
import TrialBanner from '@/components/TrialBanner';
import BlogDashboardKpiBar from '@/components/home/BlogDashboardKpiBar';
import BlogAnalysisSection from '@/components/home/BlogAnalysisSection';
import AiBriefingSection from '@/components/home/AiBriefingSection';
import KeywordRankingSection from '@/components/home/KeywordRankingSection';
import PlanGate from '@/components/home/PlanGate';
import BlogConnectCta from '@/components/home/BlogConnectCta';
import type { PlanTier } from '@/lib/dashboard-catalog';

export const dynamic = 'force-dynamic';

const getRecentNoticesCount = unstable_cache(
  async () => {
    try {
      const supabase = createServiceClient();
      const { count } = await supabase
        .from('notices')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      return count || 0;
    } catch {
      return 0;
    }
  },
  ['home-recent-notices-count'],
  { revalidate: 60, tags: ['notices'] },
);

export const metadata = {
  title: 'N인플 - 네이버 인플루언서 키워드챌린지 대시보드',
  description: '실시간 키워드챌린지 순위 추적, 블루오션 키워드 분석, 경쟁자 비교까지. 내 채널의 모든 데이터를 한눈에.',
  alternates: { canonical: 'https://ninfle.kr/' },
};

function resolvePlan(subscriptionPlan: string | null, expiresAt: string | null): PlanTier {
  if (!subscriptionPlan || !expiresAt) return 'free';
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires) || expires < now) return 'free';
  if (subscriptionPlan === 'INFLUENCER') return 'influencer';
  if (subscriptionPlan === 'BLOGGER') return 'blogger';
  return 'free';
}

export default async function HomePage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  const cookieStore = await cookies();
  /** 정식 로그인 시 데모 쿠키가 남아 있어도 홈은 회원 플랜 기준으로만 표시 */
  const isDemo = !authUser && cookieStore.get('demo_mode')?.value === 'true';
  const demoNaverId = isDemo ? cookieStore.get('naver_id')?.value : null;

  // 로그인/데모 유저 중 제한 사용자만 /subscribe로 분기. 비로그인은 게스트 대시보드 노출.
  if (authUser) {
    const ctx = await getPaywallContext(authUser.id, authUser.email);
    if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
      if (await isRestricted(authUser.email)) {
        redirect('/subscribe');
      }
    }
  } else if (demoNaverId) {
    const supabase = createServiceClient();
    const { data: demoUser } = await supabase
      .from('users')
      .select('email')
      .eq('naver_id', demoNaverId)
      .maybeSingle();
    if (demoUser?.email && (await isRestricted(demoUser.email))) {
      redirect('/subscribe');
    }
  }

  let userName: string | null = null;
  let currentPlan: PlanTier = 'free';
  let subscriptionExpiresAt: string | null = null;
  let myKeywordCount = 0;
  let isAdminUser = false;
  const myBlogRank: number | null = null;

  const supabase = createServiceClient();

  const fetchProfile = async () => {
    if (!authUser) return null;
    try {
      const { data } = await supabase
        .from('users')
        .select('id, nickname, blog_id, linked_influencer_id, subscription_plan, subscription_expires_at')
        .eq('auth_id', authUser.id)
        .maybeSingle();
      return data;
    } catch {
      return null;
    }
  };

  const fetchKeywordCount = async (userId: string | null) => {
    if (!userId) return 0;
    try {
      const { count } = await supabase
        .from('saved_search_keywords')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      return count || 0;
    } catch {
      return 0;
    }
  };

  const profileResult = await fetchProfile();
  const [keywordCountResult, unreadNotices] = await Promise.all([
    fetchKeywordCount(profileResult?.id || null),
    getRecentNoticesCount(),
  ]);

  if (authUser) {
    userName = profileResult?.nickname || profileResult?.blog_id || authUser.email?.split('@')[0] || null;
    subscriptionExpiresAt = profileResult?.subscription_expires_at || null;
    currentPlan = resolvePlan(profileResult?.subscription_plan || null, subscriptionExpiresAt);
    if (profileResult?.id && isAdmin(profileResult.id)) {
      isAdminUser = true;
      currentPlan = 'influencer';
    }
    myKeywordCount = keywordCountResult;
  } else if (demoNaverId) {
    userName = demoNaverId;
  }

  const isLoggedIn = !!authUser || !!demoNaverId;
  const isInfluencerNoBlogId = !!authUser && !!profileResult?.linked_influencer_id && !profileResult?.blog_id;

  return (
    <>
      {/* 데모 사용자에게 잔여일 안내 (CTA 없이 안내만) */}
      {isDemo && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <TrialBanner isDemo />
        </div>
      )}
      {!isLoggedIn ? (
        <div className="space-y-10">
          <section id="blog-analysis" className="scroll-mt-24">
            <BlogAnalysisSection />
          </section>
        </div>
      ) : isInfluencerNoBlogId ? (
        <BlogConnectCta />
      ) : (
        <div className="space-y-10">
          {/* 섹션 바로가기 탭 — 메뉴 이동 없이 한 화면에서 스크롤 이동 */}
          <nav className="max-w-7xl mx-auto px-4 pt-4 -mb-4">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {[
                { href: '#dashboard-summary', label: 'KPI 요약' },
                { href: '#blog-analysis', label: '블로그 분석' },
                { href: '#ai-briefing', label: 'AI 브리핑·AI탭' },
                { href: '#keyword-ranking', label: '키워드 순위' },
              ].map(t => (
                <a
                  key={t.href}
                  href={t.href}
                  className="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-surface border border-border text-dim hover:text-accent hover:border-accent transition"
                >
                  {t.label}
                </a>
              ))}
            </div>
          </nav>

          <section id="dashboard-summary" className="scroll-mt-24 max-w-7xl mx-auto px-4">
            <BlogDashboardKpiBar blogId={profileResult?.blog_id ?? null} />
          </section>
          <section id="blog-analysis" className="scroll-mt-24">
            <BlogAnalysisSection />
          </section>
          <PlanGate requiredPlan="influencer" currentPlan={currentPlan} sectionLabel="AI 브리핑·AI 탭">
            <section id="ai-briefing" className="scroll-mt-24">
              <AiBriefingSection />
            </section>
          </PlanGate>
          <PlanGate requiredPlan="blogger" currentPlan={currentPlan} sectionLabel="검색 순위">
            <section id="keyword-ranking" className="scroll-mt-24">
              <KeywordRankingSection />
            </section>
          </PlanGate>
        </div>
      )}
      {/* 데모 = 비로그인 사용자만 노출 (가입한 회원은 데모 필요 없음) */}
      {!isLoggedIn && <DemoFloatingButton />}
    </>
  );
}
