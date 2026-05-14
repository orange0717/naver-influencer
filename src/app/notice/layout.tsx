import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '공지사항 — 업데이트·뉴스레터',
  description: 'N인플 업데이트, 데이터 갱신 소식, 이벤트, 정책 변경 등 공지사항을 확인하세요.',
  alternates: { canonical: 'https://ninfle.kr/notice' },
  openGraph: {
    title: '공지사항 — N인플',
    description: 'N인플 업데이트와 뉴스레터',
    url: 'https://ninfle.kr/notice',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '공지사항 — N인플',
    description: 'N인플 업데이트와 뉴스레터',
  },
};

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
