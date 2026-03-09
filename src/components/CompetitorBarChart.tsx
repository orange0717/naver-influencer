'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { CHART, COMPETITOR } from '@/lib/chart-colors';

interface Competitor {
  name: string;
  rank: number;
  isMe: boolean;
}

interface Props {
  data: Competitor[];
}

export default function CompetitorBarChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, Math.max(...data.map(d => d.rank)) + 2]}
          tick={{ fill: CHART.tickFill, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          reversed
          tickFormatter={(v: number) => `${v}위`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#0D0D0D', fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={80}
        />
        <Tooltip
          contentStyle={{
            background: CHART.tooltipBg,
            border: `1px solid ${CHART.tooltipBorder}`,
            borderRadius: 8,
            fontSize: 12,
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, _name: any, entry: any) => [
            `${value}위`,
            entry?.payload?.isMe ? '나' : entry?.payload?.name,
          ]}
        />
        <Bar dataKey="rank" radius={[0, 4, 4, 0]} barSize={20}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.isMe ? COMPETITOR.me : COMPETITOR.other} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
