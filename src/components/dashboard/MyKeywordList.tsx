'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import DashboardCard, { DashboardCardIcon } from './DashboardCard';
import KeywordSyncButton from './KeywordSyncButton';
import BookmarkButton from '@/components/keywords/BookmarkButton';
import { useSavedKeywords } from '@/hooks/useSavedKeywords';
import { formatCount } from '@/lib/format';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';

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
  blog_search_rank?: number | null;
  view_tab_rank?: number | null;
  is_participated: boolean;
}

interface CategoryGroupData {
  category: string;
  keywords: KeywordItem[];
}

type SortKey = 'rank' | 'volume' | 'participants' | 'change' | 'keyword' | 'comp';
type SortDir = 'asc' | 'desc';
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
  defaultCategory,
}: {
  categoryGroups: CategoryGroupData[];
  totalKeywords: number;
  participatedCount: number;
  /** 인플루언서 주력 분야 — 있으면 해당 주제만 기본 표시 */
  defaultCategory?: string | null;
}) {
  const [search, setSearch] = useState('');

  /** 탭 순서: 참여 키워드 많은 주제가 앞(부모에서 이미 정렬됨). '전체'는 마지막만. */
  const topicTabs = useMemo(() => {
    const names = categoryGroups.map((g) => g.category);
    if (names.length <= 1) return names;
    return [...names, '전체'];
  }, [categoryGroups]);

  const resolvedDefault = useMemo(() => {
    const names = categoryGroups.map((g) => g.category);
    if (names.length === 0) return '전체';
    if (defaultCategory && names.includes(defaultCategory)) return defaultCategory;
    return names[0];
  }, [categoryGroups, defaultCategory]);

  const [selectedCategory, setSelectedCategory] = useState(resolvedDefault);

  useEffect(() => {
    setSelectedCategory((prev) => {
      if (topicTabs.includes(prev)) return prev;
      return resolvedDefault;
    });
  }, [topicTabs, resolvedDefault]);
  const [participationFilter, setParticipationFilter] = useState<ParticipationFilter>('not_participated');
  const [rankFilter, setRankFilter] = useState<'all' | 'ranked' | 'unranked'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [compFilter, setCompFilter] = useState<CompFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  // TOP3 인라인 표시
  const [top3Map, setTop3Map] = useState<Record<string, { rank: number; name: string; naver_id: string }[]>>({});

  // TOP3 펼치기
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rankingsCache, setRankingsCache] = useState<Record<string, RankingInfo[]>>({});
  const [rankingsLoading, setRankingsLoading] = useState<string | null>(null);

  // 검색 노출 데이터
  const [exposureCache, setExposureCache] = useState<Record<string, { blog: { naver_id: string; rank: number }[]; view: { naver_id: string; rank: number }[] }>>({});
  const [exposureLoading, setExposureLoading] = useState<string | null>(null);

  // 저장된 키워드 토글
  const { savedSet, toggle: toggleSaved } = useSavedKeywords();
  const handleToggleSave = (kw: KeywordItem) => {
    toggleSaved(kw.keyword, {
      monthly_total: kw.search_volume || 0,
      competition: getCompLevel(kw.participant_count) === 'low' ? '낮음' : getCompLevel(kw.participant_count) === 'mid' ? '보통' : '높음',
    });
  };

  const toggleRankings = async (kwId: string) => {
    if (expandedId === kwId) { setExpandedId(null); return; }
    setExpandedId(kwId);
    // TOP3 로드
    if (!rankingsCache[kwId]) {
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
    }
    // 검색 노출 로드
    if (!exposureCache[kwId]) {
      setExposureLoading(kwId);
      try {
        const res = await fetch(`/api/keywords/${kwId}/search-exposure`);
        if (res.ok) {
          const data = await res.json();
          setExposureCache(prev => ({ ...prev, [kwId]: { blog: data.blog || [], view: data.view || [] } }));
        }
      } catch {
        setExposureCache(prev => ({ ...prev, [kwId]: { blog: [], view: [] } }));
      } finally {
        setExposureLoading(null);
      }
    }
  };

  const notParticipatedCount = totalKeywords - participatedCount;

  /** 현재 선택 주제 기준 참여/전체 건수 (헤더 요약) */
  const headerCounts = useMemo(() => {
    if (selectedCategory === '전체') {
      return { participated: participatedCount, total: totalKeywords };
    }
    const g = categoryGroups.find((x) => x.category === selectedCategory);
    if (!g) return { participated: participatedCount, total: totalKeywords };
    const p = g.keywords.filter((kw) => kw.is_participated).length;
    return { participated: p, total: g.keywords.length };
  }, [selectedCategory, categoryGroups, participatedCount, totalKeywords]);

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

    // 주제(카테고리) 필터 — '전체'일 때만 모든 주제 표시
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
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case 'rank': {
          // 참여 키워드 우선
          if (a.is_participated && !b.is_participated) return -1;
          if (!a.is_participated && b.is_participated) return 1;
          // 순위 있는 것 우선, 없으면 뒤로
          if (a.rank_position !== null && b.rank_position === null) return -1;
          if (a.rank_position === null && b.rank_position !== null) return 1;
          if (a.rank_position !== null && b.rank_position !== null) return (a.rank_position - b.rank_position) * dir;
          return (b.search_volume || 0) - (a.search_volume || 0);
        }
        case 'volume': return ((b.search_volume || 0) - (a.search_volume || 0)) * dir;
        case 'participants': return (b.participant_count - a.participant_count) * dir;
        case 'change': return (Math.abs(b.rank_change || 0) - Math.abs(a.rank_change || 0)) * dir;
        case 'keyword': return a.keyword.localeCompare(b.keyword, 'ko') * dir;
        case 'comp': {
          const compOrder = (p: number) => p <= 30 ? 1 : p <= 100 ? 2 : 3;
          return (compOrder(a.participant_count) - compOrder(b.participant_count)) * dir;
        }
        default: return 0;
      }
    });

    return list;
  }, [allKeywords, selectedCategory, participationFilter, rankFilter, compFilter, search, sortKey, sortDir]);

  const totalPages = Math.ceil(filteredKeywords.length / PAGE_SIZE);
  const displayList = filteredKeywords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 현재 페이지 키워드의 TOP3 배치 조회
  useEffect(() => {
    if (displayList.length === 0) return;
    const names = displayList.slice(0, 20).map(kw => kw.keyword);
    fetch(`/api/keywords/batch-top3?keywords=${encodeURIComponent(names.join(','))}`)
      .then(res => res.json())
      .then(data => {
        if (data.top3) {
          const mapped: Record<string, typeof data.top3[string]> = {};
          for (const kw of displayList) {
            if (data.top3[kw.keyword]) {
              mapped[kw.keyword_id] = data.top3[kw.keyword];
            }
          }
          setTop3Map(prev => ({ ...prev, ...mapped }));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, participationFilter, selectedCategory, compFilter, sortKey, search]);

  // 헤더 클릭 정렬
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setCurrentPage(1);
  };

  const SortArrow = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return <span className="text-accent ml-0.5">{sortDir === 'desc' ? '\u25BC' : '\u25B2'}</span>;
  };

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
    <DashboardCard
      title="내 키워드"
      subtitle={
        <>
          참여 {headerCounts.participated} / 전체 {headerCounts.total}개
          {selectedCategory !== '전체' && ` · ${selectedCategory}`}
          {filteredKeywords.length !== headerCounts.total && ` (표시 ${filteredKeywords.length}개)`}
        </>
      }
      icon={
        <DashboardCardIcon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
            <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
          </svg>
        </DashboardCardIcon>
      }
      headerRight={
        <>
          <span className="text-[11px] text-accent font-bold bg-accent/10 px-2 py-0.5 rounded-full">참여 {headerCounts.participated}</span>
          <span className="text-[11px] text-dim font-bold bg-border/30 px-2 py-0.5 rounded-full">미참여 {headerCounts.total - headerCounts.participated}</span>
        </>
      }
    >
      <div className="space-y-3">
      {totalKeywords > 0 && topicTabs.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="키워드 주제">
          {topicTabs.map((tab) => {
            const count = tab === '전체' ? categoryCounts['전체'] : categoryCounts[tab] ?? 0;
            const active = selectedCategory === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setSelectedCategory(tab);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition cursor-pointer border ${
                  active
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface text-dim border-border hover:border-accent/40 hover:text-text'
                }`}
              >
                {tab}
                <span className={`ml-1 tabular-nums ${active ? 'text-white/80' : 'text-dim'}`}>({count})</span>
              </button>
            );
          })}
        </div>
      )}

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
            {(search || selectedCategory !== resolvedDefault || participationFilter !== 'not_participated' || compFilter !== 'all' || rankFilter !== 'all' || sortKey !== 'rank') && (
              <button
                onClick={() => { setSearch(''); setSelectedCategory(resolvedDefault); setParticipationFilter('not_participated'); setCompFilter('all'); setRankFilter('all'); setSortKey('rank'); setSortDir('desc'); setCurrentPage(1); }}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold bg-down/10 text-down border border-down/20 hover:bg-down/20 transition-colors cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>

          {/* --- 경쟁도 + 정렬 --- */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SegmentedFilter
              options={(['all', 'low', 'mid', 'high'] as CompFilter[]).map(f => ({
                value: f,
                label: f === 'all' ? '경쟁도' : compLabels[f].label,
              }))}
              value={compFilter}
              onChange={f => { setCompFilter(f); setCurrentPage(1); }}
            />
            <div className="flex items-center gap-1">
              <select
                value={sortKey}
                onChange={e => { setSortKey(e.target.value as SortKey); setSortDir('desc'); setCurrentPage(1); }}
                className="text-xs border border-border rounded-lg px-2 py-1.5 bg-surface font-semibold"
              >
                <option value="rank">순위</option>
                <option value="volume">검색량</option>
                <option value="participants">참여자</option>
                <option value="change">변동</option>
                <option value="keyword">이름</option>
                <option value="comp">경쟁도</option>
              </select>
              <button
                onClick={() => { setSortDir(prev => prev === 'desc' ? 'asc' : 'desc'); setCurrentPage(1); }}
                className="px-2 py-1.5 flex items-center gap-1 rounded-lg border border-border bg-surface text-dim hover:text-text transition cursor-pointer text-xs font-semibold"
                title={sortDir === 'desc' ? '내림차순' : '오름차순'}
              >
                {sortDir === 'desc' ? '\u25BC' : '\u25B2'}
                <span>{sortDir === 'desc' ? '내림' : '오름'}</span>
              </button>
            </div>
          </div>

          {participationFilter === 'not_participated' && (
            <div className="rounded-lg border border-accent/25 bg-accent/5 px-3 py-2.5 text-[11px] text-text leading-relaxed">
              <span className="font-semibold text-accent">미참여 키워드</span>는 챌린지에 참여하기 전까지
              순위·변동·통합검색·블로그탭 숫자가 비어 있습니다. 월 검색량·경쟁도만 참고용으로 보입니다.
              지표를 보려면 위에서 <span className="font-semibold">참여 키워드</span> 또는 <span className="font-semibold">전체 키워드</span>를 선택하세요.
            </div>
          )}
        </>
      )}

      {/* --- 키워드 리스트 --- */}
      {filteredKeywords.length > 0 ? (
        <div className="rounded-lg border border-border bg-surface overflow-hidden">
          {/* 데스크톱 테이블 */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-dim border-b border-border/50 bg-bg/30">
                  <th className="text-left px-5 py-2.5 font-semibold cursor-pointer hover:text-text select-none" onClick={() => handleSort('keyword')}>키워드<SortArrow col="keyword" /></th>
                  <th className="text-center px-3 py-2.5 font-semibold cursor-pointer hover:text-text select-none" onClick={() => handleSort('rank')}>순위<SortArrow col="rank" /></th>
                  <th className="text-center px-3 py-2.5 font-semibold cursor-pointer hover:text-text select-none" onClick={() => handleSort('change')}>변동<SortArrow col="change" /></th>
                  <th className="text-center px-2 py-2.5 font-semibold text-[11px]" title="네이버 통합검색 노출 순위">
                    통합검색
                  </th>
                  <th className="text-center px-2 py-2.5 font-semibold text-[11px]" title="블로그 탭 검색 노출 순위">블로그탭</th>
                  <th className="text-center px-3 py-2.5 font-semibold cursor-pointer hover:text-text select-none" onClick={() => handleSort('participants')}>참여자<SortArrow col="participants" /></th>
                  <th className="text-center px-3 py-2.5 font-semibold cursor-pointer hover:text-text select-none" onClick={() => handleSort('volume')}>월 검색량<SortArrow col="volume" /></th>
                  <th className="text-center px-3 py-2.5 font-semibold cursor-pointer hover:text-text select-none" onClick={() => handleSort('comp')}>경쟁도<SortArrow col="comp" /></th>
                  <th className="text-center px-3 py-2.5 font-semibold">상태</th>
                  <th className="text-center px-2 py-2.5 font-semibold w-10">저장</th>
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
                          <Link href={`/keywords/${kw.keyword_id}`} className="hover:text-accent transition shrink-0" onClick={e => e.stopPropagation()}>
                            <span className="text-[15px] font-bold">{kw.keyword}</span>
                            <span className="text-xs text-dim ml-1.5">{kw.category}</span>
                          </Link>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-dim transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                          {top3Map[kw.keyword_id] && top3Map[kw.keyword_id].length > 0 && (
                            <span className="text-xs text-dim truncate">
                              {top3Map[kw.keyword_id].map((t, idx) => (
                                <span key={t.naver_id}>
                                  <span className={t.rank === 1 ? 'text-gold font-bold' : t.rank === 2 ? 'text-silver font-bold' : 'text-bronze font-bold'}>{t.rank}</span>
                                  <span className="ml-0.5 font-medium">{t.name}</span>
                                  {idx < top3Map[kw.keyword_id].length - 1 && <span className="mx-1 text-border">|</span>}
                                </span>
                              ))}
                            </span>
                          )}
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
                        {!kw.is_participated || kw.rank_position === null ? (
                          <span className="text-sm text-dim">-</span>
                        ) : kw.rank_change === 0 ? (
                          <span className="text-sm text-dim font-medium">유지</span>
                        ) : (
                          <span className={`text-sm font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                            {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                          </span>
                        )}
                      </td>
                      <td className="text-center px-2 py-3">
                        {kw.view_tab_rank != null ? (
                          <span className="text-[15px] font-bold font-rank">{kw.view_tab_rank}</span>
                        ) : (
                          <span className="text-sm text-dim">-</span>
                        )}
                      </td>
                      <td className="text-center px-2 py-3">
                        {kw.blog_search_rank != null ? (
                          <span className="text-[15px] font-bold font-rank">{kw.blog_search_rank}</span>
                        ) : (
                          <span className="text-sm text-dim">-</span>
                        )}
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className="text-sm font-light font-rank">{kw.participant_count}명</span>
                      </td>
                      <td className="text-center px-3 py-3">
                        <span className="text-sm font-light font-rank">
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
                      <td className="text-center px-2 py-3">
                        <BookmarkButton
                          isSaved={savedSet.has(kw.keyword)}
                          onClick={() => handleToggleSave(kw)}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={10} className="px-5 py-3 bg-bg/60">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-4">
                            {/* 챌린지 TOP3 */}
                            <div>
                              <p className="text-[11px] font-bold text-dim mb-1.5">챌린지 TOP 3</p>
                              {isLoadingRank ? (
                                <div className="flex items-center gap-2 py-1">
                                  <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                                  <span className="text-xs text-dim">로딩...</span>
                                </div>
                              ) : rankings && rankings.length > 0 ? (
                                <div className="space-y-1.5">
                                  {rankings.map(r => (
                                    <div key={r.rank_position} className="flex items-center gap-2">
                                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                                        r.rank_position === 1 ? 'bg-gold' : r.rank_position === 2 ? 'bg-silver' : 'bg-bronze'
                                      }`}>{r.rank_position}</span>
                                      <Link
                                        href={`/influencers/${encodeURIComponent(r.naver_id)}`}
                                        className="text-xs font-semibold hover:text-accent transition truncate"
                                        onClick={e => e.stopPropagation()}
                                      >
                                        {r.influencer_name}
                                      </Link>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-dim">데이터 없음</p>
                              )}
                            </div>

                            {/* 블로그 검색 노출 */}
                            <div>
                              <p className="text-[11px] font-bold text-dim mb-1.5">블로그 검색</p>
                              {exposureLoading === kw.keyword_id ? (
                                <div className="flex items-center gap-2 py-1">
                                  <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full" />
                                  <span className="text-xs text-dim">크롤링 중...</span>
                                </div>
                              ) : exposureCache[kw.keyword_id]?.blog?.length > 0 ? (
                                <div className="space-y-1">
                                  {exposureCache[kw.keyword_id].blog.slice(0, 5).map((b, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      <span className="font-bold font-rank text-blue-500 w-5 text-center">{b.rank}</span>
                                      <span className="truncate">{b.naver_id}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : exposureCache[kw.keyword_id] ? (
                                <p className="text-xs text-dim">노출 없음</p>
                              ) : null}
                            </div>

                            {/* 통합검색 노출 */}
                            <div>
                              <p className="text-[11px] font-bold text-dim mb-1.5">통합검색</p>
                              {exposureLoading === kw.keyword_id ? (
                                <div className="flex items-center gap-2 py-1">
                                  <div className="animate-spin w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full" />
                                  <span className="text-xs text-dim">크롤링 중...</span>
                                </div>
                              ) : exposureCache[kw.keyword_id]?.view?.length > 0 ? (
                                <div className="space-y-1">
                                  {exposureCache[kw.keyword_id].view.slice(0, 5).map((v, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      <span className="font-bold font-rank text-green-500 w-5 text-center">{v.rank}</span>
                                      <span className="truncate">{v.naver_id}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : exposureCache[kw.keyword_id] ? (
                                <p className="text-xs text-dim">노출 없음</p>
                              ) : null}
                            </div>
                          </div>
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
          <div className="md:hidden divide-y divide-border/20">
            {displayList.map(kw => {
              const comp = getCompLevel(kw.participant_count);
              const dimmed = !kw.is_participated;
              return (
                <Link key={kw.keyword_id} href={`/keywords/${kw.keyword_id}`}
                  className={`block px-4 py-3.5 hover:bg-surface-hover transition ${dimmed ? 'opacity-60' : ''}`}>
                  <div className="flex items-center justify-between">
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
                    {kw.is_participated && kw.rank_position !== null && kw.rank_change !== 0 && (
                      <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                        {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                      </span>
                    )}
                    {kw.is_participated && kw.rank_position !== null && kw.rank_change === 0 && (
                      <span className="text-[10px] font-semibold text-dim">유지</span>
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
                    <BookmarkButton
                      isSaved={savedSet.has(kw.keyword)}
                      onClick={() => handleToggleSave(kw)}
                    />
                  </div>
                  </div>
                  {top3Map[kw.keyword_id] && top3Map[kw.keyword_id].length > 0 && (
                    <div className="text-[10px] text-dim mt-1">
                      {top3Map[kw.keyword_id].map((t, idx) => (
                        <span key={t.naver_id}>
                          <span className={t.rank === 1 ? 'text-gold font-bold' : t.rank === 2 ? 'text-silver font-bold' : 'text-bronze font-bold'}>{t.rank}</span>
                          <span className="ml-0.5">{t.name}</span>
                          {idx < top3Map[kw.keyword_id].length - 1 && <span className="mx-1 text-border">|</span>}
                        </span>
                      ))}
                    </div>
                  )}
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
        <div className="text-center py-8 text-dim text-sm rounded-lg border border-border bg-bg/30">
          검색 결과가 없습니다.
        </div>
      ) : (
        <KeywordSyncButton />
      )}
      </div>
    </DashboardCard>
  );
}
