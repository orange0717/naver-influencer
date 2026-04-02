'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import GlassCard from './GlassCard';
import KeywordSyncButton from './KeywordSyncButton';
import { formatCount } from '@/lib/format';

interface RankingInfo {
  influencer_name: string;
  rank_position: number;
  fan_count: number;
  naver_id: string;
}

interface KeywordItem {
  keyword_id: string;
  keyword: string;
  category: string;
  participant_count: number;
  search_volume: number;
  rank_position: number | null;
  rank_change: number;
  is_integrated_top3?: boolean;
  is_participated: boolean;
}

interface CategoryGroupData {
  category: string;
  keywords: KeywordItem[];
}

type SortKey = 'rank' | 'volume' | 'participants' | 'change' | 'keyword';
type CompFilter = 'all' | 'low' | 'mid' | 'high';
type ParticipationFilter = 'all' | 'participated' | 'not_participated';

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
  participatedCount,
}: {
  categoryGroups: CategoryGroupData[];
  totalKeywords: number;
  participatedCount: number;
}) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [participationFilter, setParticipationFilter] = useState<ParticipationFilter>('not_participated');
  const [rankFilter, setRankFilter] = useState<'all' | 'ranked' | 'unranked'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [compFilter, setCompFilter] = useState<CompFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  // TOP3 펼치기
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rankingsCache, setRankingsCache] = useState<Record<string, RankingInfo[]>>({});
  const [rankingsLoading, setRankingsLoading] = useState<string | null>(null);

  const toggleRankings = async (kwId: string) => {
    if (expandedId === kwId) { setExpandedId(null); return; }
    setExpandedId(kwId);
    if (rankingsCache[kwId]) return;
    setRankingsLoading(kwId);
    try {
      const res = await fetch(`/api/keywords/${kwId}/rankings`);
      if (res.ok) {
        const data = await res.json();
        setRankingsCache(prev => ({ ...prev, [kwId]: (data.rankings || []).slice(0, 3) }));
      }
    } catch {
      setRankingsCache(prev => ({ ...prev, [kwId]: [] }));
    } finally {
      setRankingsLoading(null);
    }
  };

  const notParticipatedCount = totalKeywords - participatedCount;

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

    // 참여 필터
    if (participationFilter === 'participated') {
      list = list.filter(kw => kw.is_participated);
    } else if (participationFilter === 'not_participated') {
      list = list.filter(kw => !kw.is_participated);
    }

    // 카테고리 필터
    if (selectedCategory !== '전체') {
      list = list.filter(kw => kw.category === selectedCategory);
    }

    // 노출/미노출 필터 (참여 키워드에만 의미 있음)
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
          // 참여 키워드 우선
          if (a.is_participated && !b.is_participated) return -1;
          if (!a.is_participated && b.is_participated) return 1;
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
  }, [allKeywords, selectedCategory, participationFilter, rankFilter, compFilter, search, sortKey]);

  const totalPages = Math.ceil(filteredKeywords.length / PAGE_SIZE);
  const displayList = filteredKeywords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rankedCount = allKeywords.filter(kw => kw.is_participated && kw.rank_position !== null).length;
  const unrankedCount = allKeywords.filter(kw => kw.is_participated && kw.rank_position === null).length;

  // 카테고리별 키워드 수 (참여 필터 연동)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const g of categoryGroups) {
      const filtered = participationFilter === 'participated'
        ? g.keywords.filter(kw => kw.is_participated)
        : participationFilter === 'not_participated'
        ? g.keywords.filter(kw => !kw.is_participated)
        : g.keywords;
      counts[g.category] = filtered.length;
      total += filtered.length;
    }
    counts['전체'] = total;
    return counts;
  }, [categoryGroups, participationFilter]);

  return (
    <div className="space-y-3">
      {/* --- 헤더 --- */}
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
              참여 {participatedCount} / 전체 {totalKeywords}개
              {filteredKeywords.length !== totalKeywords && ` (검색결과 ${filteredKeywords.length}개)`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-accent font-bold bg-accent/10 px-2 py-0.5 rounded-full">참여 {participatedCount}</span>
          <span className="text-[11px] text-dim font-bold bg-border/30 px-2 py-0.5 rounded-full">미참여 {notParticipatedCount}</span>
        </div>
      </div>

      {totalKeywords > 0 && (
        <>
          {/* --- 필터 바 --- */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="키워드 검색..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="flex-1 min-w-0 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
            />
            <select
              value={participationFilter}
              onChange={e => { setParticipationFilter(e.target.value as ParticipationFilter); setCurrentPage(1); }}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text focus:outline-none focus:border-accent transition-colors shrink-0"
            >
              <option value="all">전체 키워드 ({totalKeywords})</option>
              <option value="participated">참여 키워드 ({participatedCount})</option>
              <option value="not_participated">미참여 키워드 ({notParticipatedCount})</option>
            </select>
          </div>

          {/* --- 경쟁도 + 정렬 --- */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1">
              {(['all', 'low', 'mid', 'high'] as CompFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setCompFilter(f); setCurrentPage(1); }}
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

      {/* --- 키워드 리스트 --- */}
      {filteredKeywords.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          {/* 데스크톱 테이블 */}
          <div className="hidden lg:block">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-dim border-b border-border/50 bg-bg/30">
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
                  const dimmed = !kw.is_participated;
                  const isExpanded = expandedId === kw.keyword_id;
                  const rankings = rankingsCache[kw.keyword_id];
                  const isLoadingRank = rankingsLoading === kw.keyword_id;
                  return (
                    <React.Fragment key={kw.keyword_id}>
                    <tr
                      className={`hover:bg-surface-hover transition cursor-pointer ${dimmed ? 'opacity-60' : ''} ${isExpanded ? 'bg-accent/5' : ''}`}
                      onClick={() => toggleRankings(kw.keyword_id)}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/keywords/${kw.keyword_id}`} className="hover:text-accent transition" onClick={e => e.stopPropagation()}>
                            <span className="text-[15px] font-bold">{kw.keyword}</span>
                            <span className="text-xs text-dim ml-1.5">{kw.category}</span>
                          </Link>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-dim transition-transform ${isExpanded ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                      </td>
                      <td className="text-center px-3 py-3">
                        {kw.is_participated && kw.rank_position !== null ? (
                          <span className={`text-[15px] font-black font-rank ${
                            kw.rank_position === 1 ? 'text-gold' : kw.rank_position <= 3 ? 'text-accent' : ''
                          }`}>
                            {kw.rank_position}위
                          </span>
                        ) : (
                          <span className="text-sm text-dim">-</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3">
                        {kw.is_participated && kw.rank_change !== 0 ? (
                          <span className={`text-sm font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                            {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                          </span>
                        ) : (
                          <span className="text-sm text-dim">-</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className="text-sm font-bold font-rank">{kw.participant_count}명</span>
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className="text-sm font-bold font-rank">
                          {kw.search_volume > 0 ? formatCount(kw.search_volume) : '-'}
                        </span>
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${compLabels[comp].className}`}>
                          {compLabels[comp].label}
                        </span>
                      </td>
                      <td className="text-center px-3 py-3">
                        {!kw.is_participated ? (
                          <span className="text-xs font-bold text-dim bg-border/30 px-1.5 py-0.5 rounded">미참여</span>
                        ) : kw.rank_position !== null ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-xs font-bold text-up bg-up/10 px-1.5 py-0.5 rounded">노출</span>
                            {kw.is_integrated_top3 && (
                              <span className="text-xs font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded">T3</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-down bg-down/10 px-1.5 py-0.5 rounded">미노출</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-5 py-3 bg-bg/60">
                          {isLoadingRank ? (
                            <div className="flex items-center gap-2 py-1 pl-4">
                              <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                              <span className="text-xs text-dim">순위 불러오는 중...</span>
                            </div>
                          ) : rankings && rankings.length > 0 ? (
                            <div className="pl-4 space-y-1.5">
                              <p className="text-[11px] font-bold text-dim mb-1.5">실시간 TOP 3</p>
                              {rankings.map(r => (
                                <div key={r.rank_position} className="flex items-center gap-2.5">
                                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                                    r.rank_position === 1 ? 'bg-gold' : r.rank_position === 2 ? 'bg-silver' : 'bg-bronze'
                                  }`}>{r.rank_position}</span>
                                  <Link
                                    href={`/influencers/${encodeURIComponent(r.naver_id)}`}
                                    className="text-sm font-semibold hover:text-accent transition"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {r.influencer_name}
                                  </Link>
                                  {r.fan_count > 0 && (
                                    <span className="text-[11px] text-dim font-rank">
                                      {r.fan_count >= 10000 ? `${(r.fan_count / 10000).toFixed(1)}만` : r.fan_count.toLocaleString()}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="pl-4 py-1 text-xs text-dim">순위 정보가 없습니다</div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="lg:hidden divide-y divide-border/20">
            {displayList.map(kw => {
              const comp = getCompLevel(kw.participant_count);
              const dimmed = !kw.is_participated;
              return (
                <Link key={kw.keyword_id} href={`/keywords/${kw.keyword_id}`}
                  className={`flex items-center justify-between px-4 py-3.5 hover:bg-surface-hover transition ${dimmed ? 'opacity-60' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-bold truncate">{kw.keyword}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${compLabels[comp].className}`}>
                        {compLabels[comp].label}
                      </span>
                      {kw.is_participated && kw.is_integrated_top3 && (
                        <span className="text-[9px] font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded-full shrink-0">T3</span>
                      )}
                    </div>
                    <div className="text-xs text-dim mt-0.5">
                      {kw.category} · {kw.participant_count}명
                      {kw.search_volume > 0 ? ` · 월 ${formatCount(kw.search_volume)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {kw.is_participated && kw.rank_change !== 0 && (
                      <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                        {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                      </span>
                    )}
                    {!kw.is_participated ? (
                      <span className="text-[10px] font-bold text-dim bg-border/30 px-1.5 py-0.5 rounded">미참여</span>
                    ) : kw.rank_position !== null ? (
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

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-30 disabled:cursor-default bg-border/30 text-dim hover:bg-border/50"
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                .reduce<(number | 'dots')[]>((acc, p, i, arr) => {
                  if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('dots');
                  acc.push(p);
                  return acc;
                }, [])
                .map((item, i) =>
                  item === 'dots' ? (
                    <span key={`dots-${i}`} className="px-1 text-xs text-dim">...</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        currentPage === item
                          ? 'bg-accent text-white'
                          : 'bg-border/30 text-dim hover:bg-border/50'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-30 disabled:cursor-default bg-border/30 text-dim hover:bg-border/50"
              >
                다음
              </button>
            </div>
          )}
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
