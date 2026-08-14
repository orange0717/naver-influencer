'use client';

import { ReactNode } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';

// 포스팅 목록 테이블 컨테이너 — 노출 현황과 동일한 GlassCard(padding none) + 헤더(제목·건수).
// 내부(테이블/모바일 카드/Empty)는 페이지별 컬럼이라 children으로 넘긴다.
export default function AnalyticsTableShell({
  title,
  count,
  loading,
  children,
}: {
  title: string;
  count?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <GlassCard padding="none">
      <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
        <h3 className="font-bold text-[15px]">{title}</h3>
        <span className="text-xs text-dim">{loading ? '불러오는 중...' : count}</span>
      </div>
      {children}
    </GlassCard>
  );
}
