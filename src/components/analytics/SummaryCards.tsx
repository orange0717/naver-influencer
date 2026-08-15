'use client';

import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';

// 포스팅 분석 화면 공용 요약 카드 행 — 노출 현황과 동일한 AnimatedStatCard(kpi) 그리드.
// 노출현황/키워드순위/향후 AI브리핑이 같은 카드 문법을 공유하도록 얇게 감싼다.
export interface SummaryCard {
  key: string;
  label: string;
  value: number;
  color?: 'accent' | 'up' | 'down' | 'gold' | 'dim';
  description?: string;
  href?: string;
  statusText?: string;
}

export default function SummaryCards({ cards, loading }: { cards: SummaryCard[]; loading?: boolean }) {
  // 노출 현황과 동일: 2열(모바일) → 5열(md). 카드가 4개면 4열, 6개면 md 3열·lg 6열, 7개면 md 4열·lg 7열.
  const mdCols =
    cards.length <= 4 ? 'md:grid-cols-4'
      : cards.length === 5 ? 'md:grid-cols-5'
        : cards.length === 6 ? 'md:grid-cols-3 lg:grid-cols-6'
          : 'md:grid-cols-4 lg:grid-cols-7';
  return (
    <div className={`grid grid-cols-2 ${mdCols} gap-3`}>
      {cards.map((c, i) => (
        <AnimatedStatCard
          key={c.key}
          label={c.label}
          value={c.value}
          color={c.color}
          description={c.description}
          href={c.href}
          placeholder="0"
          size="kpi"
          delay={i * 60}
          statusText={loading ? '—' : c.statusText}
        />
      ))}
    </div>
  );
}
