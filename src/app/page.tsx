import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServiceClient, getUserWithTimeout } from '@/lib/supabase-server';
import { isRestricted, getPaywallContext } from '@/lib/admin';
import { redirect } from 'next/navigation';
import TrialBanner from '@/components/TrialBanner';
import AiConsultantClient from '@/app/dashboard/ai-consultant/AiConsultantClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'N인플 - 네이버 인플루언서 키워드챌린지 대시보드',
  description: '실시간 키워드챌린지 순위 추적, 블루오션 키워드 분석, 경쟁자 비교까지. 내 채널의 모든 데이터를 한눈에.',
  alternates: { canonical: 'https://ninfle.kr/' },
};

/**
 * 홈(/) — 2026-08-09부터 "N인플 AI"가 비회원·회원 공통 메인 화면.
 * 예전 KPI 대시보드 + 블로그 분석은 /dashboard로 이동 (src/app/dashboard/page.tsx).
 * 비로그인 게스트도 동일한 AI 컨설턴트를 보고, 하루 5회 무료 풀로 바로 체험한다
 * (API 쪽 게이팅은 src/app/api/ai-consultant/route.ts의 requireFeatureAccess가 담당).
 */
export default async function HomePage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  const cookieStore = await cookies();
  /** 정식 로그인 시 데모 쿠키가 남아 있어도 홈은 회원 플랜 기준으로만 표시 */
  const isDemo = !authUser && cookieStore.get('demo_mode')?.value === 'true';
  const demoNaverId = isDemo ? cookieStore.get('naver_id')?.value : null;

  // 로그인/데모 유저 중 제한 사용자만 /subscribe로 분기. 비로그인은 게스트 랜딩 노출.
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

  return (
    <>
      {/* 데모 사용자에게 잔여일 안내 (CTA 없이 안내만) */}
      {isDemo && (
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <TrialBanner isDemo />
        </div>
      )}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <AiConsultantClient />
      </div>
    </>
  );
}
