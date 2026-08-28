'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { CHART, SERIES_COLORS } from '@/lib/chart-colors';
import DashboardCard from './DashboardCard';

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
  const rows = payload.filter((entry) => typeof entry.value === 'number');
  return (
    <div className="bg-surface border border-border rounded-lg shadow-lg p-3 text-xs">
      <p className="text-dim mb-1.5 font-semibold">{label}</p>
      {rows.length === 0 ? (
        <p className="text-dim/70">데이터 없음</p>
      ) : (
        rows.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-text truncate max-w-[120px]">{entry.dataKey}</span>
            <span className="font-black font-rank ml-auto" style={{ color: entry.color }}>
              {entry.value}위
            </span>
          </div>
        ))
      )}
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
  // ⚠️ 실패와 '데이터 없음'을 반드시 구분한다. 아래 빈 상태 문구는 "저장한 키워드의 순위 데이터가
  // 쌓이면..." 인데, 로드가 실패했을 뿐인 사람에게 이걸 보여주면 **키워드를 저장하지 않았다고
  // 거짓말**하는 셈이고 무의미한 행동까지 시키게 된다. (세션 만료 401 도 여기로 떨어졌다.)
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // 인플루언서: API에서 데이터 페치
  useEffect(() => {
    if (mode !== 'influencer' || !naverId) return;
    setLoading(true);
    setFailed(false);
    fetch(`/api/my/rankings/history?days=${period}`)
      // res.ok 를 안 보면 401/500 의 에러 바디가 data 가 되어 keywords 가 [] 로 떨어진다.
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then(data => {
        const kws = (data.keywords || []).slice(0, 10);
        setKeywords(kws);
        setAvgHistory(data.avgHistory || []);
        // 기본 선택: 상위 5개
        setSelectedKeywords(new Set(kws.slice(0, 5).map((k: KeywordHistory) => k.keyword)));
      })
      .catch(() => { setKeywords([]); setAvgHistory([]); setFailed(true); })
      .finally(() => setLoading(false));
  }, [mode, naverId, period, reloadKey]);

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

    // 실제 순위가 존재하는 날짜만 (date,series)→rank 로 모은다.
    const rankByDate = new Map<string, Record<string, number | null>>();
    const put = (date: string, key: string, rank: number | null) => {
      const e = rankByDate.get(date) || {};
      e[key] = rank;
      rankByDate.set(date, e);
    };
    for (const kw of activeKeywords) {
      for (const h of kw.history) put(h.date, kw.keyword, h.rank);
    }
    if (showAvg && avgHistory.length > 0) {
      for (const avg of avgHistory) put(avg.date, '전체 평균', avg.rank);
    }

    const dates = [...rankByDate.keys()].sort();
    if (dates.length === 0) return [];

    // 렌더할 모든 시리즈 키(선택된 키워드 + 전체 평균)를 모은다.
    const seriesKeys = new Set<string>();
    for (const e of rankByDate.values()) for (const k of Object.keys(e)) seriesKeys.add(k);

    // ─── 연속 일자 축(스펙 9항) ───
    // 데이터가 있는 날만 이어붙이면 Recharts가 결측일을 직선으로 보간해버린다.
    // 마지막 데이터 날짜를 창 끝으로 삼아 period일치 연속 일자를 만들고,
    // 데이터가 없는 날은 이전 순위를 복사하지 않고 명시적으로 null로 채워 선을 끊는다.
    const endDate = dates[dates.length - 1];
    const end = new Date(`${endDate}T00:00:00Z`);
    const out: Record<string, unknown>[] = [];
    for (let i = period - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const found = rankByDate.get(iso);
      const entry: Record<string, unknown> = { date: iso };
      for (const key of seriesKeys) {
        // 값이 있으면 실제 순위, 없으면 null(선 끊김). 결측일에 이전 값을 복사하지 않는다.
        entry[key] = found && typeof found[key] === 'number' ? found[key] : null;
      }
      out.push(entry);
    }
    return out;
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
    <DashboardCard
      title="순위 추이"
      subtitle="저장한 키워드의 순위 변화를 확인하세요"
      headerRight={
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
      }
    >
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
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: showAvg ? '#FCFCFB' : '#D6D4CF' }} />
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
                    ? 'border-current bg-surface'
                    : 'border-border bg-bg/50 text-dim opacity-60 hover:opacity-100'
                }`}
                style={isActive ? { color } : {}}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isActive ? color : '#D6D4CF' }} />
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
              label={{ value: 'TOP 3', position: 'right', fontSize: 10, fill: '#B08A3E' }}
            />
            {showAvg && avgHistory.length > 0 && (
              <Line
                key="전체 평균"
                type="monotone"
                dataKey="전체 평균"
                stroke="#2D2D2D"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{ r: 2, strokeWidth: 0, fill: '#24231F' }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#FCFCFB' }}
                connectNulls={false}
              />
            )}
            {activeKeywords.map((kw) => (
              <Line
                key={kw.keyword}
                type="monotone"
                dataKey={kw.keyword}
                stroke={SERIES_COLORS[keywords.indexOf(kw) % SERIES_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 1.8, strokeWidth: 0, fill: SERIES_COLORS[keywords.indexOf(kw) % SERIES_COLORS.length] }}
                activeDot={{ r: 4, strokeWidth: 2, stroke: '#FCFCFB' }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : failed ? (
        <div className="h-[260px] flex items-center justify-center text-dim text-sm">
          <div className="text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-dim/40 mx-auto mb-2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
            <p>순위 추이를 불러오지 못했습니다.</p>
            <p className="text-[11px] mt-1 text-dim/70">저장한 키워드가 없다는 뜻은 아닙니다.</p>
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="mt-3 px-3 py-1.5 bg-surface border border-border text-text text-xs font-semibold rounded-lg hover:border-accent/30 transition cursor-pointer"
            >
              다시 시도
            </button>
          </div>
        </div>
      ) : (
        <div className="h-[260px] flex items-center justify-center text-dim text-sm">
          <div className="text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-dim/40 mx-auto mb-2"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
            <p>저장한 키워드의 순위 데이터가 쌓이면 차트가 표시됩니다.</p>
            <p className="text-[11px] mt-1 text-dim/70">키워드 리스트에서 키워드를 저장하세요.</p>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
