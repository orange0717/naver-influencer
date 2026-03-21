'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatCount } from '@/lib/format';

interface ChallengeRanking {
  keyword_id: string;
  keyword: string;
  category: string;
  rank_position: number;
  rank_change: number;
  participant_count: number;
  search_volume: number;
  is_integrated_top3: boolean;
}

type SortKey = 'rank' | 'volume' | 'participants' | 'change';
type CompFilter = 'all' | 'low' | 'mid' | 'high';

function getCompLevel(participants: number): CompFilter {
  if (participants <= 30) return 'low';
  if (participants <= 100) return 'mid';
  return 'high';
}

const compLabels: Record<CompFilter, { label: string; className: string }> = {
  all: { label: '전체', className: '' },
  low: { label: '낮음', className: 'bg-emerald-500/15 text-emerald-600' },
  mid: { label: '보통', className: 'bg-amber-500/15 text-amber-600' },
  high: { label: '높음', className: 'bg-rose-500/15 text-rose-600' },
};

export default function ChallengeTable({ rankings }: { rankings: ChallengeRanking[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [compFilter, setCompFilter] = useState<CompFilter>('all');
  const [visibleCount, setVisibleCount] = useState(10);

  const filtered = useMemo(() => {
    let list = [...rankings];
    if (compFilter !== 'all') {
      list = list.filter(r => getCompLevel(r.participant_count) === compFilter);
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case 'rank': return a.rank_position - b.rank_position;
        case 'volume': return (b.search_volume || 0) - (a.search_volume || 0);
        case 'participants': return b.participant_count - a.participant_count;
        case 'change': return Math.abs(b.rank_change) - Math.abs(a.rank_change);
        default: return 0;
      }
    });
    return list;
  }, [rankings, sortKey, compFilter]);

  const displayList = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  if (rankings.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 py-4 border-b border-border bg-bg/30">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
                <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-[15px]">키워드챌린지 성과</h3>
              <p className="text-[11px] text-dim">{filtered.length}개 챌린지</p>
            </div>
          </div>

          {/* 필터 + 정렬 */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1">
              {(['all', 'low', 'mid', 'high'] as CompFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setCompFilter(f); setVisibleCount(10); }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                    compFilter === f
                      ? 'bg-accent text-white'
                      : 'bg-border/30 text-dim hover:bg-border/50'
                  }`}
                >
                  {f === 'all' ? '전체' : compLabels[f].label}
                </button>
              ))}
            </div>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="text-[11px] border border-border rounded-lg px-2 py-1 bg-bg font-medium"
            >
              <option value="rank">순위순</option>
              <option value="volume">검색량순</option>
              <option value="participants">참여자순</option>
              <option value="change">변동순</option>
            </select>
          </div>
        </div>
      </div>

      {/* 데스크톱 테이블 */}
      <div className="hidden lg:block">
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-dim border-b border-border/50">
              <th className="text-left px-5 py-2.5 font-semibold">키워드</th>
              <th className="text-center px-3 py-2.5 font-semibold">순위</th>
              <th className="text-center px-3 py-2.5 font-semibold">변동</th>
              <th className="text-center px-3 py-2.5 font-semibold">참여자</th>
              <th className="text-center px-3 py-2.5 font-semibold">월 검색량</th>
              <th className="text-center px-3 py-2.5 font-semibold">경쟁도</th>
              <th className="text-center px-3 py-2.5 font-semibold">통합</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {displayList.map(r => {
              const comp = getCompLevel(r.participant_count);
              return (
                <tr key={r.keyword_id} className="hover:bg-surface-hover transition">
                  <td className="px-5 py-3">
                    <Link href={`/keywords/${r.keyword_id}`} className="hover:text-accent transition">
                      <span className="text-sm font-semibold">{r.keyword}</span>
                      <span className="text-[11px] text-dim ml-1.5">{r.category}</span>
                    </Link>
                  </td>
                  <td className="text-center px-3 py-3">
                    <span className={`text-sm font-black font-rank ${
                      r.rank_position === 1 ? 'text-gold' : r.rank_position <= 3 ? 'text-accent' : ''
                    }`}>
                      {r.rank_position}위
                    </span>
                  </td>
                  <td className="text-center px-3 py-3">
                    {r.rank_change !== 0 ? (
                      <span className={`text-xs font-bold ${r.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                        {r.rank_change > 0 ? '▲' : '▼'}{Math.abs(r.rank_change)}
                      </span>
                    ) : (
                      <span className="text-xs text-dim">-</span>
                    )}
                  </td>
                  <td className="text-center px-3 py-3">
                    <span className="text-xs text-dim">{r.participant_count}명</span>
                  </td>
                  <td className="text-center px-3 py-3">
                    <span className="text-xs text-dim">
                      {r.search_volume > 0 ? formatCount(r.search_volume) : '-'}
                    </span>
                  </td>
                  <td className="text-center px-3 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${compLabels[comp].className}`}>
                      {compLabels[comp].label}
                    </span>
                  </td>
                  <td className="text-center px-3 py-3">
                    {r.is_integrated_top3 ? (
                      <span className="text-xs font-bold text-gold">T3</span>
                    ) : (
                      <span className="text-xs text-dim">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일 카드 */}
      <div className="lg:hidden divide-y divide-border/20">
        {displayList.map(r => {
          const comp = getCompLevel(r.participant_count);
          return (
            <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
              className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-hover transition">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold truncate">{r.keyword}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${compLabels[comp].className}`}>
                    {compLabels[comp].label}
                  </span>
                  {r.is_integrated_top3 && (
                    <span className="text-[9px] font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded-full shrink-0">T3</span>
                  )}
                </div>
                <div className="text-[11px] text-dim mt-0.5">
                  {r.category} · {r.participant_count}명
                  {r.search_volume > 0 ? ` · 월 ${formatCount(r.search_volume)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {r.rank_change !== 0 && (
                  <span className={`text-xs font-bold ${r.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                    {r.rank_change > 0 ? '▲' : '▼'}{Math.abs(r.rank_change)}
                  </span>
                )}
                <span className={`text-sm font-black font-rank ${
                  r.rank_position === 1 ? 'text-gold' : r.rank_position <= 3 ? 'text-accent' : ''
                }`}>
                  {r.rank_position}위
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 더보기 / 접기 */}
      <div className="px-5 py-3 border-t border-border/50 text-center flex items-center justify-center gap-4">
        {hasMore && (
          <button
            onClick={() => setVisibleCount(prev => prev + 10)}
            className="text-xs font-semibold text-accent hover:text-accent-hover transition"
          >
            더 보기 (+10개, 남은 {filtered.length - visibleCount}개)
          </button>
        )}
        {visibleCount > 10 && (
          <button
            onClick={() => setVisibleCount(10)}
            className="text-xs font-semibold text-dim hover:text-text transition"
          >
            접기
          </button>
        )}
      </div>
    </div>
  );
}
