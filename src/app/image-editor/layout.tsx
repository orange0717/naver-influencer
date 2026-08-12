import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이미지 편집기 — 자르기·톤 조정·텍스트·배경 제거',
  description:
    '가지고 있는 이미지를 브라우저에서 바로 편집하세요. 자르기·회전, 밝기·대비·채도 조정, 텍스트/스티커 넣기, AI 배경 제거까지 무료로 제공합니다.',
  alternates: { canonical: 'https://ninfle.kr/image-editor' },
  openGraph: {
    title: '이미지 편집기 — N인플',
    description: '자르기, 톤 조정, 텍스트/스티커, 배경 제거까지 브라우저에서 바로.',
    url: 'https://ninfle.kr/image-editor',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '이미지 편집기 — N인플',
    description: '자르기, 톤 조정, 텍스트/스티커, 배경 제거까지 브라우저에서 바로.',
  },
};

export default function ImageEditorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
