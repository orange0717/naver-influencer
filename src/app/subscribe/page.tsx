import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '이용권 - N인플',
  description: 'N인플 이용권 안내. 3일 무료 체험 후 PRO 플랜으로 업그레이드하세요.',
};

const FREE_FEATURES = [
  '인플루언서 리스트 열람',
  '키워드 리스트 열람',
  '키워드 검색량 조회',
  '커뮤니티',
];

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

      {/* 무료 기능 안내 */}
      <div className="bg-bg rounded-2xl p-6">
        <p className="text-sm font-bold mb-3">무료 기능</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FREE_FEATURES.map(f => (
            <div key={f} className="flex items-center gap-2 text-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* 대시보드 플랜 카드 */}
      <div>
        <p className="text-sm font-bold mb-4 text-center">대시보드 이용권</p>
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
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-black">9,900</span>
                <span className="text-sm text-dim">원 / 월</span>
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
              <li className="flex items-center gap-2.5 text-accent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                <span className="font-semibold">기간 제한 없음</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
