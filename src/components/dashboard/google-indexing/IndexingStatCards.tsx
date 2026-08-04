'use client';

import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import type { IndexingSummary } from '@/lib/google-indexing-types';

export default function IndexingStatCards({ summary }: { summary: IndexingSummary | null }) {
  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <AnimatedStatCard label="오늘 등록" value={summary.todayCount} suffix="건" color="accent" />
      <AnimatedStatCard label="이번주 등록" value={summary.weekCount} suffix="건" color="accent" />
      <AnimatedStatCard label="색인 성공" value={summary.indexedCount} suffix="건" color="up" />
      <AnimatedStatCard label="색인 실패" value={summary.failedCount} suffix="건" color="down" />
      <AnimatedStatCard label="처리 중" value={summary.processingCount} suffix="건" color="gold" />
      <AnimatedStatCard
        label="평균 처리시간"
        value={summary.avgProcessingHours ?? 0}
        suffix="시간"
        placeholder="집계중"
        color="gold"
      />
    </div>
  );
}
