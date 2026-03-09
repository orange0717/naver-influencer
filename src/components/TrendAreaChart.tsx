'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CHART, DIRECTION_COLORS } from '@/lib/chart-colors';

interface TrendPoint {
  week: string;
  volume: number;
}

interface Props {
  data: TrendPoint[];
  direction?: 'up' | 'down' | 'stable';
}

export default function TrendAreaChart({ data, direction = 'stable' }: Props) {
  const color = DIRECTION_COLORS[direction];
  const gradientId = `trendGrad-${direction}`;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        <XAxis
          dataKey="week"
          tick={{ fill: CHART.tickFill, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
        />
        <YAxis
          tick={{ fill: CHART.tickFill, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
        />
        <Tooltip
          contentStyle={{
            background: CHART.tooltipBg,
            border: `1px solid ${CHART.tooltipBorder}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: CHART.labelFill }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any) => [Number(value).toLocaleString(), '검색량']}
        />
        <Area
          type="monotone"
          dataKey="volume"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={{ r: 3, fill: color }}
          activeDot={{ r: 5, stroke: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
