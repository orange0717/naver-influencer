'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DemoModal from '@/components/DemoModal';


/* ── 실시간 DB 통계 ── */
function useStats() {
  const [stats, setStats] = useState({ influencer_count: 9000, category_count: 20, keyword_count: 115000, total_users: 0 });
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(err => {
      console.warn('[landing] stats 로드 실패', err instanceof Error ? err.message : err);
    });
  }, []);
  return stats;
}

/* ── 방문자/가입자 통계 + 방문 추적 ── */
function useSiteStats() {
  const [s, setS] = useState({ totalVisits: 0, todayVisits: 0, totalSignups: 0, todaySignups: 0 });
  useEffect(() => {
    // 통계 조회 (방문 추적은 VisitTracker에서 처리)
    fetch('/api/analytics/stats').then(r => r.json()).then(setS).catch(err => {
      console.warn('[landing] analytics 로드 실패', err instanceof Error ? err.message : err);
    });
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
      .catch(err => {
        console.warn('[landing] 신규 인플루언서 로드 실패', err instanceof Error ? err.message : err);
      });
  }, []);
  return list;
}

/* ── 섹션 구분선 ── */
function SectionDivider() {
  return (
    <div className="flex justify-center py-0">
      <div className="w-16 h-[2px] bg-accent/25 rounded-full" />
    </div>
  );
}

export default function LandingPage() {
  const stats = useStats();
  const siteStats = useSiteStats();
  const newInfluencers = useNewInfluencers();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="-mt-6 -mb-10 w-screen relative left-1/2 -ml-[50vw]">

      {/* ═══════════ HERO (bg) ═══════════ */}
      <section className="bg-accent/[0.06] px-4 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
        <p className="text-sm text-accent font-semibold tracking-wide mb-8">
          네이버 인플루언서를 위한 플랫폼
        </p>

        <h1 className="font-title text-3xl md:text-5xl font-extrabold text-text leading-tight mb-6">
          당신의 인플순위,<br />스마트하게 관리하세요.
        </h1>

        <p className="text-base text-dim max-w-xl mx-auto leading-relaxed mb-10">
          실시간으로 변경되는 키워드챌린지 순위를 빠르게 체크하세요.
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

        <button
          onClick={() => setDemoOpen(true)}
          className="inline-block px-10 py-4 bg-accent text-white text-sm font-bold rounded-full hover:bg-accent-hover transition-colors shadow-sm"
        >
          7일 데모체험 →
        </button>

        <p className="text-xs text-dim mt-5">
          인플루언서 ID 입력 후 7일간 모든 기능을 무료로 이용할 수 있습니다.
        </p>

        <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      </section>

      <SectionDivider />

      {/* ═══════════ 신규 인플루언서 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-16 md:py-20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs text-accent font-semibold tracking-widest mb-3">NEW INFLUENCERS</p>
              <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-2">신규 인플루언서</h2>
              <p className="text-sm text-dim">최근 선정된 인플루언서들입니다</p>
            </div>

            {newInfluencers.length > 0 ? (
              <div className="grid gap-3">
                {newInfluencers.slice(0, 10).map((inf) => (
                  <a
                    key={inf.id}
                    href={`https://in.naver.com/${inf.naver_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-bg hover:border-accent/40 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {inf.image_url ? (
                        <img src={inf.image_url} alt={inf.display_name} className="w-9 h-9 rounded-full object-cover shrink-0" />
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
                    <div className="flex items-center gap-2 shrink-0 text-right">
                      <div>
                        <span className="text-xs text-dim block">팬 {inf.subscriber_count.toLocaleString()}</span>
                        {inf.first_seen_at && (
                          <span className="text-[10px] text-dim/70">{new Date(inf.first_seen_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} 선정</span>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-dim">
                최근 선정된 인플루언서 정보를 불러오는 중...
              </div>
            )}

            <div className="text-center mt-6">
              <Link href="/influencers" className="text-sm text-accent font-semibold hover:underline">
                전체 인플루언서 보기 →
              </Link>
            </div>
          </div>
        </section>

      <SectionDivider />

      {/* ═══════════ 데이터 현황 (bg) ═══════════ */}
      <section className="bg-accent/[0.06] px-4 py-20 md:py-24 text-center">
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

      <SectionDivider />

      {/* ═══════════ 핵심 기능 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">FEATURES</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">키워드챌린지 전략의 모든 것</h2>
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

      <SectionDivider />

      {/* ═══════════ 추천 대상 (surface) ═══════════ */}
      <section className="bg-accent/[0.06] px-4 py-20 md:py-24 text-center">
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
            <h3 className="font-bold text-text mb-2">키워드챌린지에서 우위를 점하고 싶은 분</h3>
            <p className="text-sm text-dim leading-relaxed">경쟁 키워드 분석과 검색량 트렌드로 데이터 기반 전략을 수립하세요.</p>
          </div>
          <div className="bg-bg rounded-2xl border border-border p-6">
            <p className="text-xs font-bold text-accent tracking-wide mb-3">네이버 인플루언서</p>
            <h3 className="font-bold text-text mb-2">순위 하락에 빠르게 대응하고 싶은 분</h3>
            <p className="text-sm text-dim leading-relaxed">스마트 알림으로 하락 위험 키워드를 감지하고, TOP 3 진입 기회를 놓치지 마세요.</p>
          </div>
          <div className="bg-bg rounded-2xl border border-border p-6">
            <p className="text-xs font-bold text-accent tracking-wide mb-3">네이버 인플루언서</p>
            <h3 className="font-bold text-text mb-2">경쟁자와 비교하고 싶은 분</h3>
            <p className="text-sm text-dim leading-relaxed">같은 키워드에 참여 중인 인플루언서와 순위를 비교하고 전략을 세우세요.</p>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════ 서비스 미리보기 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">PREVIEW</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">서비스 미리보기</h2>
            <p className="text-sm text-dim">N인플의 핵심 기능을 확인하세요</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                url: 'ninfl.co.kr/my',
                title: '내 대시보드',
                desc: '내 인플루언서 점수, 키워드 순위, 성장 추이를 한눈에 확인하세요.',
                link: '/my',
                linkText: '대시보드 보기',
                mockup: (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-accent">종합 점수</div>
                    <div className="flex gap-1">
                      {[78, 85, 72, 90, 68, 82].map((v, i) => (
                        <div key={i} className="flex-1 bg-accent/10 rounded overflow-hidden" style={{ height: 40 }}>
                          <div className="bg-accent/40 rounded-t w-full" style={{ height: `${v}%`, marginTop: `${100 - v}%` }} />
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-[8px] text-dim">
                      <span>활동성</span><span>영향력</span><span>성장성</span><span>안정성</span><span>소통</span><span>전문성</span>
                    </div>
                  </div>
                ),
              },
              {
                url: 'ninfl.co.kr/keywords/분석',
                title: '키워드 순위 추적',
                desc: '키워드별 내 순위 변동을 실시간으로 추적하고, 하락 전에 대응하세요.',
                link: '/search-volume',
                linkText: '키워드 분석하기',
                mockup: (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-text">맛집 추천</span>
                      <span className="text-up font-bold">2위 (+1)</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-text">서울 카페</span>
                      <span className="text-down font-bold">5위 (-2)</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-text">여행 코스</span>
                      <span className="text-up font-bold">1위 (=)</span>
                    </div>
                    <div className="h-[1px] bg-border" />
                    <div className="flex items-center gap-1 text-[9px] text-accent">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      TOP3 달성률 67%
                    </div>
                  </div>
                ),
              },
              {
                url: 'ninfl.co.kr/rankings',
                title: '인플루언서 랭킹',
                desc: '분야별 인플루언서 순위와 점수를 비교하고 내 위치를 확인하세요.',
                link: '/rankings',
                linkText: '랭킹 보기',
                mockup: (
                  <div className="space-y-1.5">
                    {[
                      { rank: 1, name: '트래블제이', score: 94, change: '+2' },
                      { rank: 2, name: '맛집헌터', score: 91, change: '=' },
                      { rank: 3, name: '서울먹방', score: 88, change: '-1' },
                    ].map(r => (
                      <div key={r.rank} className="flex items-center gap-2 text-[10px]">
                        <span className={`w-4 text-center font-extrabold ${r.rank <= 3 ? 'text-accent' : 'text-dim'}`}>{r.rank}</span>
                        <span className="flex-1 font-semibold text-text">{r.name}</span>
                        <span className="text-dim">{r.score}점</span>
                        <span className={`text-[9px] ${r.change.startsWith('+') ? 'text-up' : r.change.startsWith('-') ? 'text-down' : 'text-dim'}`}>{r.change}</span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                url: 'ninfl.co.kr/alerts',
                title: '스마트 알림',
                desc: '순위 하락 위험과 TOP3 진입 기회를 자동으로 감지해 알려드립니다.',
                link: '/my',
                linkText: '알림 확인하기',
                mockup: (
                  <div className="space-y-2">
                    <div className="bg-down/10 border border-down/20 rounded-lg px-2.5 py-2">
                      <p className="text-[9px] font-bold text-down">하락 위험</p>
                      <p className="text-[9px] text-dim">&quot;맛집 추천&quot; 2일 연속 하락 (3위→5위)</p>
                    </div>
                    <div className="bg-up/10 border border-up/20 rounded-lg px-2.5 py-2">
                      <p className="text-[9px] font-bold text-up">TOP3 기회</p>
                      <p className="text-[9px] text-dim">&quot;서울 카페&quot; 현재 4위, 상승 추세</p>
                    </div>
                  </div>
                ),
              },
              {
                url: 'ninfl.co.kr/compare',
                title: '경쟁자 비교',
                desc: '같은 키워드에 참여 중인 경쟁자와 점수를 비교하고 전략을 세우세요.',
                link: '/my',
                linkText: '비교 분석하기',
                mockup: (
                  <div className="space-y-2">
                    <div className="flex items-end gap-1" style={{ height: 50 }}>
                      {[
                        { name: '나', h: 85, accent: true },
                        { name: 'A', h: 72, accent: false },
                        { name: 'B', h: 68, accent: false },
                      ].map(b => (
                        <div key={b.name} className="flex-1 text-center">
                          <div className={`rounded-t mx-auto ${b.accent ? 'bg-accent' : 'bg-border'}`} style={{ height: `${b.h}%`, width: '70%' }} />
                          <p className={`text-[8px] mt-1 ${b.accent ? 'font-bold text-accent' : 'text-dim'}`}>{b.name}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-dim text-center">종합 점수 비교</p>
                  </div>
                ),
              },
            ].map(card => (
              <div key={card.title} className="bg-surface rounded-2xl border border-border overflow-hidden">
                {/* 브라우저 목업 */}
                <div className="bg-bg border-b border-border">
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    <div className="w-2 h-2 rounded-full bg-[#FF6058]" />
                    <div className="w-2 h-2 rounded-full bg-[#FFBD2E]" />
                    <div className="w-2 h-2 rounded-full bg-[#27CA40]" />
                    <span className="ml-2 text-[9px] text-dim">{card.url}</span>
                  </div>
                  <div className="px-4 py-4">
                    {card.mockup}
                  </div>
                </div>
                {/* 설명 */}
                <div className="p-5">
                  <h3 className="font-bold text-text mb-1.5">{card.title}</h3>
                  <p className="text-xs text-dim leading-relaxed mb-3">{card.desc}</p>
                  <Link href={card.link} className="text-sm text-accent font-semibold hover:underline">
                    {card.linkText} →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════ 하단 CTA (bg) ═══════════ */}
      <section className="bg-accent/[0.06] px-4 py-20 md:py-28 text-center">
        <h2 className="font-title text-2xl md:text-4xl font-extrabold text-text mb-4">지금 바로 시작하세요</h2>
        <p className="text-sm text-dim mb-10">
          키워드챌린지는 시작일 뿐, 인플루언서 성장을 돕는 곳 N인플.
        </p>

        <button
          onClick={() => setDemoOpen(true)}
          className="inline-block px-12 py-4 bg-accent text-white text-sm font-bold rounded-full hover:bg-accent-hover transition-colors shadow-sm mb-4"
        >
          7일 데모체험 →
        </button>

        <div className="flex items-center justify-center gap-4 md:gap-6 max-w-md mx-auto mt-10">
          <div className="flex-1 bg-surface rounded-xl border border-border py-3 px-2 text-center">
            <p className="text-[11px] text-dim mb-0.5">오늘 방문</p>
            <p className="text-xl font-extrabold text-accent font-rank">{siteStats.todayVisits.toLocaleString()}</p>
          </div>
          <div className="flex-1 bg-surface rounded-xl border border-border py-3 px-2 text-center">
            <p className="text-[11px] text-dim mb-0.5">누적 방문</p>
            <p className="text-xl font-extrabold text-accent font-rank">{siteStats.totalVisits.toLocaleString()}</p>
          </div>
          <div className="flex-1 bg-surface rounded-xl border border-border py-3 px-2 text-center">
            <p className="text-[11px] text-dim mb-0.5">신규 가입</p>
            <p className="text-xl font-extrabold text-accent font-rank">{siteStats.todaySignups.toLocaleString()}</p>
          </div>
          <div className="flex-1 bg-surface rounded-xl border border-border py-3 px-2 text-center">
            <p className="text-[11px] text-dim mb-0.5">누적 가입</p>
            <p className="text-xl font-extrabold text-accent font-rank">{siteStats.totalSignups.toLocaleString()}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
