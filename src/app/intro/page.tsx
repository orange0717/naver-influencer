import type { Metadata } from 'next';
import IntroClient from './IntroClient';

export const metadata: Metadata = {
  title: 'N인플 소개 - 네이버 인플루언서 키워드챌린지 대시보드',
  description: '실시간 키워드챌린지 순위 추적, 블루오션 키워드 분석, 경쟁자 비교까지. N인플의 모든 기능을 한눈에 확인하세요.',
  alternates: { canonical: 'https://ninfle.kr/intro' },
  openGraph: {
    title: 'N인플 소개 - 네이버 인플루언서 키워드챌린지 대시보드',
    description: '실시간 키워드챌린지 순위 추적, 블루오션 키워드 분석, 경쟁자 비교까지.',
    url: 'https://ninfle.kr/intro',
  },
};

export default function IntroPage() {
  return <IntroClient />;
}
