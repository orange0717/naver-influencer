'use client';

import { useState } from 'react';
import TrendAreaChart from '@/components/TrendAreaChart';

interface TrendPoint {
  week: string;
  volume: number;
}

interface TrendSummary {
  trend_direction: 'up' | 'down' | 'stable';
  trend_percentage: number;
  peak_volume: number;
  peak_date: string;
}

export default function GoogleTrendsPage() {
  const [input, setInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [geo, setGeo] = useState<'KR' | 'US' | 'JP' | ''>('KR');
  const [data, setData] = useState<TrendPoint[]>([]);
  const [summary, setSummary] = useState<TrendSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setKeyword(q);
    setLoading(true);
    setError(null);
    setData([]);
    setSummary(null);
    try {
      const res = await fetch(
        `/api/google-trends?keyword=${encodeURIComponent(q)}&geo=${encodeURIComponent(geo)}`,
      );
      const json = await res.json();
      if (json.error) setError(json.error);
      setData(
        (json.trendData || []).map((d: { date: string; value: number }) => ({
          week: d.date,
          volume: d.value,
        })),
      );
      if (json.summary) {
        setSummary({
          trend_direction: json.summary.trend_direction,
          trend_percentage: json.summary.trend_percentage,
          peak_volume: json.summary.peak_value,
          peak_date: json.summary.peak_date,
        });
      }
    } catch (err) {
      console.error('구글 트렌드 조회 실패:', err);
      setError('구글 트렌드를 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold mb-1">구글 트렌드</h1>
        <p className="text-sm text-dim">
          구글 검색 관심도(0~100)를 국가별·최근 90일로 조회합니다.
        </p>
      </div>

      <form onSubmit={search} className="bg-surface rounded-xl border border-border p-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="키워드를 입력하세요 (예: 제주도여행)"
            className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-bg text-sm focus:outline-none focus:border-accent"
            maxLength={64}
          />
          <select
            value={geo}
            onChange={e => setGeo(e.target.value as 'KR' | 'US' | 'JP' | '')}
            className="px-3 py-2.5 rounded-lg border border-border bg-bg text-sm focus:outline-none focus:border-accent"
          >
            <option value="KR">한국</option>
            <option value="US">미국</option>
            <option value="JP">일본</option>
            <option value="">전세계</option>
          </select>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '조회 중...' : '조회'}
          </button>
        </div>
      </form>

      {keyword && (
        <div className="bg-surface rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="text-sm font-bold">
              {keyword}
              <span className="ml-2 text-[11px] font-normal text-dim">
                최근 90일 · {geo === 'KR' ? '한국' : geo === 'US' ? '미국' : geo === 'JP' ? '일본' : '전세계'}
              </span>
            </div>
            {summary && data.length > 0 && (
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    summary.trend_direction === 'up'
                      ? 'text-up bg-up/12'
                      : summary.trend_direction === 'down'
                      ? 'text-down bg-down/12'
                      : 'text-dim bg-dim/12'
                  }`}
                >
                  {summary.trend_direction === 'up' ? '▲' : summary.trend_direction === 'down' ? '▼' : '→'}{' '}
                  {Math.abs(summary.trend_percentage)}%
                </span>
                {summary.peak_volume > 0 && (
                  <span className="text-xs text-dim">최고 지수 {summary.peak_volume}</span>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
            </div>
          ) : data.length > 0 ? (
            <>
              <TrendAreaChart data={data} direction={summary?.trend_direction || 'stable'} />
              <p className="text-[11px] text-dim mt-3">
                구글 트렌드 기준 상대적 관심도 (0~100).
              </p>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm text-dim">{error || '데이터가 없습니다.'}</p>
              <p className="text-[11px] text-dim mt-2">
                무료 스크래핑 방식은 일시 차단될 수 있습니다. 추후 유료 API로 안정화 예정입니다.
              </p>
            </div>
          )}
        </div>
      )}

      {!keyword && !loading && (
        <div className="bg-surface/50 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-dim">
            키워드를 입력하면 구글 트렌드 차트를 볼 수 있습니다.
          </p>
        </div>
      )}
    </div>
  );
}
