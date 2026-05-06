'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface KeywordItem {
  rank: number;
  keyword: string;
  change: 'new' | 'up' | 'down' | 'same';
  changeAmount: number;
}

interface ApiResponse {
  category?: { name: string; code: string };
  period?: { startDate: string; endDate: string };
  keywords?: KeywordItem[];
  error?: string;
}

export default function CategoryKeywordsClient({ categoryCode }: { categoryCode: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/shopping-keywords/${categoryCode}`);
        const json = (await res.json()) as ApiResponse;
        if (json.error) setError(json.error);
        setData(json);
      } catch (err) {
        console.error('카테고리 키워드 로드 실패:', err);
        setError('데이터를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [categoryCode]);

  const keywords = data?.keywords || [];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/keywords/hot"
          className="inline-flex items-center gap-1 text-xs text-dim hover:text-fg mb-2"
        >
          ← 실시간 상승 키워드
        </Link>
        <h1 className="text-2xl font-extrabold mb-1">
          {data?.category?.name || '카테고리'} 상승 키워드
        </h1>
        <p className="text-sm text-dim">
          네이버 쇼핑인사이트 기준 최근 7일 검색량 TOP 20
        </p>
        {data?.period && (
          <p className="text-[11px] text-dim mt-1">
            기간: {data.period.startDate} ~ {data.period.endDate}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      ) : error && keywords.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-dim">{error}</p>
        </div>
      ) : keywords.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-10 text-center">
          <p className="text-sm text-dim">데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-border bg-bg/50 text-xs font-semibold text-dim">
            <div className="col-span-1">순위</div>
            <div className="col-span-8">키워드</div>
            <div className="col-span-3 text-right">변동</div>
          </div>
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
              <Link
                key={`${k.rank}-${k.keyword}`}
                href={`/keywords/blogger?q=${encodeURIComponent(k.keyword)}`}
                className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-border/50 last:border-b-0 items-center hover:bg-bg/30 transition-colors"
              >
                <div className="col-span-1">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${rankColor}`}
                  >
                    {k.rank}
                  </span>
                </div>
                <div className="col-span-8">
                  <div className="text-sm font-bold">{k.keyword}</div>
                </div>
                <div className="col-span-3 text-right">
                  {k.change === 'new' ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-up bg-up/12">
                      NEW
                    </span>
                  ) : k.change === 'up' ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-up bg-up/12">
                      ▲ {k.changeAmount}
                    </span>
                  ) : k.change === 'down' ? (
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-down bg-down/12">
                      ▼ {k.changeAmount}
                    </span>
                  ) : (
                    <span className="text-xs font-bold px-2 py-0.5 rounded text-dim bg-dim/12">
                      -
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-dim">
        * 키워드를 클릭하면 키워드 검색 페이지로 이동합니다. 순위 변동은 직전 주 대비 기준입니다.
      </p>
    </div>
  );
}
