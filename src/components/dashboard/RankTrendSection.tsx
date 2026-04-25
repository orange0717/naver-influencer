'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { CHART, SERIES_COLORS } from '@/lib/chart-colors';

interface KeywordHistory {
  keyword_id: string;
  keyword: string;
  history: { date: string; rank: number | null }[];
}

interface AvgHistoryEntry {
  date: string;
  rank: number;
  count: number;
}

interface RankTrendSectionProps {
  mode: 'influencer' | 'blogger';
  naverId?: string;
  bloggerData?: KeywordHistory[];
}

const periodOptions = [
  { label: '7일', days: 7 },
  { label: '15일', days: 15 },
  { label: '30일', days: 30 },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded-xl shadow-lg p-3 text-xs">
      <p className="text-dim mb-1.5 font-semibold">{label}</p>
      {payload.map((entry) => (
        entry.value && (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-text truncate max-w-[120px]">{entry.dataKey}</span>
            <span className="font-black font-rank ml-auto" style={{ color: entry.color }}>
              {entry.value}위
            </span>
          </div>
        )
      ))}
    </div>
  );
}

export default function RankTrendSection({ mode, naverId, bloggerData }: RankTrendSectionProps) {
  const [period, setPeriod] = useState(15);
  const [keywords, setKeywords] = useState<KeywordHistory[]>([]);
  const [avgHistory, setAvgHistory] = useState<AvgHistoryEntry[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [showAvg, setShowAvg] = useState(true);
  const [loading, setLoading] = useState(false);

  // 인플루언서: API에서 데이터 페치
  useEffect(() => {
    if (mode !== 'influencer' || !naverId) return;
    setLoading(true);
    fetch(`/api/my/rankings/history?days=${period}`)
      .then(res => res.json())
      .then(data => {
        const kws = (data.keywords || []).slice(0, 10);
        setKeywords(kws);
        setAvgHistory(data.avgHistory || []);
        // 기본 선택: 상위 5개
        setSelectedKeywords(new Set(kws.slice(0, 5).map((k: KeywordHistory) => k.keyword)));
      })
      .catch(() => { setKeywords([]); setAvgHistory([]); })
      .finally(() => setLoading(false));
  }, [mode, naverId, period]);

  // 블로거: props에서 데이터 받기
  useEffect(() => {
    if (mode !== 'blogger' || !bloggerData) return;
    setKeywords(bloggerData);
    setSelectedKeywords(new Set(bloggerData.slice(0, 5).map(k => k.keyword)));
  }, [mode, bloggerData]);

  // 차트 데이터 변환 (메모이제이션)
  const activeKeywords = useMemo(
    () => keywords.filter(k => selectedKeywords.has(k.keyword)),
    [keywords, selectedKeywords],
  );

  const chartData = useMemo(() => {
    if (activeKeywords.length === 0 && !showAvg) return [];

    const dateMap = new Map<string, Record<string, unknown>>();

    // 개별 키워드 데이터
    for (const kw of activeKeywords) {
      for (const h of kw.history) {
        const entry = dateMap.get(h.date) || { date: h.date };
        entry[kw.keyword] = h.rank;
        dateMap.set(h.date, entry);
      }
    }

    // 전체 평균 순위 데이터
    if (showAvg && avgHistory.length > 0) {
      for (const avg of avgHistory) {
        const entry = dateMap.get(avg.date) || { date: avg.date };
        entry['전체 평균'] = avg.rank;
        dateMap.set(avg.date, entry);
      }
    }

    return Array.from(dateMap.values())
      .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      .slice(-period);
  }, [activeKeywords, avgHistory, showAvg, period]);

  const toggleKeyword = (keyword: string) => {
    const next = new Set(selectedKeywords);
    if (next.has(keyword)) {
      if (next.size > 1) next.delete(keyword);
    } else {
      if (next.size < 5) next.add(keyword);
    }
    setSelectedKeywords(next);
  };

  return (
    <div className="bg-surface rounded-2xl border border-border p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-[15px]">순위 추이</h3>
          <p className="text-[11px] text-dim mt-0.5">저장한 키워드의 순위 변화를 확인하세요</p>
        </div>
        {/* 기간 선택 */}
        <div className="flex gap-1 bg-bg rounded-lg p-0.5">
          {periodOptions.map(opt => (
            <button
              key={opt.days}
              onClick={() => setPeriod(opt.days)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                period === opt.days
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-dim hover:text-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 키워드 필터 */}
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {/* 전체 평균 토글 */}
          {avgHistory.length > 0 && (
            <button
              onClick={() => setShowAvg(prev => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer border ${
                showAvg
                  ? 'border-text bg-text text-white shadow-sm'
                  : 'border-border bg-bg/50 text-dim opacity-60 hover:opacity-100'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: showAvg ? '#fff' : '#ccc' }} />
              전체 평균
            </button>
          )}
          {keywords.slice(0, 10).map((kw, i) => {
            const isActive = selectedKeywords.has(kw.keyword);
            const color = SERIES_COLORS[i % SERIES_COLORS.length];
            return (
              <button
                key={kw.keyword_id || kw.keyword}
                onClick={() => toggleKeyword(kw.keyword)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer border ${
                  isActive
                    ? 'border-current bg-white shadow-sm'
                    : 'border-border bg-bg/50 text-dim opacity-60 hover:opacity-100'
                }`}
                style={isActive ? { color } : {}}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isActive ? color : '#ccc' }} />
                {kw.keyword}
              </button>
            );
          })}
        </div>
      )}

      {/* 차트 */}
      {loading ? (
        <div className="h-[260px] flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: CHART.tickFill }}
              tickLine={false}
              axisLine={{ stroke: CHART.axis, strokeWidth: 0.5 }}
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return `${d.getMonth() + 1}/${d.getDate()}`;
              }}
            />
            <YAxis
              reversed
              domain={[1, 'auto']}
              tick={{ fontSize: 10, fill: CHART.tickFill }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}위`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={3}
              stroke="#D4A017"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{ value: 'TOP 3', position: 'right', fontSize: 10, fill: '#D4A017' }}
            />
            {showAvg && avgHistory.length > 0 && (
              <Line
                key="전체 평균"
                type="monotone"
                dataKey="전체 평균"
                stroke="#2D2D2D"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                connectNulls
              />
            )}
            {activeKeywords.map((kw) => (
              <Line
                key={kw.keyword}
                type="monotone"
                dataKey={kw.keyword}
                stroke={SERIES_COLORS[keywords.indexOf(kw) % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[260px] flex items-center justify-center text-dim text-sm">
          <div className="text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-dim/40 mx-auto mb-2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
            <p>저장한 키워드의 순위 데이터가 쌓이면 차트가 표시됩니다.</p>
            <p className="text-[11px] mt-1 text-dim/70">키워드 리스트에서 키워드를 저장하세요.</p>
          </div>
        </div>
      )}
    </div>
  );
}
