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

/* ── 기능 데이터 ── */
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

/* ── 사용 방법 ── */
const STEPS = [
  { num: '01', title: '회원가입', desc: '무료로 가입하고 네이버 인플루언서 계정을 연결하세요.' },
  { num: '02', title: '키워드 분석', desc: '수만 개 키워드의 참여자, 검색량, 경쟁도를 확인하세요.' },
  { num: '03', title: '전략 수립', desc: '블루오션 키워드를 선점하고 순위 변동을 실시간으로 추적하세요.' },
];

/* ── FAQ ── */
const FAQS = [
  { q: '무료로 사용할 수 있나요?', a: '네, 무료 회원도 키워드 목록 열람, 일일 추천 키워드 3개, 참여자 수 확인이 가능합니다. PRO 구독 시 모든 기능을 무제한으로 이용하실 수 있습니다.' },
  { q: '어떤 데이터를 분석할 수 있나요?', a: '네이버 인플루언서 키워드챌린지의 참여자 수, 순위 변동, 검색량 트렌드, 경쟁도 등을 분석합니다. 20개 카테고리, 수만 개의 키워드를 커버합니다.' },
  { q: '데이터는 얼마나 자주 업데이트되나요?', a: '키워드 순위와 참여자 데이터는 매일 자동으로 업데이트됩니다. 검색량 트렌드는 주간 단위로 갱신됩니다.' },
  { q: '구독을 해지하면 어떻게 되나요?', a: '구독 기간이 끝나면 무료 계정으로 전환되며, 기본 기능은 계속 이용 가능합니다. 데이터는 삭제되지 않습니다.' },
];

/* ══════════════════════════════════════════
   메인 랜딩 페이지
   ══════════════════════════════════════════ */
export default function LandingPage() {
  const stats = useStats();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="-mx-4 -mt-6">

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-accent via-accent2 to-[#7A4F4A]">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
          <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-white/5" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-20 md:py-28 text-center text-white">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold mb-6">
            <span className="w-2 h-2 rounded-full bg-up animate-pulse" />
            네이버 인플루언서들을 위한 플랫폼
          </div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-5">
            N인플,<br className="md:hidden" /> 더 스마트하게
          </h1>
          <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto mb-8 leading-relaxed">
            수만 개 키워드의 검색량·경쟁도·순위를 한눈에 분석하고<br className="hidden md:block" />
            블루오션 키워드를 발굴하여 상위 노출을 달성하세요.
          </p>

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

          <div className="grid grid-cols-3 gap-6 max-w-lg mx-auto">
            <div>
              <p className="text-2xl md:text-3xl font-extrabold"><AnimatedCount target={stats.influencer_count} suffix="+" /></p>
              <p className="text-xs text-white/60 mt-1">인플루언서</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-extrabold"><AnimatedCount target={stats.keyword_count} suffix="+" /></p>
              <p className="text-xs text-white/60 mt-1">키워드</p>
            </div>
            <div>
              <p className="text-2xl md:text-3xl font-extrabold"><AnimatedCount target={stats.category_count} /></p>
              <p className="text-xs text-white/60 mt-1">카테고리</p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-14">
          <span className="text-xs font-bold text-accent tracking-widest">FEATURES</span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-3 mb-3">키워드 전략의 모든 것</h2>
          <p className="text-sm text-dim max-w-lg mx-auto">데이터 기반의 키워드 분석으로 네이버 인플루언서 키워드챌린지에서 경쟁 우위를 확보하세요.</p>
        </div>

        <div className="space-y-16 max-w-3xl mx-auto">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={`flex flex-col md:flex-row items-center gap-6 md:gap-10 ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}>
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0
                ${f.color === 'accent' ? 'bg-accent/15 text-accent' :
                  f.color === 'up' ? 'bg-up/15 text-up' :
                  f.color === 'blue' ? 'bg-blue/15 text-blue' :
                  'bg-gold/15 text-gold'}`}>
                {f.icon}
              </div>
              <div className="text-center md:text-left">
                <h3 className="text-lg font-bold text-text mb-2">{f.title}</h3>
                <p className="text-sm text-dim leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ 구분선 ═══════════ */}
      <div className="max-w-7xl mx-auto px-4"><div className="border-t border-border" /></div>

      {/* ═══════════ HOW IT WORKS ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-14">
          <span className="text-xs font-bold text-accent tracking-widest">HOW IT WORKS</span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-3 mb-3">3단계로 시작하세요</h2>
          <p className="text-sm text-dim max-w-lg mx-auto">가입부터 키워드 전략 수립까지, 3분이면 충분합니다.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-12 max-w-4xl mx-auto">
          {STEPS.map((s, i) => (
            <div key={s.num} className="relative text-center">
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-6 -right-6 w-12 text-border">
                  <svg width="48" height="16" viewBox="0 0 48 16" fill="none">
                    <path d="M0 8h44M40 2l6 6-6 6" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>
              )}
              <div className="text-4xl font-extrabold text-accent/20 mb-2">{s.num}</div>
              <h3 className="font-bold text-text mb-2">{s.title}</h3>
              <p className="text-xs text-dim leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ 구분선 ═══════════ */}
      <div className="max-w-7xl mx-auto px-4"><div className="border-t border-border" /></div>

      {/* ═══════════ PRICING ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-14">
          <span className="text-xs font-bold text-accent tracking-widest">PRICING</span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-3 mb-3">합리적인 가격</h2>
          <p className="text-sm text-dim max-w-lg mx-auto">무료 계정으로 시작하고, 더 많은 기능이 필요할 때 구독하세요.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 max-w-3xl mx-auto">
          {/* 무료 */}
          <div className="text-center md:text-left">
            <span className="text-xs font-bold px-2.5 py-1 rounded bg-up/12 text-up">무료</span>
            <h3 className="text-3xl font-extrabold mt-3 mb-1">₩0</h3>
            <p className="text-xs text-dim mb-6">영구 무료</p>
            <ul className="space-y-3 text-left">
              {['키워드 목록 전체 열람', '일일 추천 키워드 3개', '참여자 수 · 블루오션 지표 확인', '기본 인플루언서 검색'].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-dim">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up flex-shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/auth/signup" className="inline-block mt-6 px-6 py-3 border-2 border-border text-text font-bold rounded-xl hover:border-accent/50 transition-all text-sm">
              무료로 시작하기
            </Link>
          </div>

          {/* PRO */}
          <div className="text-center md:text-left relative">
            <span className="text-xs font-bold px-2.5 py-1 rounded bg-accent/12 text-accent">PRO · 추천</span>
            <h3 className="text-3xl font-extrabold mt-3 mb-1">
              ₩9,900<span className="text-sm font-normal text-dim">/월</span>
            </h3>
            <p className="text-xs text-dim mb-6">모든 기능 무제한</p>
            <ul className="space-y-3 text-left">
              {['키워드 상세 분석 무제한', '인플루언서 순위 전체 열람', '검색량 트렌드 차트', '일일 추천 키워드 전체', '내 대시보드 + 경쟁자 비교', '실시간 데이터 업데이트'].map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent flex-shrink-0"><path d="M20 6L9 17l-5-5" /></svg>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/subscribe" className="inline-block mt-6 px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition-all text-sm">
              PRO 구독하기 →
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════ 구분선 ═══════════ */}
      <div className="max-w-7xl mx-auto px-4"><div className="border-t border-border" /></div>

      {/* ═══════════ FOR YOU ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-14">
          <span className="text-xs font-bold text-accent tracking-widest">FOR YOU</span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-3 mb-3">이런 분들에게 추천합니다</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-10 max-w-4xl mx-auto text-center">
          {[
            {
              icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
              title: '키워드챌린지 시작하는 분',
              desc: '어떤 키워드에 참여해야 할지 모르겠다면, 블루오션 키워드 추천으로 시작하세요.',
            },
            {
              icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-up"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
              title: '상위 노출을 원하는 분',
              desc: '현재 순위를 추적하고, 경쟁자 분석을 통해 전략적으로 순위를 올리세요.',
            },
            {
              icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gold"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>,
              title: '데이터 기반 전략이 필요한 분',
              desc: '감이 아닌 데이터로 키워드를 선택하고, 트렌드 변화를 놓치지 마세요.',
            },
          ].map(item => (
            <div key={item.title}>
              <div className="w-14 h-14 mx-auto rounded-xl bg-accent/8 flex items-center justify-center mb-4">{item.icon}</div>
              <h3 className="font-bold text-text mb-2">{item.title}</h3>
              <p className="text-xs text-dim leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════ 구분선 ═══════════ */}
      <div className="max-w-7xl mx-auto px-4"><div className="border-t border-border" /></div>

      {/* ═══════════ FAQ ═══════════ */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-14">
          <span className="text-xs font-bold text-accent tracking-widest">FAQ</span>
          <h2 className="text-2xl md:text-3xl font-extrabold mt-3 mb-3">자주 묻는 질문</h2>
        </div>

        <div className="max-w-2xl mx-auto divide-y divide-border">
          {FAQS.map((faq, i) => (
            <div key={i}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between py-5 text-left cursor-pointer hover:text-accent transition-colors"
              >
                <span className="text-sm font-bold text-text">{faq.q}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
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
      </section>

      {/* ═══════════ 하단 CTA ═══════════ */}
      <section className="bg-gradient-to-r from-accent to-accent2">
        <div className="max-w-7xl mx-auto px-4 py-16 md:py-20 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-extrabold mb-3">지금 바로 시작하세요</h2>
          <p className="text-sm text-white/80 mb-8 max-w-md mx-auto">
            무료 가입으로 키워드 분석을 시작하세요.<br />
            더 스마트한 키워드 전략이 기다리고 있습니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/auth/signup" className="px-8 py-4 bg-white text-accent font-extrabold rounded-xl hover:bg-white/90 transition-all text-sm shadow-lg">
              무료 회원가입 →
            </Link>
            <Link href="/auth/login" className="px-8 py-4 bg-white/15 backdrop-blur-sm text-white font-bold rounded-xl hover:bg-white/25 transition-all text-sm border border-white/20">
              이미 계정이 있으신가요?
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
