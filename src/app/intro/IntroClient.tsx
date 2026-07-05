'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DemoModal from '@/components/DemoModal';
import LandingFaq from '@/components/LandingFaq';
import { formatNewInfluencerWeekRangeKst, subscribeNewInfluencerWeekBoundaryRefresh } from '@/lib/new-influencer-week-kst';

/* ── 신규 집계와 동일한 KST 주간 표기 (일요일은 전주 일요일 시작과 맞춤) ── */
function useNewInfluencerWeekRangeLabel() {
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  useEffect(() => {
    const refresh = () => setRange(formatNewInfluencerWeekRangeKst());
    refresh();
    return subscribeNewInfluencerWeekBoundaryRefresh(refresh);
  }, []);
  return range;
}

/* ── 실시간 DB 통계 ── */
function useStats() {
  const [stats, setStats] = useState({ influencer_count: 9000, active_count: 0, inactive_count: 0, new_count: 0, category_count: 20, keyword_count: 115000, total_users: 0 });
  useEffect(() => {
    const load = () => {
      fetch('/api/stats')
        .then(r => r.json())
        .then(setStats)
        .catch(err => {
          console.warn('[intro] stats 로드 실패', err instanceof Error ? err.message : err);
        });
    };
    load();
    return subscribeNewInfluencerWeekBoundaryRefresh(load);
  }, []);
  return stats;
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
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const load = () => {
      fetch('/api/influencers/recent')
        .then(r => r.json())
        .then(d => {
          setList(d.influencers || []);
          setLoaded(true);
        })
        .catch(err => {
          console.warn('[intro] 신규 인플루언서 로드 실패', err instanceof Error ? err.message : err);
          setLoaded(true);
        });
    };
    load();
    return subscribeNewInfluencerWeekBoundaryRefresh(load);
  }, []);
  return { list, loaded };
}

/* ── 성장 후기 (랜딩 하이라이트) ── */
interface FeaturedStory {
  id: string;
  title: string;
  short_excerpt: string;
  author_name: string;
  is_anonymous: boolean;
  metric_before: string | null;
  metric_after: string | null;
  period: string | null;
}

function useFeaturedStories() {
  const [list, setList] = useState<FeaturedStory[]>([]);
  useEffect(() => {
    fetch('/api/stories/featured')
      .then((r) => r.json())
      .then((d) => setList(d.stories || []))
      .catch(() => {});
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

export default function IntroClient() {
  const stats = useStats();
  const { list: newInfluencers, loaded: newInfluencersLoaded } = useNewInfluencers();
  const featuredStories = useFeaturedStories();
  const weekRange = useNewInfluencerWeekRangeLabel();
  const weekLabel = weekRange ? `${weekRange.start} ~ ${weekRange.end}` : '';
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="-mt-6 -mb-10 w-screen relative left-1/2 -ml-[50vw]">

      {/* ═══════════ HERO (bg) ═══════════ */}
      <section className="bg-white px-4 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
        <div className="mb-5 flex justify-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/15 text-accent text-[11px] font-bold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            현재 베타버전 프로그램입니다
          </span>
        </div>
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
          <Link href="/" className="px-5 py-2.5 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors">
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
          인플루언서홈 또는 블로그 주소 입력 후 7일간 핵심 기능을 무료로 이용할 수 있습니다.
        </p>
        <p className="text-[11px] text-dim/70 mt-2">
          ※ Claude AI 기능(맞춤법 검사·블로그 글 피드백)은 가입 후 이용 가능
        </p>

        <p className="text-[11px] text-dim/70 mt-3">
          네이버 크리에이터의 꿈이 실현되는 곳, 정직하고 투명한 데이터, N인플에서 확인하세요.
        </p>

        <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
      </section>

      <SectionDivider />

      {/* ═══════════ 신규 인플루언서 (surface) ═══════════ */}
      <section className="bg-accent/[0.06] px-4 py-16 md:py-20">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <p className="text-xs text-accent font-semibold tracking-widest mb-3">NEW INFLUENCERS</p>
              <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-2">신규 인플루언서</h2>
              <p className="text-sm text-dim">
                이번 주{weekLabel && <span className="text-accent font-semibold"> ({weekLabel})</span>} 선정된 인플루언서들입니다
              </p>
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
            ) : newInfluencersLoaded ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-border bg-bg/60">
                <p className="text-sm text-text font-semibold mb-1">
                  이번 주{weekLabel && <span className="text-accent"> ({weekLabel})</span>} 새로 선정된 인플루언서가 없습니다
                </p>
                <p className="text-xs text-dim">집계 주간은 매주 월요일 0시(KST)에 바뀝니다. 네이버 인플루언서 신규 선정은 비정기적이며, 해당 주간에 선정된 인플루언서가 있으면 이곳에 표시됩니다.</p>
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
      <section className="bg-bg px-4 py-20 md:py-24 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">DATA</p>
        <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">실시간 데이터 현황</h2>
        <p className="text-sm text-dim mb-12">매일 자동으로 수집·분석되며, 신규 인플루언서 수는 매주 월요일 0시(KST) 기준 주간으로 갱신됩니다.</p>

        <div className="flex justify-center gap-12 md:gap-20">
          <div>
            <p className="text-3xl md:text-4xl font-extrabold text-accent">{stats.new_count.toLocaleString()}</p>
            <p className="text-xs text-dim mt-2">신규 인플루언서</p>
            <p className="text-[10px] text-dim/60">이번 주{weekLabel && ` (${weekLabel})`}</p>
          </div>
          <div>
            <p className="text-3xl md:text-4xl font-extrabold text-text">{stats.active_count.toLocaleString()}</p>
            <p className="text-xs text-dim mt-2">활동 인플루언서</p>
          </div>
          <div>
            <p className="text-3xl md:text-4xl font-extrabold text-dim/60">{stats.inactive_count.toLocaleString()}</p>
            <p className="text-xs text-dim mt-2">미활동 인플루언서</p>
          </div>
        </div>
      </section>

      {featuredStories.length > 0 && (
        <>
          <SectionDivider />

          {/* ═══════════ 성장 후기 (surface) ═══════════ */}
          <section className="bg-accent/[0.06] px-4 py-16 md:py-20">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-10">
                <p className="text-xs text-accent font-semibold tracking-widest mb-3">GROWTH STORIES</p>
                <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-2">실사용자 성장 후기</h2>
                <p className="text-sm text-dim">N인플을 통해 성장한 인플루언서들의 이야기</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {featuredStories.map((s) => (
                  <Link
                    key={s.id}
                    href={`/stories/${s.id}`}
                    className="block p-5 rounded-xl bg-bg border border-border hover:border-accent/40 transition"
                  >
                    {(s.metric_before || s.metric_after) && (
                      <div className="flex items-center gap-2 text-xs mb-3">
                        {s.metric_before && (
                          <span className="px-2 py-0.5 rounded bg-border/40 text-dim">{s.metric_before}</span>
                        )}
                        <span className="text-accent">→</span>
                        {s.metric_after && (
                          <span className="px-2 py-0.5 rounded bg-accent/15 text-accent font-semibold">
                            {s.metric_after}
                          </span>
                        )}
                        {s.period && <span className="text-dim">({s.period})</span>}
                      </div>
                    )}
                    <h3 className="font-bold text-sm mb-2 text-text">{s.title}</h3>
                    <p className="text-sm text-dim line-clamp-3 mb-3">{s.short_excerpt}</p>
                    <p className="text-xs text-dim">— {s.author_name}</p>
                  </Link>
                ))}
              </div>

              <div className="text-center mt-8">
                <Link
                  href="/stories"
                  className="inline-block px-6 py-2.5 rounded-full bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition"
                >
                  후기 전체 보기 →
                </Link>
              </div>
            </div>
          </section>
        </>
      )}

      <SectionDivider />

      {/* ═══════════ 핵심 기능 (white) ═══════════ */}
      <section className="bg-white px-4 py-20 md:py-24">
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

      {/* ═══════════ 추천 대상 (accent) ═══════════ */}
      <section className="bg-accent/[0.06] px-4 py-20 md:py-24 text-center">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">FOR YOU</p>
        <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-16">이런 분들에게 추천합니다</h2>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto text-left">
          <div className="bg-bg rounded-2xl border border-border p-7">
            <p className="text-xs font-bold text-accent tracking-wide mb-3">블로거</p>
            <h3 className="font-bold text-text mb-3 text-lg">네이버 블로그를 운영하는 분</h3>
            <p className="text-sm text-dim leading-relaxed mb-4">블로그 품질지수와 키워드별 블로그 순위를 추적해 상위노출 전략을 세우세요. 인플루언서 선정을 준비하는 분에게도 좋습니다.</p>
            <ul className="space-y-1.5 text-xs text-dim">
              <li>· 블로그 품질지수·최적화 점수 분석</li>
              <li>· 키워드별 내 글 순위 추적</li>
              <li>· 포스트 단위 성과 분석</li>
              <li className="text-accent font-semibold pt-1">월 5,500원</li>
            </ul>
          </div>
          <div className="bg-bg rounded-2xl border border-border p-7">
            <p className="text-xs font-bold text-accent tracking-wide mb-3">인플루언서</p>
            <h3 className="font-bold text-text mb-3 text-lg">네이버 인플루언서로 활동 중인 분</h3>
            <p className="text-sm text-dim leading-relaxed mb-4">키워드챌린지 TOP3 진입과 팬 확대를 위한 데이터를 제공합니다. 경쟁자 분석과 알림으로 순위를 지키세요.</p>
            <ul className="space-y-1.5 text-xs text-dim">
              <li>· 키워드챌린지 실시간 순위 추적</li>
              <li>· 경쟁 인플루언서 비교 분석</li>
              <li>· 블루오션 키워드 추천·알림</li>
              <li className="text-accent font-semibold pt-1">월 9,900원</li>
            </ul>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════ 서비스 흐름 (bg) ═══════════ */}
      <section className="bg-bg px-4 py-20 md:py-24">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">HOW IT WORKS</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">서비스 흐름</h2>
            <p className="text-sm text-dim">가입부터 전략 실행까지 단 4단계</p>
          </div>

          <ol className="relative space-y-6 before:absolute before:left-[22px] before:top-3 before:bottom-3 before:w-px before:bg-accent/20">
            {[
              {
                step: '01',
                title: '가입하기',
                desc: '이메일 또는 네이버 계정으로 가입하세요. 7일 무료 체험이 바로 시작됩니다.',
              },
              {
                step: '02',
                title: '내 채널 연결',
                desc: '인플루언서 홈 주소나 블로그 주소를 연결하면, 채널 정보와 키워드를 자동으로 불러옵니다.',
              },
              {
                step: '03',
                title: '데이터 분석',
                desc: '키워드챌린지 순위, 블로그 품질지수, 경쟁자 비교, 검색량 트렌드를 자동으로 분석합니다.',
              },
              {
                step: '04',
                title: '전략 실행',
                desc: '대시보드와 스마트 알림으로 하락 위험·TOP3 진입 기회를 포착하고 바로 대응하세요.',
              },
            ].map((item) => (
              <li key={item.step} className="relative flex gap-5 pl-1">
                <div className="relative z-10 flex-shrink-0 w-11 h-11 rounded-full bg-accent text-white font-rank font-bold text-sm flex items-center justify-center shadow-sm">
                  {item.step}
                </div>
                <div className="flex-1 pt-1.5">
                  <h3 className="font-bold text-text mb-1">{item.title}</h3>
                  <p className="text-sm text-dim leading-relaxed">{item.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════ 서비스 미리보기 (white) ═══════════ */}
      <section className="bg-white px-4 py-20 md:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">PREVIEW</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">서비스 미리보기</h2>
            <p className="text-sm text-dim">N인플의 핵심 기능을 카테고리별로 확인하세요</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
            {[
              {
                url: 'ninfle.kr',
                title: '대시보드',
                desc: '내 키워드 순위·포스트 성과·알림을 한눈에 확인',
                link: '/',
                mockup: (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-text">맛집 추천</span>
                      <span className="text-up font-bold">2위 ▲1</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-text">서울 카페</span>
                      <span className="text-down font-bold">5위 ▼2</span>
                    </div>
                    <div className="bg-up/10 border border-up/20 rounded-md px-2 py-1">
                      <p className="text-[9px] font-bold text-up">TOP3 진입 기회</p>
                    </div>
                  </div>
                ),
              },
              {
                url: 'ninfle.kr/keywords',
                title: '키워드',
                desc: '카테고리·검색량·참여자 기준 키워드 탐색',
                link: '/keywords',
                mockup: (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="font-semibold text-text">맛집 추천</span>
                      <span className="text-dim">월 48,000</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="font-semibold text-text">서울 카페</span>
                      <span className="text-dim">월 22,100</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="font-semibold text-text">브런치 맛집</span>
                      <span className="text-up font-bold">블루오션</span>
                    </div>
                  </div>
                ),
              },
              {
                url: 'ninfle.kr/influencers',
                title: '인플루언서 리스트',
                desc: '2만명 DB에서 카테고리·키워드·점수별 인플루언서 탐색',
                link: '/influencers',
                mockup: (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 bg-bg">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim flex-shrink-0"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <span className="text-[10px] text-dim">인플루언서 검색</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-text">푸드크리에이터</span>
                      <span className="text-dim">팬 12.3만</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-text">여행블로거</span>
                      <span className="text-dim">팬 9.8만</span>
                    </div>
                  </div>
                ),
              },
              {
                url: 'ninfle.kr/rankings',
                title: '랭킹',
                desc: '인플루언서·블로그 순위와 키워드별 블로그 순위 추적',
                link: '/rankings',
                mockup: (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] py-0.5 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <span className="font-rank font-bold text-accent w-3">1</span>
                        <span className="font-semibold text-text">뷰티노트</span>
                      </div>
                      <span className="text-up font-bold">▲2</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] py-0.5 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <span className="font-rank font-bold text-accent w-3">2</span>
                        <span className="font-semibold text-text">미식가</span>
                      </div>
                      <span className="text-dim">-</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] py-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-rank font-bold text-dim w-3">3</span>
                        <span className="font-semibold text-text">여행수첩</span>
                      </div>
                      <span className="text-down font-bold">▼1</span>
                    </div>
                    <div className="pt-1 mt-1 border-t border-border/60 text-[10px] text-dim">
                      키워드 <span className="text-accent font-semibold">&quot;서울 브런치&quot;</span> 블로그 순위 →
                    </div>
                  </div>
                ),
              },
            ].map(card => (
              <Link key={card.title} href={card.link} className="bg-bg rounded-2xl border border-border overflow-hidden flex flex-col hover:border-accent/40 transition group">
                {/* 브라우저 목업 */}
                <div className="bg-surface border-b border-border">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60">
                    <div className="w-2 h-2 rounded-full bg-[#FF6058]" />
                    <div className="w-2 h-2 rounded-full bg-[#FFBD2E]" />
                    <div className="w-2 h-2 rounded-full bg-[#27CA40]" />
                    <span className="ml-2 text-[10px] text-dim truncate">{card.url}</span>
                  </div>
                  <div className="px-5 py-5 min-h-[150px] [&_.text-\[10px\]]:text-xs [&_.text-\[9px\]]:text-[11px] [&_.text-\[8px\]]:text-[10px]">
                    {card.mockup}
                  </div>
                </div>
                {/* 설명 */}
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-bold text-text mb-2 text-base group-hover:text-accent transition-colors">{card.title}</h3>
                  <p className="text-sm text-dim leading-relaxed mb-4 flex-1">{card.desc}</p>
                  <span className="text-sm text-accent font-semibold">바로가기 →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════ 자주 묻는 질문 ═══════════ */}
      <section className="bg-white py-20 md:py-24">
        <LandingFaq />
      </section>

      <SectionDivider />

      {/* ═══════════ 하단 CTA (accent) ═══════════ */}
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
      </section>
    </div>
  );
}
