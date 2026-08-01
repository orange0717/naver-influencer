'use client';

import type { ReactNode } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CHART, SERIES_COLORS } from '@/lib/chart-colors';

interface YearPoint {
  year: number;
  count: number;
}

interface Props {
  data: YearPoint[];
}

export default function CategoryYearlyBarChart({ data }: Props) {
  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="year" tick={{ fill: CHART.tickFill, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART.axis }} />
        <YAxis tick={{ fill: CHART.tickFill, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART.axis }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: CHART.tooltipBg, border: `1px solid ${CHART.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: CHART.labelFill }}
          formatter={(value?: number) => [`${value ?? 0}개`, '발행']}
          labelFormatter={(year: ReactNode) => `${year}년`}
        />
        <Bar dataKey="count" fill={SERIES_COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
