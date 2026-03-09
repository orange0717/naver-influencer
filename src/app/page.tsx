'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ── 실시간 DB 통계 (히어로 하단) ── */
function useStats() {
  const [stats, setStats] = useState({ influencer_count: 9000, category_count: 20, keyword_count: 115000 });
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
  }, []);
  return stats;
}

/* ── 카운트 애니메이션 ── */
function AnimatedCount({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const dur = 1200;
    const steps = 40;
    const step = target / steps;
    let cur = 0;
    const id = setInterval(() => {
      cur += step;
      if (cur >= target) { setCount(target); clearInterval(id); }
      else setCount(Math.floor(cur));
    }, dur / steps);
    return () => clearInterval(id);
  }, [target]);
  return <>{count.toLocaleString()}{suffix}</>;
}

/* ── 기능 카드 데이터 ── */
const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
    title: '블루오션 키워드 발굴',
    desc: '참여자가 적고 검색량이 높은 키워드를 자동 분석하여 진입 기회를 추천합니다.',
    color: 'accent',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    title: '실시간 순위 추적',
    desc: '매일 업데이트되는 키워드챌린지 순위를 확인하고 변동 트렌드를 추적하세요.',
    color: 'up',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    title: '경쟁자 분석',
    desc: '같은 키워드에 참여 중인 인플루언서들의 순위와 전략을 비교 분석합니다.',
    color: 'blue',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
    title: '맞춤 키워드 추천',
    desc: 'AI가 내 카테고리와 성과를 분석하여 매일 최적의 키워드를 추천합니다.',
    color: 'gold',
  },
];

/* ── 사용 방법 스텝 ── */
const STEPS = [
  { num: '01', title: '회원가입', desc: '무료로 가입하고 네이버 인플루언서 계정을 연결하세요.' },
  { num: '02', title: '키워드 분석', desc: '수만 개 키워드의 참여자, 검색량, 경쟁도를 확인하세요.' },
  { num: '03', title: '전략 수립', desc: '블루오션 키워드를 선점하고 순위 변동을 실시간으로 추적하세요.' },
];

/* ── 자주 묻는 질문 ── */
const FAQS = [
  {
    q: '무료로 사용할 수 있나요?',
    a: '네, 무료 회원도 키워드 목록 열람, 일일 추천 키워드 3개, 참여자 수 확인이 가능합니다. PRO 구독 시 모든 기능을 무제한으로 이용하실 수 있습니다.',
  },
  {
    q: '어떤 데이터를 분석할 수 있나요?',
    a: '네이버 인플루언서 키워드챌린지의 참여자 수, 순위 변동, 검색량 트렌드, 경쟁도 등을 분석합니다. 20개 카테고리, 수만 개의 키워드를 커버합니다.',
  },
  {
    q: '데이터는 얼마나 자주 업데이트되나요?',
    a: '키워드 순위와 참여자 데이터는 매일 자동으로 업데이트됩니다. 검색량 트렌드는 주간 단위로 갱신됩니다.',
  },
  {
    q: '구독을 해지하면 어떻게 되나요?',
    a: '구독 기간이 끝나면 무료 계정으로 전환되며, 기본 기능은 계속 이용 가능합니다. 데이터는 삭제되지 않습니다.',
  },
];

/* ══════════════════════════════════════════
   메인 랜딩 페이지
   ══════════════════════════════════════════ */
export default function LandingPage() {
  const stats = useStats();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="-mx-4 -mt-6">
      {/* ═══════════════════ HERO ═══════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-accent via-accent2 to-[#8B4513]">
        {/* 배경 장식 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-white/5" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/[0.03]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-28 text-center text-white">
          {/* 뱃지 */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold mb-6">
            <span className="w-2 h-2 rounded-full bg-up animate-pulse" />
            네이버 인플루언서들을 위한 플랫폼
          </div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-5">
            키워드챌린지,<br className="md:hidden" /> 더 스마트하게
          </h1>
          <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto mb-8 leading-relaxed">
            수만 개 키워드의 검색량·경쟁도·순위를 한눈에 분석하고<br className="hidden md:block" />
            블루오션 키워드를 발굴하여 상위 노출을 달성하세요.
          </p>

          {/* CTA 버튼 */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-12">
            <Link href="/auth/signup"
              className="px-8 py-4 bg-white text-accent font-extrabold rounded-xl hover:bg-white/90 transition-all text-sm shadow-lg hover:shadow-xl hover:-translate-y-0.5">
              무료로 시작하기 →
            </Link>
            <Link href="/keywords"
              className="px-8 py-4 bg-white/15 backdrop-blur-sm text-white font-bold rounded-xl hover:bg-white/25 transition-all text-sm border border-white/20">
              키워드 둘러보기
            </Link>
          </div>

          {/* 통계 카운터 */}
          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
            <div>
              <p className="text-2xl md:text-3xl font-extrabold">
                <AnimatedCount target={stats.influencer_count} suffix="+" />
              </p>
              <p className="text-xs text-white/60 mt-1">인플루언서</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-extrabold">
                <AnimatedCount target={stats.keyword_count} suffix="+" />
              </p>
              <p className="text-xs text-white/60 mt-1">키워드</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-extrabold">
                <AnimatedCount target={stats.category_count} />
              </p>
              <p className="text-xs text-white/60 mt-1">카테고리</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════ 핵심 기능 ═══════════════════ */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <span className="text-xs font-bold text-accent bg-accent/12 px-3 py-1 rounded-full">FEATURES</span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-4 mb-3">
            키워드 전략의 모든 것
          </h2>
          <p className="text-sm text-dim max-w-lg mx-auto">
            데이터 기반의 키워드 분석으로 네이버 인플루언서 키워드챌린지에서 경쟁 우위를 확보하세요.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title}
              className="bg-surface rounded-2xl border border-border p-6 hover:border-accent/40 hover:shadow-md transition-all group">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors
                ${f.color === 'accent' ? 'bg-accent/15 text-accent group-hover:bg-accent/25' :
                  f.color === 'up' ? 'bg-up/15 text-up group-hover:bg-up/25' :
                  f.color === 'blue' ? 'bg-blue/15 text-blue group-hover:bg-blue/25' :
                  'bg-gold/15 text-gold group-hover:bg-gold/25'}`}>
                {f.icon}
              </div>
              <h3 className="font-bold text-text mb-2">{f.title}</h3>
              <p className="text-xs text-dim leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ 사용 방법 ═══════════════════ */}
      <section className="bg-surface border-y border-border">
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-accent bg-accent/12 px-3 py-1 rounded-full">HOW IT WORKS</span>
            <h2 className="text-2xl md:text-3xl font-extrabold mt-4 mb-3">
              3단계로 시작하세요
            </h2>
            <p className="text-sm text-dim max-w-lg mx-auto">
              가입부터 키워드 전략 수립까지, 3분이면 충분합니다.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {STEPS.map((s, i) => (
              <div key={s.num} className="relative text-center">
                {/* 연결 화살표 (데스크톱) */}
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block absolute top-8 -right-4 w-8 text-border">
                    <svg width="32" height="16" viewBox="0 0 32 16" fill="none">
                      <path d="M0 8h28M24 2l6 6-6 6" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </div>
                )}
                <div className="w-16 h-16 mx-auto rounded-2xl bg-accent/12 flex items-center justify-center text-accent text-xl font-extrabold mb-4">
                  {s.num}
                </div>
                <h3 className="font-bold text-text mb-2">{s.title}</h3>
                <p className="text-xs text-dim leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ 가격 비교 ═══════════════════ */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <span className="text-xs font-bold text-accent bg-accent/12 px-3 py-1 rounded-full">PRICING</span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-4 mb-3">
            합리적인 가격
          </h2>
          <p className="text-sm text-dim max-w-lg mx-auto">
            무료 계정으로 시작하고, 더 많은 기능이 필요할 때 구독하세요.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* 무료 */}
          <div className="bg-surface rounded-2xl border border-border p-8 flex flex-col">
            <div className="mb-6">
              <span className="text-xs font-bold px-2.5 py-1 rounded bg-up/12 text-up">무료</span>
              <h3 className="text-2xl font-extrabold mt-3">₩0</h3>
              <p className="text-xs text-dim mt-1">영구 무료</p>
            </div>
            <ul className="space-y-3 flex-1">
              {['키워드 목록 전체 열람', '일일 추천 키워드 3개', '참여자 수 · 블루오션 지표 확인', '기본 인플루언서 검색'].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-dim">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up flex-shrink-0">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/auth/signup"
              className="mt-8 block text-center py-3 rounded-xl border-2 border-border text-text font-bold hover:border-accent/50 hover:bg-surface-hover transition-all text-sm">
              무료로 시작하기
            </Link>
          </div>

          {/* PRO */}
          <div className="bg-surface rounded-2xl border-2 border-accent p-8 flex flex-col relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-4 py-1 bg-accent text-white text-xs font-bold rounded-full shadow-md">추천</span>
            </div>
            <div className="mb-6">
              <span className="text-xs font-bold px-2.5 py-1 rounded bg-accent/12 text-accent">PRO</span>
              <h3 className="text-2xl font-extrabold mt-3">
                ₩9,900<span className="text-sm font-normal text-dim">/월</span>
              </h3>
              <p className="text-xs text-dim mt-1">모든 기능 무제한</p>
            </div>
            <ul className="space-y-3 flex-1">
              {[
                '키워드 상세 분석 무제한',
                '인플루언서 순위 전체 열람',
                '검색량 트렌드 차트',
                '일일 추천 키워드 전체',
                '내 대시보드 + 경쟁자 비교',
                '실시간 데이터 업데이트',
              ].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent flex-shrink-0">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/subscribe"
              className="mt-8 block text-center py-3 rounded-xl bg-accent text-white font-bold hover:bg-accent-hover transition-all text-sm shadow-md hover:shadow-lg">
              PRO 구독하기 →
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════ 이런 분들에게 추천 ═══════════════════ */}
      <section className="bg-surface border-y border-border">
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-accent bg-accent/12 px-3 py-1 rounded-full">FOR YOU</span>
            <h2 className="text-2xl md:text-3xl font-extrabold mt-4 mb-3">
              이런 분들에게 추천합니다
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
            {[
              {
                emoji: '📊',
                title: '키워드챌린지 시작하는 분',
                desc: '어떤 키워드에 참여해야 할지 모르겠다면, 블루오션 키워드 추천으로 시작하세요.',
              },
              {
                emoji: '🏆',
                title: '상위 노출을 원하는 분',
                desc: '현재 순위를 추적하고, 경쟁자 분석을 통해 전략적으로 순위를 올리세요.',
              },
              {
                emoji: '📈',
                title: '데이터 기반 전략이 필요한 분',
                desc: '감이 아닌 데이터로 키워드를 선택하고, 트렌드 변화를 놓치지 마세요.',
              },
            ].map(item => (
              <div key={item.title}
                className="bg-bg rounded-2xl border border-border p-6 text-center hover:border-accent/30 transition-all">
                <div className="text-4xl mb-4">{item.emoji}</div>
                <h3 className="font-bold text-text mb-2">{item.title}</h3>
                <p className="text-xs text-dim leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════ FAQ ═══════════════════ */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <span className="text-xs font-bold text-accent bg-accent/12 px-3 py-1 rounded-full">FAQ</span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-4 mb-3">
            자주 묻는 질문
          </h2>
        </div>

        <div className="max-w-2xl mx-auto space-y-3">
          {FAQS.map((faq, i) => (
            <div key={i} className="bg-surface rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer hover:bg-surface-hover transition-colors"
              >
                <span className="text-sm font-bold text-text">{faq.q}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-dim flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {openFaq === i && (
                <div className="px-6 pb-4">
                  <p className="text-sm text-dim leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════ 하단 CTA ═══════════════════ */}
      <section className="bg-gradient-to-r from-accent to-accent2">
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-20 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-extrabold mb-3">
            지금 바로 시작하세요
          </h2>
          <p className="text-sm text-white/80 mb-8 max-w-md mx-auto">
            무료 가입으로 키워드챌린지 분석을 시작하세요.<br />
            더 스마트한 키워드 전략이 기다리고 있습니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup"
              className="px-8 py-4 bg-white text-accent font-extrabold rounded-xl hover:bg-white/90 transition-all text-sm shadow-lg">
              무료 회원가입 →
            </Link>
            <Link href="/auth/login"
              className="px-8 py-4 bg-white/15 backdrop-blur-sm text-white font-bold rounded-xl hover:bg-white/25 transition-all text-sm border border-white/20">
              이미 계정이 있으신가요?
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
