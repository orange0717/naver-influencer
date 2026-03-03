'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface KeywordHistory {
  keyword: string;
  ranks: number[];
  color: string;
}

interface Props {
  dates: string[];
  keywords: KeywordHistory[];
}

const COLORS = ['#6C5CE7', '#E94560', '#00D68F', '#4D9FFF', '#FFD93D', '#FF6B6B', '#C0C0C0'];

export default function RankHistoryChart({ dates, keywords }: Props) {
  const chartData = dates.map((date, i) => {
    const entry: Record<string, string | number> = { date: date.slice(5) };
    keywords.forEach(kw => {
      entry[kw.keyword] = kw.ranks[i];
    });
    return entry;
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A4A" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#888', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#2A2A4A' }}
        />
        <YAxis
          reversed
          domain={[1, 'auto']}
          tick={{ fill: '#888', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#2A2A4A' }}
          tickFormatter={(v: number) => `${v}위`}
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
          formatter={(value: any, name: any) => [`${value}위`, name]}
        />
        {keywords.map((kw, i) => (
          <Line
            key={kw.keyword}
            type="monotone"
            dataKey={kw.keyword}
            stroke={kw.color || COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: kw.color || COLORS[i % COLORS.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
