import type { Metadata } from 'next';
import { requireFeaturePage } from '@/lib/plan-server-guards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '리스트(무료) — N인플',
  description: '이름·프로필 링크·선정일자·주제를 담은 무료 플랜 인플루언서 명단 — 팬수·챌린지 데이터는 포함되지 않습니다.',
  keywords: ['네이버 인플루언서', '무료 플랜', '인플루언서 명단'],
  alternates: { canonical: 'https://ninfle.kr/influencers/free-plan' },
  openGraph: {
    title: '리스트(무료) — N인플',
    description: '이름·프로필 링크·선정일자·주제를 담은 무료 열람 명단',
    url: 'https://ninfle.kr/influencers/free-plan',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '리스트(무료) — N인플',
    description: '이름·프로필 링크·선정일자·주제를 담은 무료 열람 명단',
  },
};

export default async function FreePlanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireFeaturePage('influencers.free-plan', '/influencers/free-plan');

  return <>{children}</>;
}
