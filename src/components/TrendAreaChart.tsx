'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface TrendPoint {
  week: string;
  volume: number;
}

interface Props {
  data: TrendPoint[];
  direction?: 'up' | 'down' | 'stable';
}

export default function TrendAreaChart({ data, direction = 'stable' }: Props) {
  const color = direction === 'up' ? '#00D68F' : direction === 'down' ? '#FF6B6B' : '#6C5CE7';
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
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A4A" />
        <XAxis
          dataKey="week"
          tick={{ fill: '#888', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: '#2A2A4A' }}
        />
        <YAxis
          tick={{ fill: '#888', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: '#2A2A4A' }}
          tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
        />
        <Tooltip
          contentStyle={{
            background: '#1A1A2E',
            border: '1px solid #2A2A4A',
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: '#888' }}
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
