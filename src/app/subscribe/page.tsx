import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '이용권 - N인플',
  description: 'N인플 이용권 안내. 3일 무료 체험 후 PRO 플랜으로 업그레이드하세요.',
};

const FEATURES = [
  { name: '대시보드 (순위 현황)', free: true, pro: true },
  { name: '활동 현황 / 순위 분포', free: true, pro: true },
  { name: '순위 추이 차트', free: true, pro: true },
  { name: '키워드 상승/하락 피드', free: true, pro: true },
  { name: '오늘의 추천 키워드', free: true, pro: true },
  { name: '경쟁자 비교 분석', free: false, pro: true },
  { name: '스마트 알림 (하락 위험/기회)', free: false, pro: true },
  { name: '블로그 방문자수 추이', free: false, pro: true },
  { name: '블로그 점수/등급 분석', free: false, pro: true },
  { name: 'TOP3 달성률 위젯', free: false, pro: true },
];

export default function SubscribePage() {
  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* 헤더 */}
      <div className="text-center space-y-3">
        <p className="text-sm text-accent font-semibold tracking-wide">PRICING</p>
        <h1 className="font-title text-3xl font-extrabold">이용권 안내</h1>
        <p className="text-sm text-dim">회원가입 없이 3일 무료 체험을 시작하세요</p>
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
            3일간 주요 기능을 체험해보세요.
          </p>
          <Link
            href="/trial"
            className="block text-center py-3 bg-accent/10 text-accent font-bold text-sm rounded-xl hover:bg-accent/20 transition"
          >
            무료 체험 시작하기
          </Link>
          <ul className="space-y-2.5 text-sm">
            {FEATURES.map(f => (
              <li key={f.name} className="flex items-center gap-2.5">
                {f.free ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim/30 shrink-0"><path d="M18 6L6 18M6 6l12 12"/></svg>
                )}
                <span className={f.free ? 'text-text' : 'text-dim/40'}>{f.name}</span>
              </li>
            ))}
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
            모든 기능을 제한 없이 사용하세요.
            경쟁자 분석, 스마트 알림, 블로그 분석까지 포함됩니다.
          </p>
          <Link
            href="/auth/signup"
            className="block text-center py-3 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition"
          >
            회원가입 후 구독하기
          </Link>
          <ul className="space-y-2.5 text-sm">
            {FEATURES.map(f => (
              <li key={f.name} className="flex items-center gap-2.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                <span className="text-text">{f.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

    </div>
  );
}
