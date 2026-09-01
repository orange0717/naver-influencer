import type { Metadata } from 'next';

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

/**
 * 여기서는 게이팅하지 않는다.
 * 이 레이아웃은 /keywords/blogger(무료·비로그인 공개)까지 덮기 때문에, 로그인을 일괄로 요구하면
 * lib/plans.ts 가 무료로 선언한 기능이 화면에서만 막히는 역방향 불일치가 생긴다.
 * 등급은 각 page.tsx 가 checkFeaturePage 로 선언한다.
 */
export default function KeywordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
