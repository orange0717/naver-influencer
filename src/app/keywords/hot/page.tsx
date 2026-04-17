'use client';

import { useEffect, useState } from 'react';
import { findCategoryByName } from '@/lib/shopping-categories';

interface HotCategory {
  name: string;
  change_percent: number;
  recent_avg: number;
  peak: number;
  timeline: { date: string; ratio: number }[];
}

export default function HotCategoriesPage() {
  const [categories, setCategories] = useState<HotCategory[]>([]);
  const [period, setPeriod] = useState<{ startDate: string; endDate: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/hot-categories');
        const data = await res.json();
        if (data.error) setError(data.error);
        setCategories(data.categories || []);
        setPeriod(data.period || null);
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
        <h1 className="text-2xl font-extrabold mb-1">실시간 상승 키워드</h1>
        <p className="text-sm text-dim">
          네이버 쇼핑인사이트 기준 최근 2주 동안 상승폭이 큰 카테고리 TOP 10 (공식 API)
        </p>
        {period && (
          <p className="text-[11px] text-dim mt-1">
            기간: {period.startDate} ~ {period.endDate}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : error && categories.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-dim">{error}</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-dim">데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-border bg-bg/50 text-xs font-semibold text-dim">
            <div className="col-span-1">순위</div>
            <div className="col-span-5">카테고리</div>
            <div className="col-span-2 text-right">상승률</div>
            <div className="col-span-2 text-right">최근 평균</div>
            <div className="col-span-2 text-right">최고 지수</div>
          </div>
          {categories.map((c, i) => {
            const up = c.change_percent > 0;
            const rankColor =
              i === 0
                ? 'text-yellow-500 bg-yellow-500/10'
                : i === 1
                ? 'text-gray-400 bg-gray-400/10'
                : i === 2
                ? 'text-amber-700 bg-amber-700/10'
                : 'text-dim bg-bg/50';

            const code = findCategoryByName(c.name)?.code;
            const rowClass =
              'grid grid-cols-12 gap-2 px-5 py-3 border-b border-border/50 last:border-b-0 items-center hover:bg-bg/30 transition-colors';

            const rowContent = (
              <>
                <div className="col-span-1">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${rankColor}`}
                  >
                    {i + 1}
                  </span>
                </div>
                <div className="col-span-5">
                  <div className="text-sm font-bold flex items-center gap-1">
                    {c.name}
                    {code && <span className="text-[10px] text-dim">›</span>}
                  </div>
                </div>
                <div className="col-span-2 text-right">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      up ? 'text-up bg-up/12' : c.change_percent < 0 ? 'text-down bg-down/12' : 'text-dim bg-dim/12'
                    }`}
                  >
                    {up ? '▲' : c.change_percent < 0 ? '▼' : '→'} {Math.abs(c.change_percent)}%
                  </span>
                </div>
                <div className="col-span-2 text-right text-xs font-bold font-rank">
                  {c.recent_avg}
                </div>
                <div className="col-span-2 text-right text-xs font-bold font-rank text-dim">
                  {c.peak}
                </div>
              </>
            );

            return code ? (
              <a key={c.name} href={`/keywords/hot/${code}`} className={rowClass}>
                {rowContent}
              </a>
            ) : (
              <div key={c.name} className={rowClass}>
                {rowContent}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-dim">
        * 쇼핑인사이트 API는 상대적 검색 지수(0~100, 최대치=100)를 반환합니다. 상승률은 최근 7일 평균
        vs 이전 7일 평균 비교치입니다.
      </p>
    </div>
  );
}
