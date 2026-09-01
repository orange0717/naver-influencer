import type { Metadata } from 'next';
import { requireFeaturePage } from '@/lib/plan-server-guards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '커뮤니티 — 네이버 인플루언서·블로거 토론장',
  description: '네이버 인플루언서·블로거 커뮤니티. 키워드 정보 공유, 검색량 변화 토론, 챌린지 전략, 비회원도 익명 투표 가능.',
  keywords: ['네이버 인플루언서 커뮤니티', '블로거 커뮤니티', '키워드챌린지 전략', '블로그 운영 팁'],
  alternates: { canonical: 'https://ninfle.kr/community' },
  openGraph: {
    title: '커뮤니티 — N인플',
    description: '네이버 인플루언서·블로거 토론장',
    url: 'https://ninfle.kr/community',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '커뮤니티 — N인플',
    description: '네이버 인플루언서·블로거 토론장',
  },
};

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 로그인만 요구한다. 사이드바가 커뮤니티를 무료로 선언하는데 여기서만 유료를 요구하던
  // 역방향 불일치를 2026-09-01 오렌지 결정("화면을 열어줍니다")으로 화면 쪽에 맞췄다.
  await requireFeaturePage('community.read', '/community');
  return <>{children}</>;
}
