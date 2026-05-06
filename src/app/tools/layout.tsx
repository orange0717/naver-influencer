import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '도구 모음 — 블로그 운영 필수 도구',
  description: '블로그·인플루언서 운영에 필요한 도구 모음. OrangeRefine 맞춤법 검사, 글쓰기 분석, 마케팅 도구 등을 카테고리별로 정리했습니다.',
  keywords: ['블로그 도구', '맞춤법 검사', '블로그 운영', '글쓰기 도구', 'SEO 도구'],
  alternates: { canonical: 'https://ninfle.kr/tools' },
  openGraph: {
    title: '도구 모음 — N인플',
    description: '블로그 운영에 필요한 도구 모음',
    url: 'https://ninfle.kr/tools',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '도구 모음 — N인플',
    description: '블로그 운영에 필요한 도구 모음',
  },
};

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
