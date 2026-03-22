import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '이용권 - N인플',
  description: 'N인플 이용권 안내. 3일 무료 체험 후 PRO 플랜으로 업그레이드하세요.',
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
          {/* 무료 체험 */}
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
            <div>
              <p className="text-xs text-dim font-semibold">무료 체험</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black">0</span>
                <span className="text-sm text-dim">원 / 3일</span>
              </div>
            </div>
            <p className="text-sm text-dim leading-relaxed">
              회원가입 없이 인플루언서 ID만 입력하면 바로 시작됩니다.
              3일간 대시보드의 모든 기능을 체험해보세요.
            </p>
            <Link
              href="/trial"
              className="block text-center py-3 bg-accent/10 text-accent font-bold text-sm rounded-xl hover:bg-accent/20 transition"
            >
              무료 체험 시작하기
            </Link>
            <ul className="space-y-2.5 text-sm">
              {DASHBOARD_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  <span className="text-text">{f}</span>
                </li>
              ))}
              <li className="flex items-center gap-2.5 text-dim">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim/30 shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                <span>3일 후 자동 종료</span>
              </li>
            </ul>
          </div>

          {/* PRO */}
          <div className="bg-surface rounded-2xl border-2 border-accent p-6 space-y-5 relative">
            <div className="absolute -top-3 left-6 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-full">
              추천
            </div>
            <div>
              <p className="text-xs text-accent font-semibold">PRO</p>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between bg-bg rounded-lg px-4 py-2.5">
                  <span className="text-sm font-semibold">1개월</span>
                  <span className="text-sm font-black">9,900원</span>
                </div>
                <div className="flex items-center justify-between bg-accent/5 rounded-lg px-4 py-2.5 border border-accent/20">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">3개월</span>
                    <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">10% 할인</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black">26,700원</span>
                    <span className="text-[10px] text-dim ml-1">월 8,900원</span>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-bg rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">6개월</span>
                    <span className="text-[10px] font-bold text-up bg-up/10 px-1.5 py-0.5 rounded">20% 할인</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black">47,520원</span>
                    <span className="text-[10px] text-dim ml-1">월 7,920원</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm text-dim leading-relaxed">
              대시보드의 모든 기능을 기간 제한 없이 이용하세요.
            </p>
            <Link
              href="/auth/signup"
              className="block text-center py-3 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition"
            >
              회원가입 후 구독하기
            </Link>
            <ul className="space-y-2.5 text-sm">
              {DASHBOARD_FEATURES.map(f => (
                <li key={f} className="flex items-center gap-2.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  <span className="text-text">{f}</span>
                </li>
              ))}
            </ul>
          </div>
      </div>
    </div>
  );
}
