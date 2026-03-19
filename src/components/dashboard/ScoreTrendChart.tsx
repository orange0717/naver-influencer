'use client';

import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { CHART, SERIES_COLORS } from '@/lib/chart-colors';
import GlassCard from './GlassCard';
import type { DailyScorePoint } from '@/lib/growth-analysis';

interface ScoreTrendChartProps {
  data: DailyScorePoint[];
}

const DIMENSION_CONFIG = [
  { key: 'expertise', label: '전문성', color: SERIES_COLORS[4] },
  { key: 'exposure', label: '노출도', color: SERIES_COLORS[3] },
  { key: 'growth', label: '성장성', color: SERIES_COLORS[2] },
  { key: 'activity', label: '활동성', color: SERIES_COLORS[5] },
] as const;

const GRADE_LINES = [
  { value: 90, label: 'S', color: '#BF877A' },
  { value: 75, label: 'A', color: '#2E8B57' },
  { value: 60, label: 'B', color: '#4D8FCC' },
];

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-xl shadow-lg p-3 text-xs">
      <p className="text-dim mb-1.5 font-semibold">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text">{entry.name}</span>
          <span className="font-black font-rank ml-auto" style={{ color: entry.color }}>
            {entry.value}점
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ScoreTrendChart({ data }: ScoreTrendChartProps) {
  const [showDimensions, setShowDimensions] = useState(false);

  if (data.length < 2) return null;

  // 차트 데이터 변환
  const chartData = data.map(d => ({
    date: d.date.slice(5), // MM-DD
    totalScore: d.totalScore,
    ...d.dimensions,
  }));

  // 점수 변화량
  const firstScore = data[0].totalScore;
  const lastScore = data[data.length - 1].totalScore;
  const scoreDiff = lastScore - firstScore;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-[15px]">종합 점수 추이</h3>
          <p className="text-[11px] text-dim mt-0.5">
            {data.length}일간 추이
            {scoreDiff !== 0 && (
              <span className={`ml-1.5 font-bold ${scoreDiff > 0 ? 'text-up' : 'text-down'}`}>
                ({scoreDiff > 0 ? '+' : ''}{scoreDiff}점)
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowDimensions(!showDimensions)}
          className={`text-[11px] px-2.5 py-1 rounded-lg transition cursor-pointer ${
            showDimensions ? 'bg-accent/15 text-accent font-bold' : 'bg-bg text-dim hover:text-text'
          }`}
        >
          세부 항목
        </button>
      </div>

      <div className="h-[220px] md:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fill: CHART.tickFill, fontSize: 10 }}
              axisLine={{ stroke: CHART.axis, opacity: 0.3 }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: CHART.tickFill, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* 등급 기준선 */}
            {GRADE_LINES.map(line => (
              <ReferenceLine
                key={line.label}
                y={line.value}
                stroke={line.color}
                strokeDasharray="4 4"
                opacity={0.3}
                label={{
                  value: line.label,
                  position: 'right',
                  fill: line.color,
                  fontSize: 9,
                  opacity: 0.5,
                }}
              />
            ))}

            {/* 종합 점수 (항상 표시) */}
            <Line
              type="monotone"
              dataKey="totalScore"
              name="종합 점수"
              stroke={SERIES_COLORS[0]}
              strokeWidth={2.5}
              dot={{ r: 3, fill: SERIES_COLORS[0] }}
              activeDot={{ r: 5 }}
            />

            {/* 세부 항목 (토글) */}
            {showDimensions && DIMENSION_CONFIG.map(dim => (
              <Line
                key={dim.key}
                type="monotone"
                dataKey={dim.key}
                name={dim.label}
                stroke={dim.color}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
                opacity={0.7}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 범례 */}
      {showDimensions && (
        <div className="flex flex-wrap gap-3 mt-2 justify-center">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: SERIES_COLORS[0] }} />
            <span className="text-dim font-semibold">종합</span>
          </div>
          {DIMENSION_CONFIG.map(dim => (
            <div key={dim.key} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: dim.color }} />
              <span className="text-dim">{dim.label}</span>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
