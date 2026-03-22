'use client';

import { useState } from 'react';
import Link from 'next/link';

interface RankKeyword {
  keyword_id: string;
  keyword: string;
  rank_position: number;
  rank_change: number;
  category: string;
}

interface Props {
  rank1: RankKeyword[];
  rank2: RankKeyword[];
  rank3: RankKeyword[];
  rank4: RankKeyword[];
  rank5: RankKeyword[];
}

const PAGE_SIZE = 5;

export default function RankDistribution({ rank1, rank2, rank3, rank4, rank5 }: Props) {
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const rankData = [
    { rank: 1, count: rank1.length, keywords: rank1, color: 'text-gold', bg: 'bg-gold/10' },
    { rank: 2, count: rank2.length, keywords: rank2, color: 'text-accent', bg: 'bg-accent/10' },
    { rank: 3, count: rank3.length, keywords: rank3, color: 'text-accent', bg: 'bg-accent/10' },
    { rank: 4, count: rank4.length, keywords: rank4, color: 'text-dim', bg: 'bg-border/30' },
    { rank: 5, count: rank5.length, keywords: rank5, color: 'text-dim', bg: 'bg-border/30' },
  ];

  const selected = rankData.find(r => r.rank === selectedRank);
  const totalPages = selected ? Math.ceil(selected.keywords.length / PAGE_SIZE) : 0;
  const displayList = selected ? selected.keywords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];

  return (
    <div className="border-t border-border/50 pt-4">
      <p className="text-[11px] text-dim font-semibold mb-3">순위별 키워드 분포</p>
      <div className="grid grid-cols-5 gap-2 text-center">
        {rankData.map(r => (
          <button
            key={r.rank}
            onClick={() => { setSelectedRank(prev => prev === r.rank ? null : r.rank); setPage(1); }}
            className={`rounded-xl py-2.5 cursor-pointer transition-all ${r.bg} ${
              selectedRank === r.rank ? 'ring-2 ring-accent scale-[1.02]' : 'hover:scale-[1.02]'
            }`}
          >
            <p className={`text-lg font-black ${r.color}`}>{r.count}</p>
            <p className="text-[10px] text-dim font-semibold mt-0.5">{r.rank}위</p>
          </button>
        ))}
      </div>

      {selected && selected.keywords.length > 0 && (
        <div className="mt-3 rounded-xl border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2 bg-bg/30 border-b border-border/50 flex items-center justify-between">
            <span className="text-xs font-bold">{selectedRank}위 키워드 ({selected.keywords.length}개)</span>
            {totalPages > 1 && (
              <span className="text-[10px] text-dim">{page}/{totalPages}</span>
            )}
          </div>
          <div className="divide-y divide-border/20">
            {displayList.map(kw => (
              <Link
                key={kw.keyword_id}
                href={`/keywords/${kw.keyword_id}`}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover transition"
              >
                <div className="min-w-0">
                  <span className="text-sm font-semibold">{kw.keyword}</span>
                  <span className="text-[11px] text-dim ml-1.5">{kw.category}</span>
                </div>
                {kw.rank_change !== 0 && (
                  <span className={`text-xs font-bold shrink-0 ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                    {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                  </span>
                )}
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="px-4 py-2 border-t border-border/50 flex items-center justify-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer disabled:opacity-30 disabled:cursor-default bg-border/30 text-dim hover:bg-border/50"
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-6 h-6 rounded text-[11px] font-semibold transition cursor-pointer ${
                    page === p ? 'bg-accent text-white' : 'bg-border/30 text-dim hover:bg-border/50'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer disabled:opacity-30 disabled:cursor-default bg-border/30 text-dim hover:bg-border/50"
              >
                다음
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
