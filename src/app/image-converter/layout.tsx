import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이미지 변환기 — 무료 이미지 포맷 변환',
  description: 'JPG, PNG, WebP 등 이미지 파일 포맷을 브라우저에서 바로 무료로 변환할 수 있는 도구입니다.',
  alternates: { canonical: 'https://ninfle.kr/image-converter' },
  openGraph: {
    title: '이미지 변환기 — N인플',
    description: '이미지 파일 포맷을 브라우저에서 바로 무료로 변환하세요.',
    url: 'https://ninfle.kr/image-converter',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '이미지 변환기 — N인플',
    description: '이미지 파일 포맷을 브라우저에서 바로 무료로 변환하세요.',
  },
};

export default function ImageConverterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
