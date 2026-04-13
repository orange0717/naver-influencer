import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '이용권 - N인플',
  description: 'N인플 이용권 안내. 무료, 블로거, 인플루언서 플랜을 선택하세요.',
};

const CHECK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
);

const DASH = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim/30 shrink-0"><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

export default function SubscribePage() {
  return (
    <div className="max-w-5xl mx-auto space-y-10">
      {/* 헤더 */}
      <div className="text-center space-y-3">
        <p className="text-sm text-accent font-semibold tracking-wide">PRICING</p>
        <h1 className="font-title text-3xl font-extrabold">이용권 안내</h1>
        <p className="text-sm text-dim">나에게 맞는 플랜을 선택하세요</p>
      </div>

      {/* 3열 플랜 카드 */}
      <div className="grid md:grid-cols-3 gap-5">
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
            회원가입 없이 기본 기능을 자유롭게 이용하세요.
          </p>
          <Link
            href="/influencers"
            className="block text-center py-3 bg-bg border border-border text-text font-bold text-sm rounded-xl hover:border-accent/40 transition"
          >
            무료로 시작하기
          </Link>
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">{CHECK}<span>MY 블로그</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 검색</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>연도별 선정 현황</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>경쟁자 분석 (월 1회)</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">커뮤니티</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">키워드순위</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">포스팅 분석</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">캠페인 현황</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">키워드 챌린지 (대시보드)</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">키워드 챌린지 (키워드)</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">키워드 검색순위</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">인플루언서 리스트</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">원고료 정산내역</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">경쟁자 분석 (무제한)</span></li>
          </ul>
        </div>

        {/* 블로거 */}
        <div className="bg-surface rounded-2xl border-2 border-accent p-6 space-y-5 relative">
          <div className="absolute -top-3 left-6 bg-accent text-white text-[10px] font-bold px-3 py-1 rounded-full">
            추천
          </div>
          <div>
            <p className="text-xs text-accent font-semibold">BLOGGER</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-black">5,500</span>
              <span className="text-sm text-dim">원/월</span>
            </div>
            <p className="text-[11px] text-accent font-semibold">연간 60,500원 (1개월 할인)</p>
          </div>
          <p className="text-sm text-dim leading-relaxed">
            인플루언서를 준비하는 블로거를 위한 플랜
          </p>
          <Link
            href="/auth/signup"
            className="block text-center py-3 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition"
          >
            7일 무료체험
          </Link>
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">{CHECK}<span>무료 플랜 전체 포함</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>커뮤니티</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드순위</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>포스팅 분석</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 검색순위</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>경쟁자 분석 (무제한)</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">캠페인 현황</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">키워드 챌린지 (대시보드)</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">키워드 챌린지 (키워드)</span></li>
            <li className="flex items-center gap-2.5">{DASH}<span className="text-dim">원고료 정산내역</span></li>
          </ul>
        </div>

        {/* 인플루언서 */}
        <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
          <div>
            <p className="text-xs text-accent font-semibold">INFLUENCER</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-black">9,900</span>
              <span className="text-sm text-dim">원/월</span>
            </div>
            <p className="text-[11px] text-accent font-semibold">연간 108,900원 (1개월 할인)</p>
          </div>
          <p className="text-sm text-dim leading-relaxed">
            네이버 인플루언서를 위한 프리미엄 플랜
          </p>
          <Link
            href="/auth/signup"
            className="block text-center py-3 bg-accent/10 text-accent font-bold text-sm rounded-xl hover:bg-accent/20 transition"
          >
            7일 무료체험
          </Link>
          <ul className="space-y-2.5 text-sm">
            <li className="flex items-center gap-2.5">{CHECK}<span>블로거 플랜 전체 포함</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>캠페인 현황</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 챌린지 (대시보드)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>키워드 챌린지 (키워드)</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>원고료 정산내역</span></li>
            <li className="flex items-center gap-2.5">{CHECK}<span>인플루언서 리스트</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
