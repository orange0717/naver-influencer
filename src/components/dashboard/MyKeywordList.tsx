'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import GlassCard from './GlassCard';
import KeywordSyncButton from './KeywordSyncButton';

interface KeywordItem {
  keyword_id: string;
  keyword: string;
  category: string;
  participant_count: number;
  search_volume: number;
  rank_position: number | null;
  rank_change: number;
  is_integrated_top3?: boolean;
}

interface CategoryGroupData {
  category: string;
  keywords: KeywordItem[];
}

function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

type SortKey = 'rank' | 'volume' | 'participants' | 'change' | 'keyword';
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

export default function MyKeywordList({
  categoryGroups,
  totalKeywords,
}: {
  categoryGroups: CategoryGroupData[];
  totalKeywords: number;
}) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [rankFilter, setRankFilter] = useState<'all' | 'ranked' | 'unranked'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [compFilter, setCompFilter] = useState<CompFilter>('all');
  const [visibleCount, setVisibleCount] = useState(20);

  // 카테고리 목록
  const categories = useMemo(() => {
    return ['전체', ...categoryGroups.map(g => g.category)];
  }, [categoryGroups]);

  // 전체 키워드 flat 리스트
  const allKeywords = useMemo(() => {
    return categoryGroups.flatMap(g => g.keywords);
  }, [categoryGroups]);

  // 필터링 + 정렬
  const filteredKeywords = useMemo(() => {
    let list = [...allKeywords];

    // 카테고리 필터
    if (selectedCategory !== '전체') {
      list = list.filter(kw => kw.category === selectedCategory);
    }

    // 노출/미노출 필터
    if (rankFilter === 'ranked') {
      list = list.filter(kw => kw.rank_position !== null);
    } else if (rankFilter === 'unranked') {
      list = list.filter(kw => kw.rank_position === null);
    }

    // 경쟁도 필터
    if (compFilter !== 'all') {
      list = list.filter(kw => getCompLevel(kw.participant_count) === compFilter);
    }

    // 검색 필터
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(kw => kw.keyword.toLowerCase().includes(q));
    }

    // 정렬
    list.sort((a, b) => {
      switch (sortKey) {
        case 'rank': {
          // 순위 있는 것 우선, 없으면 뒤로
          if (a.rank_position !== null && b.rank_position === null) return -1;
          if (a.rank_position === null && b.rank_position !== null) return 1;
          if (a.rank_position !== null && b.rank_position !== null) return a.rank_position - b.rank_position;
          return (b.search_volume || 0) - (a.search_volume || 0);
        }
        case 'volume': return (b.search_volume || 0) - (a.search_volume || 0);
        case 'participants': return b.participant_count - a.participant_count;
        case 'change': return Math.abs(b.rank_change || 0) - Math.abs(a.rank_change || 0);
        case 'keyword': return a.keyword.localeCompare(b.keyword, 'ko');
        default: return 0;
      }
    });

    return list;
  }, [allKeywords, selectedCategory, rankFilter, compFilter, search, sortKey]);

  const displayList = filteredKeywords.slice(0, visibleCount);
  const hasMore = visibleCount < filteredKeywords.length;
  const rankedCount = allKeywords.filter(kw => kw.rank_position !== null).length;
  const unrankedCount = allKeywords.filter(kw => kw.rank_position === null).length;

  return (
    <div className="space-y-3">
      {/* ─── 헤더 ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
              <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
            </svg>
          </div>
          <div>
            <h3 className="font-bold text-[15px]">내 키워드</h3>
            <p className="text-[11px] text-dim">
              {filteredKeywords.length !== totalKeywords
                ? `${filteredKeywords.length} / ${totalKeywords}개`
                : `${categories.length - 1}개 주제 · ${totalKeywords}개 키워드`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-up font-bold bg-up/10 px-2 py-0.5 rounded-full">노출 {rankedCount}</span>
          {unrankedCount > 0 && (
            <span className="text-[11px] text-down font-bold bg-down/10 px-2 py-0.5 rounded-full">미노출 {unrankedCount}</span>
          )}
        </div>
      </div>

      {totalKeywords > 0 && (
        <>
          {/* ─── 필터 바 ─── */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="키워드 검색..."
              value={search}
              onChange={e => { setSearch(e.target.value); setVisibleCount(20); }}
              className="flex-1 min-w-0 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
            />
            <select
              value={selectedCategory}
              onChange={e => { setSelectedCategory(e.target.value); setVisibleCount(20); }}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text focus:outline-none focus:border-accent transition-colors shrink-0"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === '전체' ? `전체 (${totalKeywords})` : `${cat} (${categoryGroups.find(g => g.category === cat)?.keywords.length || 0})`}
                </option>
              ))}
            </select>
            <select
              value={rankFilter}
              onChange={e => { setRankFilter(e.target.value as 'all' | 'ranked' | 'unranked'); setVisibleCount(20); }}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text focus:outline-none focus:border-accent transition-colors shrink-0"
            >
              <option value="all">전체 상태</option>
              <option value="ranked">노출 ({rankedCount})</option>
              <option value="unranked">미노출 ({unrankedCount})</option>
            </select>
          </div>

          {/* ─── 경쟁도 + 정렬 ─── */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1">
              {(['all', 'low', 'mid', 'high'] as CompFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setCompFilter(f); setVisibleCount(20); }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                    compFilter === f
                      ? 'bg-accent text-white'
                      : 'bg-border/30 text-dim hover:bg-border/50'
                  }`}
                >
                  {f === 'all' ? '경쟁도' : compLabels[f].label}
                </button>
              ))}
            </div>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="text-[11px] border border-border rounded-lg px-2 py-1.5 bg-surface font-medium"
            >
              <option value="rank">순위순</option>
              <option value="volume">검색량순</option>
              <option value="participants">참여자순</option>
              <option value="change">변동순</option>
              <option value="keyword">이름순</option>
            </select>
          </div>
        </>
      )}

      {/* ─── 키워드 리스트 ─── */}
      {filteredKeywords.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          {/* 데스크톱 테이블 */}
          <div className="hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-dim border-b border-border/50 bg-bg/30">
                  <th className="text-left px-5 py-2.5 font-semibold">키워드</th>
                  <th className="text-center px-3 py-2.5 font-semibold">순위</th>
                  <th className="text-center px-3 py-2.5 font-semibold">변동</th>
                  <th className="text-center px-3 py-2.5 font-semibold">참여자</th>
                  <th className="text-center px-3 py-2.5 font-semibold">월 검색량</th>
                  <th className="text-center px-3 py-2.5 font-semibold">경쟁도</th>
                  <th className="text-center px-3 py-2.5 font-semibold">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {displayList.map(kw => {
                  const comp = getCompLevel(kw.participant_count);
                  return (
                    <tr key={kw.keyword_id} className="hover:bg-surface-hover transition">
                      <td className="px-5 py-3">
                        <Link href={`/keywords/${kw.keyword_id}`} className="hover:text-accent transition">
                          <span className="text-sm font-semibold">{kw.keyword}</span>
                          <span className="text-[11px] text-dim ml-1.5">{kw.category}</span>
                        </Link>
                      </td>
                      <td className="text-center px-3 py-3">
                        {kw.rank_position !== null ? (
                          <span className={`text-sm font-black font-rank ${
                            kw.rank_position === 1 ? 'text-gold' : kw.rank_position <= 3 ? 'text-accent' : ''
                          }`}>
                            {kw.rank_position}위
                          </span>
                        ) : (
                          <span className="text-xs text-dim">-</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3">
                        {kw.rank_change !== 0 ? (
                          <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                            {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                          </span>
                        ) : (
                          <span className="text-xs text-dim">-</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className="text-xs text-dim">{kw.participant_count}명</span>
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className="text-xs text-dim">
                          {kw.search_volume > 0 ? formatCount(kw.search_volume) : '-'}
                        </span>
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${compLabels[comp].className}`}>
                          {compLabels[comp].label}
                        </span>
                      </td>
                      <td className="text-center px-3 py-3">
                        {kw.rank_position !== null ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] font-bold text-up bg-up/10 px-1.5 py-0.5 rounded">노출</span>
                            {kw.is_integrated_top3 && (
                              <span className="text-[10px] font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded">T3</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] font-bold text-down bg-down/10 px-1.5 py-0.5 rounded">미노출</span>
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
            {displayList.map(kw => {
              const comp = getCompLevel(kw.participant_count);
              return (
                <Link key={kw.keyword_id} href={`/keywords/${kw.keyword_id}`}
                  className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-hover transition">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold truncate">{kw.keyword}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${compLabels[comp].className}`}>
                        {compLabels[comp].label}
                      </span>
                      {kw.is_integrated_top3 && (
                        <span className="text-[9px] font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded-full shrink-0">T3</span>
                      )}
                    </div>
                    <div className="text-[11px] text-dim mt-0.5">
                      {kw.category} · {kw.participant_count}명
                      {kw.search_volume > 0 ? ` · 월 ${formatCount(kw.search_volume)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {kw.rank_change !== 0 && (
                      <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                        {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                      </span>
                    )}
                    {kw.rank_position !== null ? (
                      <span className={`text-sm font-black font-rank ${
                        kw.rank_position === 1 ? 'text-gold' : kw.rank_position <= 3 ? 'text-accent' : ''
                      }`}>
                        {kw.rank_position}위
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-down bg-down/10 px-1.5 py-0.5 rounded">미노출</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* 더보기 / 접기 */}
          <div className="px-5 py-3 border-t border-border/50 text-center flex items-center justify-center gap-4">
            {hasMore && (
              <button
                onClick={() => setVisibleCount(prev => prev + 20)}
                className="text-xs font-semibold text-accent hover:text-accent-hover transition cursor-pointer"
              >
                더 보기 (+20개, 남은 {filteredKeywords.length - visibleCount}개)
              </button>
            )}
            {visibleCount > 20 && (
              <button
                onClick={() => setVisibleCount(20)}
                className="text-xs font-semibold text-dim hover:text-text transition cursor-pointer"
              >
                접기
              </button>
            )}
          </div>
        </div>
      ) : totalKeywords > 0 ? (
        <GlassCard>
          <div className="text-center py-8 text-dim text-sm">
            검색 결과가 없습니다.
          </div>
        </GlassCard>
      ) : (
        <GlassCard>
          <KeywordSyncButton />
        </GlassCard>
      )}
    </div>
  );
}
