import { redirect } from 'next/navigation';
import { createRouteHandlerClient, createServiceClient, getUserWithTimeout, hasSupabaseAuthCookie } from '@/lib/supabase-server';
import { isRestricted, getPaywallContext } from '@/lib/admin';
import { ensureInfluencerBlogId } from '@/lib/influencer-blog';
import BlogDashboardKpiBar from '@/components/home/BlogDashboardKpiBar';
import BlogKeywordRankTable from '@/components/home/BlogKeywordRankTable';
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
 * (src/app/page.tsx 참고). 로그인 사용자 전용 — 비로그인은 홈으로 리다이렉트.
 */
export default async function DashboardPage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  if (authUser) {
    const ctx = await getPaywallContext(authUser.id, authUser.email);
    if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
      if (await isRestricted(authUser.email)) {
        redirect('/subscribe');
      }
    }
  }

  const isLoggedIn = !!authUser;
  if (!isLoggedIn) {
    // 진짜 비로그인(세션 쿠키 없음)만 홈으로 보낸다.
    // 세션 쿠키는 있는데 서버측 getUserWithTimeout이 타임아웃·동시 갱신 충돌로 null 이
    // 된 애매한 경우(로그인 상태인데 사이드바 '블로그' 클릭 시 홈으로 튕기던 문제)는
    // 홈으로 돌려보내지 않고 대시보드 쉘을 렌더한다 — 하위 컴포넌트가 클라이언트 세션으로
    // 프로필/데이터를 다시 불러오므로 정상 동작한다.
    const hasSession = await hasSupabaseAuthCookie();
    if (!hasSession) redirect('/');
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

  // 인플루언서 계정 blog_id 자동 교정(잘못된 블로그 매칭 방지):
  // in.naver.com의 naver_id와 실제 blog.naver.com blog_id가 달라(예: orangelibrary → orangelibrary_)
  // users.blog_id에 naver_id가 잘못 저장되면 대시보드가 엉뚱한 블로그를 매칭한다.
  // blog_id가 비었거나 naver_id와 같은 "의심" 계정만 실제 블로그로 1회 교정한다(정상 계정은 크롤 없음).
  let effectiveBlogId = profileResult?.blog_id ?? null;
  if (authUser && profileResult?.linked_influencer_id) {
    try {
      const { data: inf } = await supabase
        .from('influencers')
        .select('naver_id')
        .eq('id', profileResult.linked_influencer_id)
        .maybeSingle();
      const guard = await ensureInfluencerBlogId(supabase, authUser.id, effectiveBlogId, inf?.naver_id ?? null);
      effectiveBlogId = guard.blogId;
    } catch (e) {
      console.error('[dashboard] blog_id 자동 교정 실패:', e);
    }
  }

  const isInfluencerNoBlogId = !!authUser && !!profileResult?.linked_influencer_id && !effectiveBlogId;

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
      <nav className="pt-4">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { href: '#dashboard-summary', label: 'KPI 요약' },
            { href: '#keyword-ranks', label: '키워드 순위' },
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
        <BlogDashboardKpiBar blogId={effectiveBlogId} />
      </section>
      {/* 포스팅별 대표 키워드 순위(스펙 #20) — 키워드순위 화면과 동일한 keyword_rank_lookups 소스 재집계 */}
      <section id="keyword-ranks" className="scroll-mt-24 space-y-3">
        <h2 className="text-sm font-bold text-text px-1">포스팅별 대표 키워드 순위</h2>
        <BlogKeywordRankTable blogId={effectiveBlogId} />
      </section>
      {/* 'AI 브리핑·AI 탭 현황' 상세 요약 패널은 대시보드에서 제거됨(스펙 6·9항: 중복 노출 방지).
          상세는 별도 'AI 브리핑 · AI 탭 인용' 탭(/my/naver-mate = AiBriefingSection)에서 확인한다.
          집계 데이터(blog-dashboard-summary의 aiExposure)는 삭제하지 않고 그대로 유지된다. */}
      <section id="blog-analysis" className="scroll-mt-24">
        {isInfluencerNoBlogId ? <BlogConnectCta /> : <BlogAnalysisSection />}
      </section>
    </div>
  );
}
