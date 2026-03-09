'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CHART, SERIES_COLORS } from '@/lib/chart-colors';

interface KeywordHistory {
  keyword: string;
  ranks: number[];
  color: string;
}

interface Props {
  dates: string[];
  keywords: KeywordHistory[];
}

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
        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
        <XAxis
          dataKey="date"
          tick={{ fill: CHART.tickFill, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
        />
        <YAxis
          reversed
          domain={[1, 'auto']}
          tick={{ fill: CHART.tickFill, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          tickFormatter={(v: number) => `${v}위`}
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
          formatter={(value: any, name: any) => [`${value}위`, name]}
        />
        {keywords.map((kw, i) => (
          <Line
            key={kw.keyword}
            type="monotone"
            dataKey={kw.keyword}
            stroke={kw.color || SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3, fill: kw.color || SERIES_COLORS[i % SERIES_COLORS.length] }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
