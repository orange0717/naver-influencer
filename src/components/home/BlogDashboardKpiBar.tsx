'use client';

import { useQuery } from '@tanstack/react-query';
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
  visitor: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
  ),
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
const CARD_META: Record<string, { label: string; suffix: string; icon: React.ReactNode; color: 'accent' | 'up' | 'down' | 'gold' | 'dim' }> = {
  blog_today_visitors: { label: '오늘 방문자', suffix: '명', icon: ICONS.visitor, color: 'accent' },
  blog_30day_visitors: { label: '최근 30일 방문자', suffix: '명', icon: ICONS.visitor, color: 'accent' },
  blog_neighbor_count: { label: '이웃 수', suffix: '명', icon: ICONS.neighbor, color: 'accent' },
  blog_post_count: { label: '총 발행 수', suffix: '개', icon: ICONS.post, color: 'accent' },
  blog_missing_count: { label: '미노출', suffix: '건', icon: ICONS.missing, color: 'down' },
  blog_ai_briefing_cited: { label: 'AI 브리핑 인용', suffix: '건', icon: ICONS.ai, color: 'up' },
  blog_ai_tab_exposed: { label: 'AI 탭 노출', suffix: '건', icon: ICONS.ai, color: 'up' },
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
  const { data, isLoading, isError } = useQuery({
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
      <GlassCard padding="md" className="text-center">
        <p className="text-sm text-dim">KPI 데이터를 불러오지 못했습니다.</p>
      </GlassCard>
    );
  }

  const cards = data.order
    .map(key => ({ key, meta: CARD_META[key], metric: data.metrics[key] as BlogMetric | undefined }))
    .filter((c): c is { key: string; meta: (typeof CARD_META)[string]; metric: BlogMetric } => !!c.meta && !!c.metric);

  return (
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
  );
}
