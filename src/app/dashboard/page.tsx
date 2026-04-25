import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { unstable_cache } from 'next/cache';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { isRestricted } from '@/lib/admin';
import DashboardGrid from '@/components/dashboard/DashboardGrid';
import type { PlanTier } from '@/lib/dashboard-catalog';

export const dynamic = 'force-dynamic';

/**
 * 최근 30일 공지 수 — 사용자 무관한 전역값이므로 60초 캐싱
 * (대시보드 진입 시마다 풀카운트 쿼리가 도는 것을 방지)
 */
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
  ['dashboard-recent-notices-count'],
  { revalidate: 60, tags: ['notices'] },
);

export const metadata = {
  title: 'N인플 대시보드',
  description: 'N인플의 모든 기능을 카드 그리드로 한눈에 확인하세요.',
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

export default async function DashboardPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const {
    data: { user: authUser },
  } = await supabaseAuth.auth.getUser();

  const cookieStore = await cookies();
  const isDemo = cookieStore.get('demo_mode')?.value === 'true';
  const demoNaverId = isDemo ? cookieStore.get('naver_id')?.value : null;

  // 무료플랜 포함 모든 대시보드는 회원가입/로그인(또는 데모 세션) 필수
  if (!authUser && !demoNaverId) {
    redirect('/auth/login');
  }

  // 제한 사용자 → /subscribe 리다이렉트 (Supabase + 데모 양쪽)
  if (authUser) {
    if (await isRestricted(authUser.email)) {
      redirect('/subscribe');
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

  // 사용자 프로필·구독 상태 + 빠른 지표를 병렬 조회 (직렬 await 누적 지연 제거)
  let userName: string | null = null;
  let currentPlan: PlanTier = 'free';
  let subscriptionExpiresAt: string | null = null;
  let myKeywordCount = 0;
  const myBlogRank: number | null = null;

  const supabase = createServiceClient();

  // 프로필 + 키워드 카운트 + 공지 카운트(60초 캐시)를 병렬 실행
  const fetchProfile = async () => {
    if (!authUser) return null;
    try {
      const { data } = await supabase
        .from('users')
        .select('name, naver_id, subscription_plan, subscription_expires_at')
        .eq('auth_id', authUser.id)
        .maybeSingle();
      return data;
    } catch {
      return null;
    }
  };

  const fetchKeywordCount = async () => {
    if (!authUser) return 0;
    try {
      const { count } = await supabase
        .from('user_saved_keywords')
        .select('id', { count: 'exact', head: true })
        .eq('auth_id', authUser.id);
      return count || 0;
    } catch {
      return 0;
    }
  };

  const [profileResult, keywordCountResult, unreadNotices] = await Promise.all([
    fetchProfile(),
    fetchKeywordCount(),
    getRecentNoticesCount(),
  ]);

  if (authUser) {
    userName = profileResult?.name || profileResult?.naver_id || authUser.email?.split('@')[0] || null;
    subscriptionExpiresAt = profileResult?.subscription_expires_at || null;
    currentPlan = resolvePlan(profileResult?.subscription_plan || null, subscriptionExpiresAt);
    myKeywordCount = keywordCountResult;
  } else if (demoNaverId) {
    userName = demoNaverId;
  }

  const isLoggedIn = !!authUser || !!demoNaverId;

  return (
    <DashboardGrid
      currentPlan={currentPlan}
      isLoggedIn={isLoggedIn}
      userName={userName}
      subscriptionExpiresAt={subscriptionExpiresAt}
      stats={{
        myKeywordCount,
        myBlogRank,
        unreadNotices,
      }}
    />
  );
}
