'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface KeywordItem {
  rank: number;
  keyword: string;
  change: 'new' | 'up' | 'down' | 'same';
  changeAmount: number;
}

interface KeywordResponse {
  category?: { name: string; code: string };
  period?: { startDate: string; endDate: string };
  keywords?: KeywordItem[];
  error?: string;
}

interface TrendPoint {
  date: string;
  ratio: number;
}

interface TrendResponse {
  category?: { name: string; code: string };
  period?: { startDate: string; endDate: string };
  points?: TrendPoint[];
  error?: string;
}

function formatTick(date: unknown): string {
  // YYYY-MM-DD → MM/DD
  const s = String(date);
  const m = s.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : s;
}

export default function CategoryKeywordsClient({ categoryCode }: { categoryCode: string }) {
  const [keywordData, setKeywordData] = useState<KeywordResponse | null>(null);
  const [trendData, setTrendData] = useState<TrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [kRes, tRes] = await Promise.all([
          fetch(`/api/shopping-keywords/${categoryCode}`),
          fetch(`/api/shopping-category-trend/${categoryCode}`),
        ]);
        const kJson = (await kRes.json()) as KeywordResponse;
        const tJson = (await tRes.json()) as TrendResponse;
        if (cancelled) return;
        if (kJson.error) setError(kJson.error);
        setKeywordData(kJson);
        setTrendData(tJson);
      } catch (err) {
        console.error('카테고리 데이터 로드 실패:', err);
        if (!cancelled) setError('데이터를 불러올 수 없습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [categoryCode]);

  const keywords = keywordData?.keywords || [];
  const trendPoints = trendData?.points || [];
  const categoryName = keywordData?.category?.name || trendData?.category?.name || '카테고리';

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/keywords/hot"
          className="inline-flex items-center gap-1 text-xs text-dim hover:text-fg mb-2"
        >
          ← 실시간 상승 카테고리
        </Link>
        <h1 className="text-2xl font-extrabold mb-1">{categoryName}</h1>
        <p className="text-sm text-dim">
          네이버 쇼핑인사이트 기준 클릭량 추이 (최근 30일) + 인기검색어 TOP 20
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 좌측: 추이 차트 */}
          <div className="lg:col-span-2 bg-surface rounded-xl border border-border p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-base font-bold">{categoryName} 클릭량 추이</h2>
              {trendData?.period && (
                <span className="text-[11px] text-dim font-rank">
                  {trendData.period.startDate} ~ {trendData.period.endDate}
                </span>
              )}
            </div>
            {trendPoints.length === 0 ? (
              <div className="h-72 flex items-center justify-center text-sm text-dim">
                추이 데이터가 없습니다.
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendPoints} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #F2E2DC)" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatTick}
                      tick={{ fontSize: 11, fill: 'var(--color-dim, #8C7A6E)' }}
                      stroke="var(--color-border, #F2E2DC)"
                      minTickGap={20}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'var(--color-dim, #8C7A6E)' }}
                      stroke="var(--color-border, #F2E2DC)"
                      width={32}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#FFFFFF',
                        border: '1px solid #F2E2DC',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={formatTick}
                      formatter={(value: number) => [value, '클릭 비율']}
                    />
                    <Line
                      type="monotone"
                      dataKey="ratio"
                      stroke="#BF877A"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 우측: 인기검색어 TOP 20 */}
          <div className="bg-surface rounded-xl border border-border">
            <div className="px-5 py-3 border-b border-border flex items-baseline justify-between">
              <h2 className="text-base font-bold">{categoryName} 인기검색어</h2>
              <span className="text-[11px] text-dim font-rank">TOP 20</span>
            </div>
            {error && keywords.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-dim">{error}</div>
            ) : keywords.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-dim">데이터가 없습니다.</div>
            ) : (
              <ul>
                {keywords.map(k => {
                  const rankColor =
                    k.rank === 1
                      ? 'text-yellow-500 bg-yellow-500/10'
                      : k.rank === 2
                      ? 'text-gray-400 bg-gray-400/10'
                      : k.rank === 3
                      ? 'text-amber-700 bg-amber-700/10'
                      : 'text-dim bg-bg/50';

                  return (
                    <li key={`${k.rank}-${k.keyword}`}>
                      <Link
                        href={`/keywords/blogger?q=${encodeURIComponent(k.keyword)}`}
                        className="flex items-center gap-3 px-5 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-bg/30 transition-colors"
                      >
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black font-rank shrink-0 ${rankColor}`}
                        >
                          {k.rank}
                        </span>
                        <span className="text-sm font-bold flex-1 truncate">{k.keyword}</span>
                        {k.change === 'new' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-up bg-up/12">
                            NEW
                          </span>
                        ) : k.change === 'up' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-up bg-up/12">
                            ▲ {k.changeAmount}
                          </span>
                        ) : k.change === 'down' ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-down bg-down/12">
                            ▼ {k.changeAmount}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <p className="text-[11px] text-dim">
        * 좌측 차트는 네이버 데이터랩 쇼핑인사이트 공식 API의 카테고리 클릭량 비율입니다. 우측 인기검색어는 데이터랩 카테고리별 인기검색어 기준이며 순위 변동은 직전 주 대비입니다.
      </p>
    </div>
  );
}
