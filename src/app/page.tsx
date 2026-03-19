'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ── 실시간 DB 통계 ── */
function useStats() {
  const [stats, setStats] = useState({ influencer_count: 9000, category_count: 20, keyword_count: 115000, total_users: 0 });
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
  }, []);
  return stats;
}

/* ── 방문자/가입자 통계 + 방문 추적 ── */
function useSiteStats() {
  const [s, setS] = useState({ totalVisits: 0, todayVisits: 0, totalSignups: 0, todaySignups: 0 });
  useEffect(() => {
    // 방문 추적 (세션당 1회만)
    if (!sessionStorage.getItem('visited_home')) {
      sessionStorage.setItem('visited_home', '1');
      fetch('/api/analytics/track', { method: 'POST' }).catch(() => {});
    }
    // 통계 조회
    fetch('/api/analytics/stats').then(r => r.json()).then(setS).catch(() => {});
  }, []);
  return s;
}

/* ── 신규 인플루언서 ── */
interface NewInfluencer {
  id: string;
  naver_id: string;
  display_name: string;
  image_url: string | null;
  category: string;
  subscriber_count: number;
  first_seen_at: string;
}

function useNewInfluencers() {
  const [list, setList] = useState<NewInfluencer[]>([]);
  useEffect(() => {
    fetch('/api/influencers/recent')
      .then(r => r.json())
      .then(d => setList(d.influencers || []))
      .catch(() => {});
  }, []);
  return list;
}

/* ── FAQ ── */
const FAQS = [
  { q: '인플루언서도 무료로 사용할 수 있나요?', a: '네! 키워드 분석, 순위 추적, 인플루언서 검색, 커뮤니티 등 핵심 기능을 무료로 이용할 수 있습니다.' },
  { q: '어떤 데이터를 분석할 수 있나요?', a: '108만 인플루언서 DB, 키워드챌린지 순위·경쟁도, 검색량 트렌드 등을 제공합니다. 20개 카테고리, 11만 개 이상의 키워드를 커버합니다.' },
  { q: '비즈니스/에이전시 플랜은 어떤 분들에게 적합한가요?', a: '체험단을 운영하거나, 인플루언서 마케팅을 진행하는 소상공인·마케팅 대행사에 적합합니다. 인플루언서 검색·컨택, 캠페인 관리 등의 기능을 제공합니다.' },
  { q: '데이터는 얼마나 자주 업데이트되나요?', a: '키워드 순위와 인플루언서 데이터는 매일 자동으로 업데이트됩니다. 검색량 트렌드는 주간 단위로 갱신됩니다.' },
];

export default function LandingPage() {
  const stats = useStats();
  const siteStats = useSiteStats();
  const newInfluencers = useNewInfluencers();
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
          <Link href="/my" className="px-5 py-2.5 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors">
            대시보드
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

      {/* ═══════════ 신규 인플루언서 (surface) ═══════════ */}
      {newInfluencers.length > 0 && (
        <section className="bg-surface px-4 py-16 md:py-20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs text-accent font-semibold tracking-widest mb-3">NEW INFLUENCERS</p>
              <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-2">이번 주 신규 인플루언서</h2>
              <p className="text-sm text-dim">최근 7일간 새로 등록된 인플루언서들입니다</p>
            </div>

            <div className="grid gap-3">
              {newInfluencers.slice(0, 8).map((inf) => (
                <Link
                  key={inf.id}
                  href={`/influencers/${inf.id}`}
                  className="flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-bg hover:border-accent/40 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {inf.image_url ? (
                      <img src={inf.image_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                        {inf.display_name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-semibold text-sm block truncate">{inf.display_name}</span>
                      <span className="text-[11px] text-dim">@{inf.naver_id} · {inf.category}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-dim">팬 {inf.subscriber_count.toLocaleString()}</span>
                  </div>
                </Link>
              ))}
            </div>

            <div className="text-center mt-6">
              <Link href="/influencers" className="text-sm text-accent font-semibold hover:underline">
                전체 인플루언서 보기 →
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

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto text-left">
          <div className="bg-bg rounded-2xl border border-border p-6">
            <p className="text-xs font-bold text-accent tracking-wide mb-3">네이버 인플루언서</p>
            <h3 className="font-bold text-text mb-2">키워드챌린지를 시작하는 분</h3>
            <p className="text-sm text-dim leading-relaxed">블루오션 키워드를 발굴하고, 내 순위와 경쟁도를 분석하세요. 무료로 시작할 수 있습니다.</p>
          </div>
          <div className="bg-bg rounded-2xl border border-border p-6">
            <p className="text-xs font-bold text-accent tracking-wide mb-3">네이버 인플루언서</p>
            <h3 className="font-bold text-text mb-2">상위 노출을 원하는 분</h3>
            <p className="text-sm text-dim leading-relaxed">경쟁 키워드 분석과 검색량 트렌드로 데이터 기반 전략을 수립하세요.</p>
          </div>
          <div className="bg-bg rounded-2xl border border-blue/20 p-6">
            <p className="text-xs font-bold text-blue tracking-wide mb-3">체험단 · 마케팅 에이전시</p>
            <h3 className="font-bold text-text mb-2">인플루언서를 찾는 광고주</h3>
            <p className="text-sm text-dim leading-relaxed">108만 인플루언서 DB에서 카테고리·키워드별로 최적의 인플루언서를 검색하고 컨택하세요.</p>
          </div>
          <div className="bg-bg rounded-2xl border border-blue/20 p-6">
            <p className="text-xs font-bold text-blue tracking-wide mb-3">체험단 · 마케팅 에이전시</p>
            <h3 className="font-bold text-text mb-2">인플루언서 성과 분석이 필요한 업체</h3>
            <p className="text-sm text-dim leading-relaxed">체험단 선정에 필요한 인플루언서 키워드 순위 분석, 영향력 리포트를 제공합니다.</p>
          </div>
        </div>
      </section>

      {/* ═══════════ 가격 (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">PRICING</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">서비스 요금</h2>
            <p className="text-sm text-dim">인플루언서는 무료, 광고주·에이전시는 합리적인 가격으로 시작하세요.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {/* 무료 */}
            <div className="bg-surface rounded-2xl border border-border p-7">
              <p className="text-xs font-bold text-up tracking-wide mb-3">무료</p>
              <p className="text-3xl font-extrabold text-text mb-1">₩0</p>
              <p className="text-xs text-dim mb-6">네이버 인플루언서</p>
              <div className="border-t border-border my-5" />
              <ul className="space-y-2.5">
                {['키워드 분석 · 검색량 조회', '키워드챌린지 순위 추적', '인플루언서 검색', '커뮤니티 참여', '블루오션 키워드 추천'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-dim">
                    <span className="text-up">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/signup" className="inline-block mt-7 px-6 py-2.5 rounded-full border border-border text-text text-sm font-medium hover:border-accent/50 transition-colors">
                무료로 시작하기
              </Link>
            </div>

            {/* 비즈니스 */}
            <div className="bg-surface rounded-2xl border-2 border-accent/30 p-7 relative">
              <div className="absolute -top-3 left-6 px-3 py-0.5 bg-accent text-white text-[10px] font-bold rounded-full">추천</div>
              <p className="text-xs font-bold text-accent tracking-wide mb-3">BUSINESS</p>
              <p className="text-3xl font-extrabold text-text mb-1">₩19,800<span className="text-sm font-normal text-dim">/월</span></p>
              <p className="text-xs text-dim mb-6">소상공인 · 체험단 운영</p>
              <div className="border-t border-border my-5" />
              <ul className="space-y-2.5">
                {['인플루언서 상세 검색 · 필터링', '카테고리별 인플루언서 리스트', '키워드 순위 분석 (무제한)', '체험단 모집 캠페인 등록', '인플루언서 컨택 기능', '키워드 트렌드 리포트'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-dim">
                    <span className="text-accent">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/subscribe" className="inline-block mt-7 px-6 py-2.5 rounded-full bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors">
                비즈니스 시작하기 →
              </Link>
            </div>

            {/* 에이전시 */}
            <div className="bg-surface rounded-2xl border-2 border-blue/30 p-7 relative">
              <div className="absolute -top-3 left-6 px-3 py-0.5 bg-blue text-white text-[10px] font-bold rounded-full">대행사</div>
              <p className="text-xs font-bold text-blue tracking-wide mb-3">AGENCY</p>
              <p className="text-3xl font-extrabold text-text mb-1">₩99,000<span className="text-sm font-normal text-dim">/월</span></p>
              <p className="text-xs text-dim mb-6">마케팅 대행사 · 에이전시</p>
              <div className="border-t border-border my-5" />
              <ul className="space-y-2.5">
                {['BUSINESS 기능 전체 포함', '키워드 순위 심층 분석', '인플루언서 리스트 다운로드', '다중 캠페인 동시 운영', '에이전시 전용 대시보드', '성과 리포트 · API 연동'].map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-dim">
                    <span className="text-blue">&#10003;</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/subscribe" className="inline-block mt-7 px-6 py-2.5 rounded-full bg-blue text-white text-sm font-medium hover:bg-blue/80 transition-colors">
                에이전시 플랜 시작 →
              </Link>
            </div>
          </div>

          <p className="text-center text-xs text-dim mt-6">
            연간 결제 시 2개월 무료 · 부가세 별도 ·{' '}
            <Link href="/subscribe" className="text-accent hover:underline">자세히 보기</Link>
          </p>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-lg mx-auto mt-12">
          <div className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[11px] text-dim mb-0.5">오늘 방문</p>
            <p className="text-lg font-extrabold text-accent font-rank">{siteStats.todayVisits.toLocaleString()}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[11px] text-dim mb-0.5">누적 방문</p>
            <p className="text-lg font-extrabold text-text font-rank">{siteStats.totalVisits.toLocaleString()}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[11px] text-dim mb-0.5">신규 가입</p>
            <p className="text-lg font-extrabold text-up font-rank">{siteStats.todaySignups.toLocaleString()}</p>
          </div>
          <div className="bg-surface rounded-xl border border-border p-3 text-center">
            <p className="text-[11px] text-dim mb-0.5">누적 가입</p>
            <p className="text-lg font-extrabold text-text font-rank">{siteStats.totalSignups.toLocaleString()}</p>
          </div>
        </div>

        <p className="text-xs text-dim mt-6">
          이미 계정이 있으신가요?{' '}
          <Link href="/auth/login" className="text-accent font-semibold hover:underline">로그인</Link>
        </p>
      </section>
    </div>
  );
}
