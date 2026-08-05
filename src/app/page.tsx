import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient, getUserWithTimeout } from '@/lib/supabase-server';
import { isRestricted, getPaywallContext } from '@/lib/admin';
import DemoFloatingButton from '@/components/DemoFloatingButton';
import TrialBanner from '@/components/TrialBanner';
import BlogDashboardKpiBar from '@/components/home/BlogDashboardKpiBar';
import BlogAnalysisSection from '@/components/home/BlogAnalysisSection';
import BlogConnectCta from '@/components/home/BlogConnectCta';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'N인플 - 네이버 인플루언서 키워드챌린지 대시보드',
  description: '실시간 키워드챌린지 순위 추적, 블루오션 키워드 분석, 경쟁자 비교까지. 내 채널의 모든 데이터를 한눈에.',
  alternates: { canonical: 'https://ninfle.kr/' },
};

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
          <section className="max-w-7xl mx-auto px-4 pt-2 pb-4">
            <h1 className="font-title text-2xl sm:text-3xl font-extrabold text-text">
              N인플 — 네이버 인플루언서들을 위한 키워드 분석 플랫폼
            </h1>
            <p className="mt-3 text-sm sm:text-base text-dim leading-relaxed max-w-2xl">
              수만 개 키워드의 검색량, 경쟁도, 순위를 분석해 블루오션 키워드를 추천합니다.
              인플루언서 19,980명 + 블로거 83,933명+ 데이터를 기반으로 내 블로그의 방문자, 키워드 순위,
              발행 현황을 한눈에 확인하세요.
            </p>
          </section>
          <section id="blog-analysis" className="scroll-mt-24">
            <BlogAnalysisSection />
          </section>
        </div>
      ) : (
        <div className="space-y-10">
          {/* 섹션 바로가기 탭 — 메뉴 이동 없이 한 화면에서 스크롤 이동 */}
          <nav className="max-w-7xl mx-auto px-4 pt-4">
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

          <section id="dashboard-summary" className="scroll-mt-24 max-w-7xl mx-auto px-4">
            <BlogDashboardKpiBar blogId={profileResult?.blog_id ?? null} />
          </section>
          <section id="blog-analysis" className="scroll-mt-24">
            {isInfluencerNoBlogId ? <BlogConnectCta /> : <BlogAnalysisSection />}
          </section>
        </div>
      )}
      {/* 데모 = 비로그인 사용자만 노출 (가입한 회원은 데모 필요 없음) */}
      {!isLoggedIn && <DemoFloatingButton />}
    </>
  );
}
