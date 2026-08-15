'use client';

import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import StatusIcon from './StatusIcon';
import { TONE_STAT_COLOR } from './tokens';
import type { MetricCardGridProps, MetricCardItem } from './types';

/**
 * 지표 카드 행 — 기본 5열.
 *
 * 카드 자체는 대시보드 공용 AnimatedStatCard(kpi, 150px)를 그대로 쓴다. 여기서 더하는 것은
 *  · tone(success/warning/danger/neutral/accent) → 아이콘 + 숫자 색을 한 번에 결정
 *  · trend → 값 옆 ▲/▼ 변화량
 *  · loading → 값 자리에 '—' (0으로 오독되지 않게)
 * 세 가지뿐이다. 카드를 새로 그리지 않으므로 대시보드의 다른 KPI 행과 높이·애니메이션이 어긋나지 않는다.
 */
export default function MetricCardGrid({
  metrics,
  loading,
  columns,
  className = '',
}: MetricCardGridProps) {
  const count = columns ?? metrics.length;
  // 모바일 2열 고정 → 데스크톱에서 지표 수에 맞춘다.
  const mdCols =
    count <= 4
      ? 'md:grid-cols-4'
      : count === 5
        ? 'md:grid-cols-5'
        : count === 6
          ? 'md:grid-cols-3 lg:grid-cols-6'
          : 'md:grid-cols-4 lg:grid-cols-7';

  return (
    <div className={`grid grid-cols-2 ${mdCols} gap-3 ${className}`.trim()}>
      {metrics.map((m: MetricCardItem, i) => {
        const tone = m.tone ?? 'accent';
        return (
          <AnimatedStatCard
            key={m.key}
            label={m.label}
            value={m.value}
            color={TONE_STAT_COLOR[tone]}
            icon={m.icon ?? <StatusIcon tone={tone} />}
            trend={m.trend ? { direction: m.trend.direction, value: m.trend.value } : undefined}
            description={m.description}
            href={m.href}
            statusText={loading ? '—' : m.statusText}
            placeholder="0"
            size="kpi"
            delay={i * 60}
          />
        );
      })}
    </div>
  );
}
