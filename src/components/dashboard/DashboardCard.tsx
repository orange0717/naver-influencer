'use client';

import { ReactNode } from 'react';
import { CARD_BASE_CLASS } from './card-base';

interface DashboardCardProps {
  id?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** 헤더 좌측 아이콘. w-8 h-8 rounded-lg 컨테이너까지 포함해서 전달 (예: <DashboardCardIcon>...</DashboardCardIcon>) */
  icon?: ReactNode;
  /** 헤더 우측 요소 (카운트, 필터 버튼 등) */
  headerRight?: ReactNode;
  padding?: 'md' | 'none';
  className?: string;
  children: ReactNode;
}

/** 대시보드 카드 공통 아이콘 컨테이너. 모든 카드 헤더 아이콘의 크기/모양을 통일한다. */
export function DashboardCardIcon({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 ${className}`.trim()}>
      {children}
    </div>
  );
}

export default function DashboardCard({
  id,
  title,
  subtitle,
  icon,
  headerRight,
  padding = 'md',
  className = '',
  children,
}: DashboardCardProps) {
  const hasHeader = Boolean(title || icon || headerRight);

  return (
    <div
      id={id}
      className={`${CARD_BASE_CLASS} ${padding === 'md' ? 'p-5' : ''} ${className}`.trim()}
    >
      {hasHeader && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            {title && (
              <div className="min-w-0">
                <h3 className="font-bold text-[15px]">{title}</h3>
                {subtitle && <p className="text-[11px] text-dim mt-0.5">{subtitle}</p>}
              </div>
            )}
          </div>
          {headerRight && <div className="flex items-center gap-2 shrink-0">{headerRight}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
