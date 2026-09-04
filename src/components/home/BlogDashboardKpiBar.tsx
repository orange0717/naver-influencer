'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import GlassCard from '@/components/dashboard/GlassCard';
import KpiGrid from '@/components/dashboard/KpiGrid';
import type { BlogDashboardSummary, BlogMetric, BlogMetricStatus } from '@/app/api/my/blog-dashboard-summary/route';

async function fetchSummary(blogId: string): Promise<BlogDashboardSummary> {
  const res = await fetch(`/api/my/blog-dashboard-summary?blogId=${encodeURIComponent(blogId)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('KPI 요약 조회 실패');
  return res.json();
}

const ICONS = {
  neighbor: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  ),
  post: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></svg>
  ),
  ai: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" /><path d="M12 8v4l3 3" /></svg>
  ),
  keyword: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
  ),
  rank: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
  ),
  missing: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
  ),
};

// KPI 카드 표시 메타(라벨·단위·아이콘·정상값 색상). 데이터/상태는 서버 metric에서 온다.
// challenge(키워드챌린지)는 블로그 데이터가 아니므로 이 목록에 없음 — 인플루언서 대시보드(/my)로 분리됨.
// AI 브리핑 인용·AI 탭 노출은 KPI 카드로 표시한다. 단, 상세 요약 패널(AiExposureSummary)은
// 대시보드에서 제거되어 상세는 별도 'AI 브리핑 · AI 탭 인용' 탭(/my/naver-mate)에서 확인한다.
const CARD_META: Record<string, { label: string; suffix: string; icon: React.ReactNode; color: 'accent' | 'up' | 'down' | 'gold' | 'dim' }> = {
  // 방문자 KPI(오늘/30일)는 제거됨 — 이 대시보드는 방문자 통계가 아니라 검색 노출·키워드 성과 분석 화면.
  blog_neighbor_count: { label: '이웃 수', suffix: '명', icon: ICONS.neighbor, color: 'accent' },
  blog_post_count: { label: '총 발행 수', suffix: '개', icon: ICONS.post, color: 'accent' },
  // 2026-09-04(R2): 집계 범위가 최근 10개 글로 좁혀졌다. size="kpi" 는 description 을 렌더하지 않으므로
  // 기준을 라벨에 적는다 — 안 적으면 전체 글 기준 숫자로 읽힌다.
  blog_missing_count: { label: '미노출 (최근 10개)', suffix: '건', icon: ICONS.missing, color: 'down' },
  blog_ai_overall_cited: { label: 'AI 인용', suffix: '건', icon: ICONS.ai, color: 'up' },
  blog_ai_briefing_cited: { label: 'AI 브리핑 인용', suffix: '건', icon: ICONS.ai, color: 'up' },
  blog_ai_tab_exposed: { label: 'AI 탭 노출', suffix: '건', icon: ICONS.ai, color: 'up' },
  blog_ai_partial_cited: { label: '일부 인용', suffix: '건', icon: ICONS.ai, color: 'gold' },
  blog_top10_keywords: { label: 'TOP10 키워드', suffix: '개', icon: ICONS.keyword, color: 'gold' },
  blog_avg_rank: { label: '평균 검색순위', suffix: '위', icon: ICONS.rank, color: 'accent' },
};

// 상태값 → 화면 문구(정확도 원칙 #5). FRESH만 실제 숫자를 표시한다.
const STATUS_LABEL: Record<Exclude<BlogMetricStatus, 'FRESH'>, string> = {
  CHECKING: '확인 중',
  NEEDS_CONNECTION: '연결 필요',
  UNVERIFIED: '미확인',
  ERROR: '확인 오류',
};

export default function BlogDashboardKpiBar({ blogId }: { blogId: string | null }) {
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['blog-dashboard-summary', blogId],
    queryFn: () => fetchSummary(blogId!),
    enabled: !!blogId,
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (!blogId) return null;

  if (isLoading) {
    return (
      <KpiGrid>
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-lg shadow-xs h-[150px] animate-pulse" />
        ))}
      </KpiGrid>
    );
  }

  if (isError || !data) {
    return (
      <GlassCard padding="md" className="text-center space-y-2">
        <p className="text-sm text-text font-semibold">KPI 요약을 불러오지 못했습니다.</p>
        {/* 수치가 0인 것과 조회 자체가 실패한 것은 다른 상태다. 다시 시도할 방법도 함께 준다. */}
        <p className="text-xs text-dim">수치가 0인 것이 아니라 조회 자체가 되지 않은 상태입니다.</p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-4 py-2 bg-accent text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
        >
          {isFetching ? '다시 불러오는 중…' : '다시 시도'}
        </button>
      </GlassCard>
    );
  }

  const cards = data.order
    .map(key => ({ key, meta: CARD_META[key], metric: data.metrics[key] as BlogMetric | undefined }))
    .filter((c): c is { key: string; meta: (typeof CARD_META)[string]; metric: BlogMetric } => !!c.meta && !!c.metric);

  return (
    <div className="space-y-4">
      <KpiGrid>
        {cards.map(({ key, meta, metric }, i) => {
          const isFresh = metric.status === 'FRESH' && metric.value !== null;
          const statusText = isFresh ? undefined : STATUS_LABEL[metric.status as Exclude<BlogMetricStatus, 'FRESH'>];
          // 실제 값이 0이면 정상 dim 처리, 양수면 지정 색상. 상태문구일 땐 카드가 알아서 dim 처리.
          const color = isFresh && (metric.value ?? 0) > 0 ? meta.color : 'dim';
          return (
            <AnimatedStatCard
              key={key}
              label={meta.label}
              value={isFresh ? (metric.value as number) : 0}
              statusText={statusText}
              suffix={meta.suffix}
              icon={meta.icon}
              color={color}
              href={metric.href}
              delay={i * 40}
              size="kpi"
            />
          );
        })}
      </KpiGrid>

      <AiCitationSummary aiExposure={data.aiExposure} />
    </div>
  );
}

/** 대시보드 AI 인용 현황(스펙 #21/#22/#23/#25) — blog-dashboard-summary의 aiExposure만 읽어 렌더(API 재호출 없음). */
function AiCitationSummary({ aiExposure }: { aiExposure: BlogDashboardSummary['aiExposure'] }) {
  // 실제 확인 완료 데이터가 있을 때만 노출(숫자를 지어내지 않음, 스펙 #21).
  if (!aiExposure.ok || aiExposure.analyzedPostCount === 0) return null;

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  return (
    <GlassCard padding="md" className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-[15px]">AI 인용 현황</h3>
          <Link href="/my/naver-mate" className="text-[11px] text-accent hover:underline">자세히 →</Link>
        </div>
        <span className="text-[11px] text-dim">
          AI 인용 데이터 최근 확인 {fmt(aiExposure.lastCheckedAt)}
        </span>
      </div>

      <div className="flex items-center gap-5 flex-wrap">
        {/* 인용률 (스펙 #23) — 분모는 확인 완료 포스팅만 */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-extrabold font-rank text-up">{aiExposure.overallRate}</span>
          <span className="text-sm text-dim">% 인용률</span>
        </div>
        <div className="text-[11px] text-dim leading-relaxed">
          확인 완료 <b className="text-text">{aiExposure.analyzedPostCount.toLocaleString()}</b>개 중{' '}
          <b className="text-up">{aiExposure.overallCitedCount.toLocaleString()}</b>개 인용 ·{' '}
          일부 {aiExposure.partialCitedCount.toLocaleString()} · 미인용 {aiExposure.notCitedCount.toLocaleString()} · 미확인 {aiExposure.uncheckedCount.toLocaleString()}
        </div>
      </div>

      {/* 최근 AI 인용 포스팅 (스펙 #22) */}
      {aiExposure.recentCited.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-dim">최근 AI 인용 포스팅</p>
          <ul className="divide-y divide-border/30">
            {aiExposure.recentCited.map(r => (
              <li key={`${r.postId}-${r.keyword}`} className="py-1.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.title || r.keyword}</p>
                  <p className="text-[11px] text-dim">대표키워드: {r.keyword}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {r.briefingCited && <span className="text-[10px] font-bold text-up bg-up/10 px-1.5 py-0.5 rounded-full">브리핑</span>}
                  {r.tabCited && <span className="text-[10px] font-bold text-up bg-up/10 px-1.5 py-0.5 rounded-full">AI탭</span>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
