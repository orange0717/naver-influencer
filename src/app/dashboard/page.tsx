import { redirect } from 'next/navigation';
import { createRouteHandlerClient, createServiceClient, getUserWithTimeout, hasSupabaseAuthCookie } from '@/lib/supabase-server';
import { cookies } from 'next/headers';
import { isRestricted, getPaywallContext } from '@/lib/admin';
import BlogDashboardKpiBar from '@/components/home/BlogDashboardKpiBar';
import BlogAnalysisSection from '@/components/home/BlogAnalysisSection';
import BlogConnectCta from '@/components/home/BlogConnectCta';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '대시보드 — N인플',
  description: '방문자·발행수·누락률 등 블로그 KPI 요약과 블로그 분석.',
};

/**
 * KPI 요약 + 블로그 분석 대시보드.
 * 2026-08-08까지는 이 내용이 홈(/)이었으나, 홈을 "N인플 AI"로 교체하면서 이곳으로 옮김
 * (src/app/page.tsx 참고). 로그인/데모 사용자 전용 — 비로그인은 홈으로 리다이렉트.
 */
export default async function DashboardPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  const cookieStore = await cookies();
  const isDemo = !authUser && cookieStore.get('demo_mode')?.value === 'true';
  const demoNaverId = isDemo ? cookieStore.get('naver_id')?.value : null;

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

  const isLoggedIn = !!authUser || !!demoNaverId;
  if (!isLoggedIn) {
    // 게스트는 대시보드가 없음 — 홈의 게스트용 블로그 분석 랜딩으로
    const hasSession = await hasSupabaseAuthCookie();
    if (!hasSession) redirect('/');
    // 세션 쿠키는 있는데 getUserWithTimeout이 타임아웃된 애매한 경우도 홈으로 보냄
    redirect('/');
  }

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
  const profileResult = await fetchProfile();
  const isInfluencerNoBlogId = !!authUser && !!profileResult?.linked_influencer_id && !profileResult?.blog_id;

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <nav className="pt-4">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { href: '#dashboard-summary', label: 'KPI 요약' },
            { href: '#blog-analysis', label: '블로그 분석' },
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

      <section id="dashboard-summary" className="scroll-mt-24 space-y-3">
        <h2 className="text-sm font-bold text-text px-1">KPI 요약</h2>
        <BlogDashboardKpiBar blogId={profileResult?.blog_id ?? null} />
      </section>
      <section id="blog-analysis" className="scroll-mt-24">
        {isInfluencerNoBlogId ? <BlogConnectCta /> : <BlogAnalysisSection />}
      </section>
    </div>
  );
}
