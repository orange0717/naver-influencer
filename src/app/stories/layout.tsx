import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '성장 후기 게시판',
  description: 'N인플을 이용한 인플루언서·블로거들의 실제 성장 후기를 확인하고, 나만의 성장 스토리를 공유해보세요.',
  alternates: { canonical: 'https://ninfle.kr/stories' },
  openGraph: {
    title: '성장 후기 게시판 — N인플',
    description: 'N인플 이용자들의 실제 성장 후기 모음',
    url: 'https://ninfle.kr/stories',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '성장 후기 게시판 — N인플',
    description: 'N인플 이용자들의 실제 성장 후기 모음',
  },
};

export default function StoriesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
