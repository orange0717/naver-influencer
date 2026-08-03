'use client';

import { useQuery } from '@tanstack/react-query';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import GlassCard from '@/components/dashboard/GlassCard';
import type { BlogDashboardSummary } from '@/app/api/my/blog-dashboard-summary/route';

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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl shadow-xs h-[142px] animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <GlassCard padding="md" className="text-center">
        <p className="text-sm text-dim">KPI 데이터를 불러오지 못했습니다.</p>
      </GlassCard>
    );
  }

  const cards: { label: string; value: number; suffix: string; icon: React.ReactNode; color: 'accent' | 'up' | 'down' | 'gold' | 'dim' }[] = [
    { label: '오늘 방문자', value: data.todayVisitors, suffix: '명', icon: ICONS.visitor, color: 'accent' },
    { label: '30일 방문자', value: data.thirtyDayVisitors, suffix: '명', icon: ICONS.visitor, color: 'accent' },
    { label: '이웃수', value: data.neighborCount, suffix: '명', icon: ICONS.neighbor, color: 'accent' },
    { label: '발행 수', value: data.postCount, suffix: '개', icon: ICONS.post, color: 'accent' },
    { label: 'AI 브리핑 인용', value: data.aiBriefingCitedCount, suffix: '건', icon: ICONS.ai, color: data.aiBriefingCitedCount > 0 ? 'up' : 'dim' },
    { label: 'AI 탭 노출', value: data.aiTabExposedCount, suffix: '건', icon: ICONS.ai, color: data.aiTabExposedCount > 0 ? 'up' : 'dim' },
    { label: 'TOP10 키워드', value: data.top10KeywordCount, suffix: '개', icon: ICONS.keyword, color: data.top10KeywordCount > 0 ? 'gold' : 'dim' },
    { label: '평균 검색순위', value: data.avgRank ?? 0, suffix: '위', icon: ICONS.rank, color: 'accent' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
      {cards.map((c, i) => (
        <AnimatedStatCard
          key={c.label}
          label={c.label}
          value={c.value}
          suffix={c.suffix}
          icon={c.icon}
          color={c.color}
          delay={i * 40}
          size="kpi"
        />
      ))}
    </div>
  );
}
