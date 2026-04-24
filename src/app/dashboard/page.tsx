import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient } from '@/lib/supabase-server';
import { isRestricted } from '@/lib/admin';
import DashboardGrid from '@/components/dashboard/DashboardGrid';
import type { PlanTier } from '@/lib/dashboard-catalog';

export const dynamic = 'force-dynamic';

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

  // 사용자 프로필·구독 상태 조회
  let userName: string | null = null;
  let currentPlan: PlanTier = 'free';
  let subscriptionExpiresAt: string | null = null;

  const supabase = createServiceClient();

  if (authUser) {
    const { data: profile } = await supabase
      .from('users')
      .select('name, naver_id, subscription_plan, subscription_expires_at')
      .eq('auth_id', authUser.id)
      .maybeSingle();

    userName = profile?.name || profile?.naver_id || authUser.email?.split('@')[0] || null;
    subscriptionExpiresAt = profile?.subscription_expires_at || null;
    currentPlan = resolvePlan(profile?.subscription_plan || null, subscriptionExpiresAt);
  } else if (demoNaverId) {
    userName = demoNaverId;
  }

  // 빠른 지표 (실패해도 기본값으로 폴백)
  let myKeywordCount = 0;
  let myBlogRank: number | null = null;
  let unreadNotices = 0;

  try {
    if (authUser) {
      const { count } = await supabase
        .from('user_saved_keywords')
        .select('id', { count: 'exact', head: true })
        .eq('auth_id', authUser.id);
      myKeywordCount = count || 0;
    }
  } catch {
    /* 테이블 부재 등 무시 */
  }

  try {
    // 최신 공지 개수 (간이 카운트)
    const { count } = await supabase
      .from('notices')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    unreadNotices = count || 0;
  } catch {
    /* noop */
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
