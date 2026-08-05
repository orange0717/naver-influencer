import { ReactNode } from 'react';

/** KPI 카드 그리드 공통 레이아웃. 블로그/인플루언서 대시보드가 동일 규칙을 쓰도록 통일 (2/3/4/6열). */
export default function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {children}
    </div>
  );
}
