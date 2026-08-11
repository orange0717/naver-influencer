import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { isRestricted, getPaywallContext } from '@/lib/admin';
import { redirect } from 'next/navigation';
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
 * AI 질문은 게스트·무료회원 하루 3회 무료, 초과 시 유료가입 유도
 * (게이팅은 route.ts의 requireFeatureAccess + AiConsultantClient의 402 처리).
 */
export default async function HomePage() {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  // 로그인 유저 중 제한 사용자만 /subscribe로 분기. 비로그인은 게스트로 노출.
  if (authUser) {
    const ctx = await getPaywallContext(authUser.id, authUser.email);
    if (!ctx.isAdminUser && !ctx.hasActivePaidPlan) {
      if (await isRestricted(authUser.email)) {
        redirect('/subscribe');
      }
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <AiConsultantClient />
    </div>
  );
}
