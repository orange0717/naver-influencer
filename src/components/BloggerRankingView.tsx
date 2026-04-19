'use client';

import { useState, useEffect } from 'react';

interface RankingRow {
  rank_pos: number;
  blog_id: string;
  blog_name: string | null;
  category: string | null;
  rank_score: number;
  last_post_date: string | null;
}

interface MyRank {
  found: boolean;
  blog_id?: string;
  blog_name?: string | null;
  category?: string | null;
  rank_score?: number;
  is_active?: boolean;
  global_rank?: number | null;
  total_active?: number;
  global_percentile?: number | null;
  category_rank?: number | null;
  total_category?: number;
  last_post_date?: string | null;
  message?: string;
}

export default function BloggerRankingView() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [totalActive, setTotalActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchId, setSearchId] = useState('');
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch('/api/rankings/top?limit=50')
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rankings || []);
        setTotalActive(d.total_active || 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const searchMyRank = async () => {
    const id = searchId.trim().replace(/^https?:\/\/blog\.naver\.com\//, '').replace(/\/.*$/, '');
    if (!id) return;
    setSearching(true);
    setMyRank(null);
    try {
      const res = await fetch(`/api/rankings/${encodeURIComponent(id)}`);
      const data = await res.json();
      setMyRank(data);
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <p className="text-[11px] text-dim">
        최근 1년 내 활동한 블로거 대상 · 활성 블로거 {totalActive.toLocaleString()}명 집계
      </p>

      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <h2 className="text-sm font-bold">내 블로그 순위 확인</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchMyRank()}
            placeholder="블로그 ID 또는 주소 (예: blog.naver.com/myid)"
            className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg border border-border focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={searchMyRank}
            disabled={searching || !searchId.trim()}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-accent text-white disabled:opacity-40 cursor-pointer"
          >
            {searching ? '조회 중...' : '조회'}
          </button>
        </div>

        {myRank && (
          <div className="mt-3 pt-3 border-t border-border">
            {!myRank.found ? (
              <p className="text-sm text-dim">{myRank.message || '해당 블로그 정보가 없습니다.'}</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{myRank.blog_name || myRank.blog_id}</span>
                  {myRank.category && (
                    <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded">{myRank.category}</span>
                  )}
                </div>
                {myRank.is_active ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-bg rounded-lg p-3">
                        <p className="text-[11px] text-dim mb-1">전체 순위</p>
                        <p className="text-xl font-extrabold text-accent">
                          {myRank.global_rank?.toLocaleString()}위
                        </p>
                        <p className="text-[10px] text-dim mt-1">
                          활성 블로거 {myRank.total_active?.toLocaleString()}명 중
                        </p>
                      </div>
                      <div className="bg-bg rounded-lg p-3">
                        <p className="text-[11px] text-dim mb-1">상위</p>
                        <p className="text-xl font-extrabold text-accent">
                          {myRank.global_percentile}%
                        </p>
                        <p className="text-[10px] text-dim mt-1">백분위</p>
                      </div>
                    </div>
                    {myRank.category_rank && (
                      <div className="bg-bg rounded-lg p-3">
                        <p className="text-[11px] text-dim mb-1">{myRank.category} 카테고리 순위</p>
                        <p className="text-base font-bold">
                          {myRank.category_rank}위 / {myRank.total_category?.toLocaleString()}명
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-dim">
                    최근 1년 이상 포스팅이 없어 순위 대상에서 제외되었습니다. 최근 포스팅 감지 시 자동 복귀됩니다.
                  </p>
                )}
                {myRank.last_post_date && (
                  <p className="text-[11px] text-dim">최근 포스팅: {myRank.last_post_date}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold">Top 50 블로거 순위</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-sm text-dim text-center">
            아직 데이터가 쌓이는 중입니다. 잠시 후 다시 확인해주세요.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((r) => (
              <div key={r.blog_id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-10 text-sm font-bold text-accent font-rank shrink-0">
                  {r.rank_pos}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {r.blog_name || r.blog_id}
                  </p>
                  <div className="flex items-center gap-2 text-[11px] text-dim">
                    {r.category && <span>{r.category}</span>}
                    {r.last_post_date && <span>· {r.last_post_date}</span>}
                  </div>
                </div>
                <span className="text-xs text-dim font-mono shrink-0">
                  {Math.round(Number(r.rank_score))}점
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
