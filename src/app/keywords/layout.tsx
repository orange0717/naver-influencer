import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '키워드 분석 — 네이버 블로그 SEO 키워드 도구',
  description: '네이버 인플루언서 키워드챌린지 참여자수·검색량·경쟁도·TOP3 점유율을 한눈에 분석. 블루오션 키워드를 빠르게 찾으세요.',
  keywords: ['네이버 키워드 분석', '블로그 SEO', '키워드 경쟁도', '검색량 조회', '키워드챌린지', '블루오션 키워드'],
  alternates: { canonical: 'https://ninfle.kr/keywords' },
  openGraph: {
    title: '키워드 분석 — N인플',
    description: '참여자수·검색량·경쟁도 기반 블루오션 키워드 찾기',
    url: 'https://ninfle.kr/keywords',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '키워드 분석 — N인플',
    description: '참여자수·검색량·경쟁도 기반 블루오션 키워드 찾기',
  },
};

export default async function KeywordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);

  // 로그인 필수
  // ⚠️ 파라미터 없는 redirect('/auth/login') 이면 안 된다. 그러면 목적지가 사라져서
  // 로그인에 성공해도 홈에 남는다(실측: 홈에서 '키워드 챌린지' 칩 클릭 →
  // /keywords → /auth/login → /?authModal=login → 로그인해도 /keywords 로 안 감).
  // 하드 내비게이션일 땐 미들웨어(middleware.ts:379~384)가 ?memberOnly=1&redirect=... 로
  // 보내 회원 전용 모달까지 띄우는데, 소프트 내비게이션은 acceptsHtml 조건 때문에
  // 미들웨어 게이트를 통째로 건너뛰고 여기까지 온다. 그래서 같은 쿼리를 여기서도 맞춰준다.
  // (레이아웃에서는 하위 경로를 알 수 없어 /keywords 로만 되돌린다 — 홈보다는 정확하다.)
  if (!authUser) {
    redirect(`/?memberOnly=1&redirect=${encodeURIComponent('/keywords')}`);
  }

  return <>{children}</>;
}
