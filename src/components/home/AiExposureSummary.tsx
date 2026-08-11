'use client';

import { useQuery } from '@tanstack/react-query';
import GlassCard from '@/components/dashboard/GlassCard';
import type { BlogDashboardSummary } from '@/app/api/my/blog-dashboard-summary/route';

async function fetchSummary(blogId: string): Promise<BlogDashboardSummary> {
  const res = await fetch(`/api/my/blog-dashboard-summary?blogId=${encodeURIComponent(blogId)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error('AI 현황 요약 조회 실패');
  return res.json();
}

function timeAgo(iso: string | null): string {
  if (!iso) return '확인 전';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function RateBlock({ label, cited, rate, analyzed }: { label: string; cited: number; rate: number; analyzed: number }) {
  return (
    <div className="flex-1 min-w-[120px] rounded-xl border border-border bg-surface p-3.5">
      <p className="text-[11px] text-dim font-semibold">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-2xl font-extrabold ${cited > 0 ? 'text-up' : 'text-dim'}`}>{cited}</span>
        <span className="text-xs text-dim">/ {analyzed} 건</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-bg overflow-hidden">
        <div className={`h-full rounded-full ${cited > 0 ? 'bg-up' : 'bg-border'}`} style={{ width: `${Math.min(100, rate)}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-dim">인용률 <b className={cited > 0 ? 'text-up' : 'text-dim'}>{rate}%</b></p>
    </div>
  );
}

/**
 * 'AI 브리핑·AI 탭 현황' 요약 카드 (spec #4).
 * 대시보드 상세 표(AiBriefingSection)와 동일한 소스(ai_briefing_exposures)에서 서버가 집계한 값을 그대로 쓴다.
 * 분모는 "확인 완료(check_status='ok')" 포스팅으로 통일 — 미확인/오류는 인용률에서 제외한다(정확도 원칙 #8).
 */
export default function AiExposureSummary({ blogId }: { blogId: string | null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['blog-dashboard-summary', blogId],
    queryFn: () => fetchSummary(blogId!),
    enabled: !!blogId,
    staleTime: 60 * 1000,
    retry: 1,
  });

  if (!blogId) return null;
  if (isLoading) return <div className="h-[150px] bg-surface border border-border rounded-2xl animate-pulse" />;
  if (isError || !data) return null;

  const e = data.aiExposure;

  return (
    <GlassCard padding="none">
      <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-[15px]">AI 브리핑·AI 탭 현황</h3>
        <span className="text-[11px] text-dim">
          분석 포스팅 <b className="text-text">{e.analyzedPostCount}</b>개 · 키워드 <b className="text-text">{e.analyzedKeywordCount}</b>개 · 마지막 확인 {timeAgo(e.lastCheckedAt)}
        </span>
      </div>
      <div className="p-4">
        {e.analyzedPostCount === 0 ? (
          <p className="text-sm text-dim text-center py-4">아직 확인 완료된 포스팅이 없습니다. 상세 표에서 &lsquo;확인&rsquo;을 실행하면 여기에 인용 현황이 집계됩니다.</p>
        ) : (
          <div className="flex gap-3 flex-wrap">
            <RateBlock label="AI 브리핑 인용" cited={e.briefingCitedCount} rate={e.briefingRate} analyzed={e.analyzedPostCount} />
            <RateBlock label="AI 탭 인용" cited={e.tabCitedCount} rate={e.tabRate} analyzed={e.analyzedPostCount} />
            <RateBlock label="전체(브리핑·탭)" cited={e.overallCitedCount} rate={e.overallRate} analyzed={e.analyzedPostCount} />
          </div>
        )}
      </div>
    </GlassCard>
  );
}
