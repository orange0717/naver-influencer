'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DemoModal from '@/components/DemoModal';


/* ── 실시간 DB 통계 ── */
function useStats() {
  const [stats, setStats] = useState({ influencer_count: 9000, active_count: 0, inactive_count: 0, new_count: 0, category_count: 20, keyword_count: 115000, total_users: 0 });
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
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetch('/api/influencers/recent')
      .then(r => r.json())
      .then(d => {
        setList(d.influencers || []);
        setLoaded(true);
      })
      .catch(err => {
        console.warn('[landing] 신규 인플루언서 로드 실패', err instanceof Error ? err.message : err);
        setLoaded(true);
      });
  }, []);
  return { list, loaded };
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
  const { list: newInfluencers, loaded: newInfluencersLoaded } = useNewInfluencers();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="-mt-6 -mb-10 w-screen relative left-1/2 -ml-[50vw]">

      {/* ═══════════ HERO (bg) ═══════════ */}
      <section className="bg-accent/[0.06] px-4 pt-20 pb-24 md:pt-28 md:pb-32 text-center">
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
          인플루언서홈 또는 블로그 주소 입력 후 7일간 모든 기능을 무료로 이용할 수 있습니다.
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
            ) : newInfluencersLoaded ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-border bg-bg/60">
                <p className="text-sm text-text font-semibold mb-1">최근 7일간 새로 선정된 인플루언서가 없습니다</p>
                <p className="text-xs text-dim">네이버 인플루언서 신규 선정은 비정기적으로 이루어집니다. 새로운 인플루언서가 선정되면 이곳에 표시됩니다.</p>
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

        <div className="flex justify-center gap-12 md:gap-20">
          <div>
            <p className="text-3xl md:text-4xl font-extrabold text-accent">{stats.new_count.toLocaleString()}</p>
            <p className="text-xs text-dim mt-2">신규 인플루언서</p>
            <p className="text-[10px] text-dim/60">최근 일주일</p>
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

      {/* ═══════════ 추천 대상 (bg) ═══════════ */}
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

      {/* ═══════════ 서비스 흐름 (surface) ═══════════ */}
      <section className="bg-surface px-4 py-20 md:py-24">
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

      {/* ═══════════ 서비스 미리보기 (bg) ═══════════ */}
      <section className="bg-accent/[0.06] px-4 py-20 md:py-24">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs text-accent font-semibold tracking-widest mb-3">PREVIEW</p>
            <h2 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-4">서비스 미리보기</h2>
            <p className="text-sm text-dim">N인플의 핵심 기능을 카테고리별로 확인하세요</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                url: 'ninfl.co.kr/influencers',
                category: '인플루언서 분석',
                title: '인플루언서 검색·랭킹',
                desc: '2만명 규모 인플루언서 DB에서 검색·카테고리·키워드·점수별로 분석하고 경쟁자를 비교합니다.',
                features: ['카테고리별 랭킹', 'TOP3 키워드 점유율', '경쟁 인플루언서 비교'],
                link: '/rankings/influencer',
                linkText: '인플루언서 랭킹 →',
                mockup: (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] py-1 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <span className="font-rank font-bold text-accent w-4">1</span>
                        <span className="font-semibold text-text">푸드크리에이터</span>
                      </div>
                      <span className="text-dim">팬 12.3만</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] py-1 border-b border-border/60">
                      <div className="flex items-center gap-2">
                        <span className="font-rank font-bold text-accent w-4">2</span>
                        <span className="font-semibold text-text">여행블로거</span>
                      </div>
                      <span className="text-dim">팬 9.8만</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-rank font-bold text-dim w-4">3</span>
                        <span className="font-semibold text-text">카페투어</span>
                      </div>
                      <span className="text-dim">팬 7.2만</span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-accent pt-1">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      TOP3 점유율·챌린지수 확인
                    </div>
                  </div>
                ),
              },
              {
                url: 'ninfl.co.kr/blog-quality',
                category: '블로거 분석',
                title: '블로그 품질지수·순위',
                desc: '네이버 블로그 품질지수와 최적화 점수, 키워드별 블로그 순위를 추적합니다.',
                features: ['블로그 품질지수 조회', '키워드별 블로그 순위', '블로거 랭킹 8만+'],
                link: '/blog-quality',
                linkText: '블로그 품질 확인 →',
                mockup: (
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-accent">블로그 품질지수</div>
                    <div className="flex items-end gap-2">
                      <span className="font-rank font-extrabold text-accent text-2xl leading-none">87</span>
                      <span className="text-[9px] text-dim pb-1">/ 100</span>
                      <span className="text-[9px] text-up font-bold pb-1 ml-auto">+3</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-accent/10 overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: '87%' }} />
                    </div>
                    <div className="grid grid-cols-3 gap-1 pt-1 text-[9px] text-center">
                      <div className="py-1 rounded bg-bg">
                        <p className="text-dim">최적화</p>
                        <p className="font-bold text-text">A</p>
                      </div>
                      <div className="py-1 rounded bg-bg">
                        <p className="text-dim">활동성</p>
                        <p className="font-bold text-text">B+</p>
                      </div>
                      <div className="py-1 rounded bg-bg">
                        <p className="text-dim">신뢰도</p>
                        <p className="font-bold text-text">A</p>
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                url: 'ninfl.co.kr/my',
                category: '내 성장 관리',
                title: '대시보드·순위 추적·알림',
                desc: '내 키워드 순위 변동, 포스트 분석, 하락 위험·TOP3 기회를 한 곳에서 관리합니다.',
                features: ['키워드 순위 실시간 추적', '포스트 단위 성과 분석', '스마트 알림'],
                link: '/my',
                linkText: '내 대시보드 →',
                mockup: (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-text">맛집 추천</span>
                      <span className="text-up font-bold">2위 ▲1</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-semibold text-text">서울 카페</span>
                      <span className="text-down font-bold">5위 ▼2</span>
                    </div>
                    <div className="bg-down/10 border border-down/20 rounded-md px-2 py-1.5">
                      <p className="text-[9px] font-bold text-down">하락 위험</p>
                      <p className="text-[9px] text-dim">&quot;서울 카페&quot; 2일 연속 하락</p>
                    </div>
                    <div className="bg-up/10 border border-up/20 rounded-md px-2 py-1.5">
                      <p className="text-[9px] font-bold text-up">TOP3 진입 기회</p>
                      <p className="text-[9px] text-dim">&quot;브런치 맛집&quot; 상승 추세</p>
                    </div>
                  </div>
                ),
              },
            ].map(card => (
              <div key={card.title} className="bg-bg rounded-2xl border border-border overflow-hidden flex flex-col">
                {/* 브라우저 목업 */}
                <div className="bg-surface border-b border-border">
                  <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60">
                    <div className="w-2 h-2 rounded-full bg-[#FF6058]" />
                    <div className="w-2 h-2 rounded-full bg-[#FFBD2E]" />
                    <div className="w-2 h-2 rounded-full bg-[#27CA40]" />
                    <span className="ml-2 text-[9px] text-dim truncate">{card.url}</span>
                  </div>
                  <div className="px-4 py-4 min-h-[140px]">
                    {card.mockup}
                  </div>
                </div>
                {/* 설명 */}
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-[11px] font-bold text-accent tracking-wide mb-1.5">{card.category}</p>
                  <h3 className="font-bold text-text mb-2">{card.title}</h3>
                  <p className="text-xs text-dim leading-relaxed mb-3">{card.desc}</p>
                  <ul className="space-y-1 text-[11px] text-dim mb-4">
                    {card.features.map(f => (
                      <li key={f} className="flex items-start gap-1.5">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-accent mt-0.5 flex-shrink-0"><path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={card.link} className="text-sm text-accent font-semibold hover:underline mt-auto">
                    {card.linkText}
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
