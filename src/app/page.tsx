'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ── 실시간 DB 통계 ── */
function useStats() {
  const [stats, setStats] = useState({ influencer_count: 9000, category_count: 20, keyword_count: 115000 });
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
  }, []);
  return stats;
}

/* ── FAQ ── */
const FAQS = [
  { q: '무료로 사용할 수 있나요?', a: '네, 무료 회원도 키워드 목록 열람, 일일 추천 키워드 3개, 참여자 수 확인이 가능합니다. PRO 구독 시 모든 기능을 무제한으로 이용하실 수 있습니다.' },
  { q: '어떤 데이터를 분석할 수 있나요?', a: '네이버 인플루언서 키워드챌린지의 참여자 수, 순위 변동, 검색량 트렌드, 경쟁도 등을 분석합니다. 20개 카테고리, 수만 개의 키워드를 커버합니다.' },
  { q: '데이터는 얼마나 자주 업데이트되나요?', a: '키워드 순위와 참여자 데이터는 매일 자동으로 업데이트됩니다. 검색량 트렌드는 주간 단위로 갱신됩니다.' },
  { q: '구독을 해지하면 어떻게 되나요?', a: '구독 기간이 끝나면 무료 계정으로 전환되며, 기본 기능은 계속 이용 가능합니다. 데이터는 삭제되지 않습니다.' },
];

export default function LandingPage() {
  const stats = useStats();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="-mx-4 -mt-6">

      {/* ═══════════ HERO (bg) ═══════════ */}
      <section className="bg-bg px-4 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
        <p className="text-sm text-accent font-semibold tracking-wide mb-8">
          네이버 인플루언서들을 위한 플랫폼
        </p>

        <h1 className="text-3xl md:text-5xl font-extrabold text-text leading-tight mb-6">
          키워드챌린지,<br />더 스마트하게
        </h1>

        <p className="text-base text-dim max-w-xl mx-auto leading-relaxed mb-10">
          수만 개 키워드의 검색량·경쟁도·순위를 한눈에 분석하고<br className="hidden md:block" />
          블루오션 키워드를 발굴하여 상위 노출을 달성하세요.
        </p>

        <div className="flex flex-wrap gap-3 justify-center mb-10">
          <Link href="/keywords" className="px-5 py-2.5 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors">
            키워드 분석
          </Link>
          <Link href="/influencers" className="px-5 py-2.5 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors">
            인플루언서 검색
          </Link>
          <Link href="/rankings" className="px-5 py-2.5 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors">
            랭킹 확인
          </Link>
        </div>

        <Link href="/auth/signup"
          className="inline-block px-10 py-4 bg-accent text-white text-sm font-bold rounded-full hover:bg-accent-hover transition-colors shadow-sm">
          무료로 시작하기 →
        </Link>

        <p className="text-xs text-dim mt-5">
          가입 즉시 키워드 분석을 시작할 수 있습니다.<br />
          별도 결제 없이 무료로 이용 가능합니다.
        </p>
      </section>

      {/* ═══════════ 데이터 현황 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">DATA</p>
        <h2 className="text-2xl md:text-3xl font-extrabold text-text mb-4">실시간 데이터 현황</h2>
        <p className="text-sm text-dim mb-12">매일 자동으로 수집·분석되는 네이버 인플루언서 데이터</p>

        <div className="flex justify-center gap-16 md:gap-24">
          <div>
            <p className="text-3xl md:text-4xl font-extrabold text-text">{stats.influencer_count.toLocaleString()}+</p>
            <p className="text-xs text-dim mt-2">인플루언서</p>
          </div>
          <div>
            <p className="text-3xl md:text-4xl font-extrabold text-text">{stats.keyword_count.toLocaleString()}+</p>
            <p className="text-xs text-dim mt-2">키워드</p>
          </div>
          <div>
            <p className="text-3xl md:text-4xl font-extrabold text-text">{stats.category_count}</p>
            <p className="text-xs text-dim mt-2">카테고리</p>
          </div>
        </div>
      </section>

      {/* ═══════════ 핵심 기능 (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">FEATURES</p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-text mb-4">키워드 전략의 모든 것</h2>
            <p className="text-sm text-dim">데이터 기반의 키워드 분석으로 경쟁 우위를 확보하세요.</p>
          </div>

          <div className="space-y-12">
            <div className="flex items-start gap-5">
              <span className="text-accent mt-0.5 flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </span>
              <div>
                <h3 className="font-bold text-text mb-1">블루오션 키워드 발굴</h3>
                <p className="text-sm text-dim leading-relaxed">참여자가 적고 검색량이 높은 키워드를 자동 분석하여 진입 기회를 추천합니다.</p>
              </div>
            </div>

            <div className="flex items-start gap-5">
              <span className="text-up mt-0.5 flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </span>
              <div>
                <h3 className="font-bold text-text mb-1">실시간 순위 추적</h3>
                <p className="text-sm text-dim leading-relaxed">매일 업데이트되는 키워드챌린지 순위를 확인하고 변동 트렌드를 추적하세요.</p>
              </div>
            </div>

            <div className="flex items-start gap-5">
              <span className="text-blue mt-0.5 flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
              </span>
              <div>
                <h3 className="font-bold text-text mb-1">경쟁자 분석</h3>
                <p className="text-sm text-dim leading-relaxed">같은 키워드에 참여 중인 인플루언서들의 순위와 전략을 비교 분석합니다.</p>
              </div>
            </div>

            <div className="flex items-start gap-5">
              <span className="text-gold mt-0.5 flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              </span>
              <div>
                <h3 className="font-bold text-text mb-1">맞춤 키워드 추천</h3>
                <p className="text-sm text-dim leading-relaxed">AI가 내 카테고리와 성과를 분석하여 매일 최적의 키워드를 추천합니다.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ 사용 방법 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">HOW IT WORKS</p>
        <h2 className="text-2xl md:text-3xl font-extrabold text-text mb-16">3단계로 시작하세요</h2>

        <div className="flex flex-col md:flex-row justify-center gap-12 md:gap-20 max-w-3xl mx-auto">
          <div>
            <p className="text-4xl font-extrabold text-accent/25 mb-3">01</p>
            <h3 className="font-bold text-text mb-1">회원가입</h3>
            <p className="text-sm text-dim">무료로 가입하고<br />인플루언서 계정을 연결하세요.</p>
          </div>
          <div>
            <p className="text-4xl font-extrabold text-accent/25 mb-3">02</p>
            <h3 className="font-bold text-text mb-1">키워드 분석</h3>
            <p className="text-sm text-dim">수만 개 키워드의<br />참여자, 검색량, 경쟁도를 확인하세요.</p>
          </div>
          <div>
            <p className="text-4xl font-extrabold text-accent/25 mb-3">03</p>
            <h3 className="font-bold text-text mb-1">전략 수립</h3>
            <p className="text-sm text-dim">블루오션 키워드를 선점하고<br />순위 변동을 실시간으로 추적하세요.</p>
          </div>
        </div>
      </section>

      {/* ═══════════ 추천 대상 (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">FOR YOU</p>
        <h2 className="text-2xl md:text-3xl font-extrabold text-text mb-16">이런 분들에게 추천합니다</h2>

        <div className="flex flex-col md:flex-row justify-center gap-12 md:gap-20 max-w-3xl mx-auto">
          <div>
            <h3 className="font-bold text-text mb-2">키워드챌린지를 시작하는 분</h3>
            <p className="text-sm text-dim leading-relaxed">어떤 키워드에 참여해야 할지 모르겠다면,<br />블루오션 키워드 추천으로 시작하세요.</p>
          </div>
          <div>
            <h3 className="font-bold text-text mb-2">상위 노출을 원하는 분</h3>
            <p className="text-sm text-dim leading-relaxed">현재 순위를 추적하고, 경쟁자 분석을 통해<br />전략적으로 순위를 올리세요.</p>
          </div>
          <div>
            <h3 className="font-bold text-text mb-2">데이터 기반 전략이 필요한 분</h3>
            <p className="text-sm text-dim leading-relaxed">감이 아닌 데이터로 키워드를 선택하고,<br />트렌드 변화를 놓치지 마세요.</p>
          </div>
        </div>
      </section>

      {/* ═══════════ 가격 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">PRICING</p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-text mb-4">합리적인 가격</h2>
            <p className="text-sm text-dim">무료 계정으로 시작하고, 더 많은 기능이 필요할 때 구독하세요.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <p className="text-xs font-bold text-up tracking-wide mb-3">무료</p>
              <p className="text-3xl font-extrabold text-text mb-1">₩0</p>
              <p className="text-xs text-dim mb-6">영구 무료</p>
              <ul className="space-y-3">
                {['키워드 목록 전체 열람', '일일 추천 키워드 3개', '참여자 수 · 블루오션 지표', '기본 인플루언서 검색'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-dim">
                    <span className="text-up">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/signup" className="inline-block mt-8 px-6 py-2.5 rounded-full border border-border text-text text-sm font-medium hover:border-accent/50 transition-colors">
                무료로 시작하기
              </Link>
            </div>

            <div>
              <p className="text-xs font-bold text-accent tracking-wide mb-3">PRO</p>
              <p className="text-3xl font-extrabold text-text mb-1">₩9,900<span className="text-sm font-normal text-dim">/월</span></p>
              <p className="text-xs text-dim mb-6">모든 기능 무제한</p>
              <ul className="space-y-3">
                {['키워드 상세 분석 무제한', '인플루언서 순위 전체 열람', '검색량 트렌드 차트', '일일 추천 키워드 전체', '내 대시보드 + 경쟁자 비교', '실시간 데이터 업데이트'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-dim">
                    <span className="text-accent">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/subscribe" className="inline-block mt-8 px-6 py-2.5 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors">
                PRO 구독하기 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ FAQ (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">FAQ</p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-text">자주 묻는 질문</h2>
          </div>

          <div className="divide-y divide-border">
            {FAQS.map((faq, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between py-5 text-left cursor-pointer"
                >
                  <span className="text-sm font-bold text-text">{faq.q}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`text-dim flex-shrink-0 ml-4 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="pb-5">
                    <p className="text-sm text-dim leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ 하단 CTA (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24 text-center">
        <h2 className="text-2xl md:text-3xl font-extrabold text-text mb-4">지금 바로 시작하세요</h2>
        <p className="text-sm text-dim mb-8">
          무료 가입으로 키워드 분석을 시작하세요.<br />
          더 스마트한 키워드 전략이 기다리고 있습니다.
        </p>
        <Link href="/auth/signup"
          className="inline-block px-10 py-4 bg-accent text-white text-sm font-bold rounded-full hover:bg-accent-hover transition-colors shadow-sm">
          무료 회원가입 →
        </Link>
        <p className="text-xs text-dim mt-5">
          이미 계정이 있으신가요?{' '}
          <Link href="/auth/login" className="text-accent font-semibold hover:underline">로그인</Link>
        </p>
      </section>
    </div>
  );
}
