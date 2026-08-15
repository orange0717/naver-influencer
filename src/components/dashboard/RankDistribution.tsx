'use client';

import { useState } from 'react';
import Link from 'next/link';
import Pagination from '@/components/analytics/Pagination';

interface RankKeyword {
  keyword_id: string;
  keyword: string;
  rank_position: number;
  rank_change: number;
  category: string;
}

interface Props {
  rankings: RankKeyword[];
}

const PAGE_SIZE = 5;

interface RankGroup {
  key: string;
  label: string;
  min: number;
  max: number;
  color: string;
  bg: string;
}

const RANK_GROUPS: RankGroup[] = [
  { key: '1', label: '1위', min: 1, max: 1, color: 'text-gold', bg: 'bg-gold/10' },
  { key: '2', label: '2위', min: 2, max: 2, color: 'text-gold', bg: 'bg-gold/10' },
  { key: '3', label: '3위', min: 3, max: 3, color: 'text-gold', bg: 'bg-gold/10' },
  { key: '4', label: '4위', min: 4, max: 4, color: 'text-accent', bg: 'bg-accent/10' },
  { key: '5', label: '5위', min: 5, max: 5, color: 'text-accent', bg: 'bg-accent/10' },
  { key: '6-10', label: '6-10위', min: 6, max: 10, color: 'text-accent', bg: 'bg-accent/10' },
  { key: '11-20', label: '11-20위', min: 11, max: 20, color: 'text-dim', bg: 'bg-border/30' },
  { key: '21-30', label: '21-30위', min: 21, max: 30, color: 'text-dim', bg: 'bg-border/30' },
  { key: '30+', label: '30위+', min: 31, max: Infinity, color: 'text-dim', bg: 'bg-border/20' },
];

export default function RankDistribution({ rankings }: Props) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const groupData = RANK_GROUPS.map(g => ({
    ...g,
    keywords: rankings.filter(r => r.rank_position >= g.min && r.rank_position <= g.max),
  }));

  const selected = groupData.find(g => g.key === selectedGroup);
  const totalPages = selected ? Math.ceil(selected.keywords.length / PAGE_SIZE) : 0;
  const displayList = selected
    ? selected.keywords
        .sort((a, b) => a.rank_position - b.rank_position)
        .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] text-dim font-semibold">순위별 키워드 분포</p>
        {!selectedGroup && (
          <p className="text-xs text-accent font-semibold">순위를 눌러 키워드를 확인하세요</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {groupData.map(g => (
          <button
            key={g.key}
            onClick={() => { setSelectedGroup(prev => prev === g.key ? null : g.key); setPage(1); }}
            className={`rounded-xl py-2.5 cursor-pointer transition-all ${g.bg} ${
              selectedGroup === g.key ? 'ring-2 ring-accent scale-[1.02]' : 'hover:scale-[1.02]'
            }`}
          >
            <p className={`text-lg font-black ${g.color}`}>{g.keywords.length}</p>
            <p className="text-[10px] text-dim font-semibold mt-0.5">{g.label}</p>
          </button>
        ))}
      </div>

      {selected && selected.keywords.length > 0 && (
        <div className="mt-3 rounded-lg border border-border bg-surface overflow-hidden">
          <div className="px-4 py-2 bg-bg/30 border-b border-border/50 flex items-center justify-between">
            <span className="text-xs font-bold">{selected.label} 키워드 ({selected.keywords.length}개)</span>
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
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-dim">{kw.rank_position}위</span>
                  {kw.rank_change !== 0 && (
                    <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                      {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} numbers />
        </div>
      )}
    </div>
  );
}
