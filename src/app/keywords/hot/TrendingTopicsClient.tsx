'use client';

import { useEffect, useState } from 'react';

interface TimelinePoint {
  date: string;
  ratio: number;
}

interface CategoryTrend {
  name: string;
  code: string;
  change_percent: number;
  recent_avg: number;
  peak: number;
  timeline: TimelinePoint[];
}

interface ApiResponse {
  period?: { startDate: string; endDate: string };
  categories?: CategoryTrend[];
  error?: string;
}

function Sparkline({ points }: { points: TimelinePoint[] }) {
  if (points.length < 2) return null;
  const ratios = points.map(p => p.ratio);
  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const range = max - min || 1;
  const w = 100;
  const h = 28;
  const step = w / (points.length - 1);
  const path = ratios
    .map((r, i) => {
      const x = i * step;
      const y = h - ((r - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function TrendingTopicsClient() {
  const [categories, setCategories] = useState<CategoryTrend[]>([]);
  const [period, setPeriod] = useState<{ startDate: string; endDate: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/hot-categories');
        const data = (await res.json()) as ApiResponse;
        if (data.error) setError(data.error);
        setCategories(data.categories || []);
        setPeriod(data.period ?? null);
      } catch (err) {
        console.error('실시간 상승 키워드 로드 실패:', err);
        setError('데이터를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold mb-1">실시간 상승 카테고리</h1>
        <p className="text-sm text-dim">
          네이버 쇼핑인사이트 12개 카테고리 검색량 추이. 최근 7일 vs 이전 7일 평균 변화율 기준.
          {period && (
            <span className="ml-1 text-dim">
              ({period.startDate} ~ {period.endDate})
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : error && categories.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-dim">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {categories.map(c => {
            const isEmpty = c.peak === 0;
            const isUp = c.change_percent > 0;
            const isDown = c.change_percent < 0;
            const changeColor = isUp ? 'text-up' : isDown ? 'text-down' : 'text-dim';
            const arrow = isUp ? '▲' : isDown ? '▼' : '–';
            return (
              <a
                key={c.code || c.name}
                href={c.code ? `/keywords/hot/${c.code}` : undefined}
                className="bg-surface rounded-xl border border-border p-4 hover:border-accent hover:shadow-sm transition-all group block"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold group-hover:text-accent transition-colors">
                    {c.name}
                  </h3>
                  {isEmpty ? (
                    <span className="text-[11px] text-dim font-rank">데이터 없음</span>
                  ) : (
                    <span className={`text-xs font-bold font-rank ${changeColor}`}>
                      {arrow} {Math.abs(c.change_percent)}%
                    </span>
                  )}
                </div>
                {!isEmpty && (
                  <>
                    <div className={changeColor}>
                      <Sparkline points={c.timeline} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-dim font-rank">
                      <span>최근 7일 평균 {c.recent_avg}</span>
                      <span>피크 {c.peak}</span>
                    </div>
                  </>
                )}
                <div className="mt-2 text-[11px] text-dim text-right group-hover:text-accent transition-colors">
                  상세 보기 →
                </div>
              </a>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-dim">
        * 네이버 데이터랩 쇼핑인사이트 공식 API 기준. 30분마다 갱신됩니다.
      </p>
    </div>
  );
}
