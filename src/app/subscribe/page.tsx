import type { Metadata } from 'next';
import Link from 'next/link';
import SubscribeClient from './SubscribeClient';

export const metadata: Metadata = {
  title: '이용권 - N인플',
  description: 'N인플 이용권 안내. 무료로 시작하고 PRO로 업그레이드하세요.',
};

const DASHBOARD_FEATURES = [
  '내 키워드 순위 현황',
  '활동 현황 / 순위 분포',
  '순위 추이 차트 (전체 평균 포함)',
  '키워드 상승/하락 변동 피드',
  '오늘의 추천 키워드',
  '경쟁자 비교 분석',
  '스마트 알림 (하락 위험/기회)',
  '블로그 방문자수 추이',
  'TOP3 달성률 위젯',
  '커뮤니티',
];

export default function SubscribePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* 헤더 */}
      <div className="text-center space-y-3">
        <p className="text-sm text-accent font-semibold tracking-wide">PRICING</p>
        <h1 className="font-title text-3xl font-extrabold">이용권 안내</h1>
        <p className="text-sm text-dim">대시보드를 제외한 모든 기능은 무료입니다</p>
      </div>

      {/* 플랜 카드 */}
      <div className="grid md:grid-cols-2 gap-6">
          {/* 무료 */}
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
            <div>
              <p className="text-xs text-dim font-semibold">FREE</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black">0</span>
                <span className="text-sm text-dim">원</span>
              </div>
            </div>
            <p className="text-sm text-dim leading-relaxed">
              회원가입 없이 인플루언서 리스트, 키워드 리스트를 자유롭게 이용하세요.
            </p>
            <Link
              href="/influencers"
              className="block text-center py-3 bg-accent/10 text-accent font-bold text-sm rounded-xl hover:bg-accent/20 transition"
            >
              무료로 시작하기
            </Link>
            <ul className="space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                <span className="text-text">인플루언서 리스트</span>
              </li>
              <li className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                <span className="text-text">키워드 리스트</span>
              </li>
            </ul>
          </div>

          {/* PRO — 결제 버튼 포함 (클라이언트 컴포넌트) */}
          <SubscribeClient features={DASHBOARD_FEATURES} />
      </div>
    </div>
  );
}
