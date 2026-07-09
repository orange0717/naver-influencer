import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '7일 무료 체험 — 회원가입 없이 시작하기',
  description: '인플루언서홈 또는 블로그 주소만 입력하면 회원가입 없이 N인플 대시보드를 7일간 무료로 체험할 수 있습니다.',
  alternates: { canonical: 'https://ninfle.kr/trial' },
  openGraph: {
    title: '7일 무료 체험 — N인플',
    description: '회원가입 없이 N인플 대시보드를 7일간 무료로 체험하세요.',
    url: 'https://ninfle.kr/trial',
    siteName: 'N인플',
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '7일 무료 체험 — N인플',
    description: '회원가입 없이 N인플 대시보드를 7일간 무료로 체험하세요.',
  },
};

export default function TrialLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
