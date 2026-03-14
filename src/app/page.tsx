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

/* ── 방문자/가입자 통계 ── */
function useSiteStats() {
  const [s, setS] = useState({ totalVisits: 0, todayVisits: 0, totalSignups: 0, todaySignups: 0 });
  useEffect(() => {
    fetch('/api/analytics/stats').then(r => r.json()).then(setS).catch(() => {});
  }, []);
  return s;
}

/* ── 오늘의 추천키워드 ── */
interface Recommendation {
  keyword: string;
  category: string;
  reason: string;
  recommendation_score: number;
  keyword_id: string;
}

function useRecommendations() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  useEffect(() => {
    fetch('/api/recommendations').then(r => r.json()).then(d => setRecs(d.recommendations || [])).catch(() => {});
  }, []);
  return recs;
}

/* ── FAQ ── */
const FAQS = [
  { q: '무료로 사용할 수 있나요?', a: '네! 키워드 목록 열람, 커뮤니티, 검색량 조회, 블로그 등급 위젯은 무료입니다. 이용권 등록 시 모든 프리미엄 기능을 이용하실 수 있습니다.' },
  { q: '어떤 데이터를 분석할 수 있나요?', a: '네이버 인플루언서 키워드챌린지의 참여자 수, 순위 변동, 검색량 트렌드, 경쟁도 등을 분석합니다. 20개 카테고리, 수만 개의 키워드를 커버합니다.' },
  { q: '데이터는 얼마나 자주 업데이트되나요?', a: '키워드 순위와 참여자 데이터는 매일 자동으로 업데이트됩니다. 검색량 트렌드는 주간 단위로 갱신됩니다.' },
  { q: '이용권 기간이 끝나면 어떻게 되나요?', a: '이용권 기간이 끝나면 무료 기능만 이용 가능합니다. 데이터는 삭제되지 않으며, 다시 이용권을 등록하면 바로 이용 가능합니다.' },
];

export default function LandingPage() {
  const stats = useStats();
  const siteStats = useSiteStats();
  const recs = useRecommendations();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="-mt-6 -mb-10 w-screen relative left-1/2 -ml-[50vw]">

      {/* ═══════════ HERO (bg) ═══════════ */}
      <section className="bg-bg px-4 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
        <p className="text-sm text-accent font-semibold tracking-wide mb-8">
          인플루언서(구. 파워블로거 2016년 폐지)를 위한 플랫폼
        </p>

        <h1 className="font-title text-3xl md:text-5xl font-extrabold text-text leading-tight mb-6">
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

      {/* ═══════════ 오늘의 추천키워드 (surface) ═══════════ */}
      {recs.length > 0 && (
        <section className="bg-surface px-4 py-16 md:py-20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs text-accent font-semibold tracking-widest mb-3">TODAY&apos;S PICK</p>
              <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-2">오늘의 추천 키워드</h2>
              <p className="text-sm text-dim">블루오션 키워드를 매일 분석하여 추천합니다</p>
            </div>

            <div className="grid gap-3">
              {recs.slice(0, 6).map((rec, i) => (
                <Link
                  key={rec.keyword_id}
                  href={i < 3 ? `/keywords/${rec.keyword_id}` : '/subscribe'}
                  className={`relative flex items-center justify-between px-5 py-4 rounded-xl border transition ${
                    i < 3
                      ? 'bg-bg border-border hover:border-accent/40'
                      : 'bg-bg/50 border-border/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      i === 0 ? 'bg-gold/20 text-gold' : i < 3 ? 'bg-accent/15 text-accent' : 'bg-border/50 text-dim'
                    }`}>{i + 1}</span>
                    <div className={i >= 3 ? 'blur-[5px] select-none' : ''}>
                      <span className="font-semibold text-sm block">{rec.keyword}</span>
                      <span className="text-[11px] text-dim">{rec.category} · {rec.reason}</span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 shrink-0 ${i >= 3 ? 'blur-[5px] select-none' : ''}`}>
                    <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded">{rec.recommendation_score}점</span>
                  </div>
                  {i >= 3 && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                      <span className="text-xs font-bold text-accent bg-surface/90 px-3 py-1.5 rounded-full border border-accent/20">
                        🔒 이용권 등록하고 전체 보기
                      </span>
                    </div>
                  )}
                </Link>
              ))}
            </div>

            <div className="text-center mt-6">
              <Link href="/subscribe" className="text-sm text-accent font-semibold hover:underline">
                이용권 등록하고 매일 20개 추천 받기 →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ 데이터 현황 (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">DATA</p>
        <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">실시간 데이터 현황</h2>
        <p className="text-sm text-dim mb-12">매일 자동으로 수집·분석되는 네이버 인플루언서 데이터</p>

        <div className="flex justify-center gap-16 md:gap-24 mb-16">
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

        {/* 방문자 / 가입자 통계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
          <div className="bg-bg rounded-xl border border-border p-4">
            <p className="text-2xl font-extrabold text-accent font-rank">{siteStats.todayVisits.toLocaleString()}</p>
            <p className="text-[11px] text-dim mt-1">오늘 방문자</p>
          </div>
          <div className="bg-bg rounded-xl border border-border p-4">
            <p className="text-2xl font-extrabold text-text font-rank">{siteStats.totalVisits.toLocaleString()}</p>
            <p className="text-[11px] text-dim mt-1">누적 방문자</p>
          </div>
          <div className="bg-bg rounded-xl border border-border p-4">
            <p className="text-2xl font-extrabold text-up font-rank">{siteStats.todaySignups.toLocaleString()}</p>
            <p className="text-[11px] text-dim mt-1">오늘 가입자</p>
          </div>
          <div className="bg-bg rounded-xl border border-border p-4">
            <p className="text-2xl font-extrabold text-text font-rank">{siteStats.totalSignups.toLocaleString()}</p>
            <p className="text-[11px] text-dim mt-1">총 가입자</p>
          </div>
        </div>
      </section>

      {/* ═══════════ 핵심 기능 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">FEATURES</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">키워드 전략의 모든 것</h2>
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

      {/* ═══════════ 사용 방법 (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">HOW IT WORKS</p>
        <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-16">3단계로 시작하세요</h2>

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

      {/* ═══════════ 추천 대상 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">FOR YOU</p>
        <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-16">이런 분들에게 추천합니다</h2>

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

      {/* ═══════════ 가격 (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">PRICING</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">합리적인 가격</h2>
            <p className="text-sm text-dim">무료 계정으로 시작하고, 더 많은 기능이 필요할 때 이용권을 등록하세요.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-surface rounded-2xl border border-border p-8">
              <p className="text-xs font-bold text-up tracking-wide mb-3">무료</p>
              <p className="text-3xl font-extrabold text-text mb-1">₩0</p>
              <p className="text-xs text-dim mb-6">영구 무료</p>
              <div className="border-t border-border my-6" />
              <ul className="space-y-3">
                {['키워드 목록 전체 열람', '커뮤니티 · 검색량 조회', '참여자 수 · 블루오션 지표', '블로그 등급 위젯'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-dim">
                    <span className="text-up">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/signup" className="inline-block mt-8 px-6 py-2.5 rounded-full border border-border text-text text-sm font-medium hover:border-accent/50 transition-colors">
                무료로 시작하기
              </Link>
            </div>

            <div className="bg-surface rounded-2xl border-2 border-accent/30 p-8 relative">
              <div className="absolute -top-3 left-6 px-3 py-0.5 bg-accent text-white text-[10px] font-bold rounded-full">추천</div>
              <p className="text-xs font-bold text-accent tracking-wide mb-3">PRO</p>
              <p className="text-3xl font-extrabold text-text mb-1">₩9,900<span className="text-sm font-normal text-dim">/월</span></p>
              <p className="text-xs text-dim mb-6">모든 기능 무제한</p>
              <div className="border-t border-border my-6" />
              <ul className="space-y-3">
                {['키워드 상세 분석 무제한', '인플루언서 순위 전체 열람', '검색량 트렌드 차트', '일일 추천 키워드 전체', '내 대시보드 + 경쟁자 비교', '실시간 데이터 업데이트'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-dim">
                    <span className="text-accent">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/subscribe" className="inline-block mt-8 px-6 py-2.5 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors">
                이용권 등록하기 →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ FAQ (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">FAQ</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text">자주 묻는 질문</h2>
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

      {/* ═══════════ 하단 CTA (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24 text-center">
        <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">지금 바로 시작하세요</h2>
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
