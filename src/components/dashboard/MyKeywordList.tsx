'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import DashboardCard, { DashboardCardIcon } from './DashboardCard';
import KeywordSyncButton from './KeywordSyncButton';
import BookmarkButton from '@/components/keywords/BookmarkButton';
import { useSavedKeywords } from '@/hooks/useSavedKeywords';
import { formatCount } from '@/lib/format';
import DataTable from '@/components/analytics/DataTable';
import StatusBadge from '@/components/analytics/StatusBadge';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';
import Pagination from '@/components/analytics/Pagination';
import { ANALYTICS_SCOPE } from '@/components/analytics/tokens';
import type { DataTableColumn, StatusTone } from '@/components/analytics/types';
import '@/components/analytics/analytics-tokens.css';

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
type CompLevel = Exclude<CompFilter, 'all'>;
type ParticipationFilter = 'all' | 'participated' | 'not_participated';

/** 미참여 안내 배너를 닫은 상태 — 한 번 이해한 문구를 매번 다시 읽히지 않는다. */
const NOTICE_DISMISS_KEY = 'ninfle:my-keywords:not-participated-notice';

function getCompLevel(participants: number): CompLevel {
  if (participants <= 30) return 'low';
  if (participants <= 100) return 'mid';
  return 'high';
}

/** 경쟁도는 공용 상태 토큰(초록/주황/빨강)만 쓴다 — 다른 분석 화면의 배지와 같은 색. */
const compMeta: Record<CompLevel, { label: string; tone: StatusTone }> = {
  low: { label: '낮음', tone: 'success' },
  mid: { label: '보통', tone: 'warning' },
  high: { label: '높음', tone: 'danger' },
};

const compFilterOptions: { value: CompFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'low', label: '낮음' },
  { value: 'mid', label: '보통' },
  { value: 'high', label: '높음' },
];

/** 값이 없는 칸은 '-' 대신 항상 같은 대시 + 이유 툴팁. */
function Dash({ title }: { title?: string }) {
  return (
    <span className="text-dim" title={title}>
      —
    </span>
  );
}

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

  // 미참여 안내 배너(닫기 가능)
  const [noticeDismissed, setNoticeDismissed] = useState(true);
  useEffect(() => {
    try {
      setNoticeDismissed(window.localStorage.getItem(NOTICE_DISMISS_KEY) === '1');
    } catch {
      setNoticeDismissed(false);
    }
  }, []);
  const dismissNotice = () => {
    setNoticeDismissed(true);
    try {
      window.localStorage.setItem(NOTICE_DISMISS_KEY, '1');
    } catch {
      /* 저장 실패는 무시 — 다음 방문에 다시 보일 뿐이다 */
    }
  };

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
      competition: compMeta[getCompLevel(kw.participant_count)].label,
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

  const filtersDirty =
    Boolean(search) ||
    selectedCategory !== resolvedDefault ||
    participationFilter !== 'not_participated' ||
    compFilter !== 'all' ||
    rankFilter !== 'all' ||
    sortKey !== 'rank';

  const resetFilters = () => {
    setSearch('');
    setSelectedCategory(resolvedDefault);
    setParticipationFilter('not_participated');
    setCompFilter('all');
    setRankFilter('all');
    setSortKey('rank');
    setSortDir('desc');
    setCurrentPage(1);
  };

  /** 정렬 가능한 헤더 라벨. 정렬은 상태가 아니라 조작이므로 강조색 대신 본문색으로만 표시한다. */
  const SortHead = ({ col, children }: { col: SortKey; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => handleSort(col)}
      title={`${typeof children === 'string' ? children : ''} 기준 정렬`}
      className={`inline-flex items-center gap-0.5 cursor-pointer transition hover:text-text ${sortKey === col ? 'text-text' : ''}`}
    >
      {children}
      {sortKey === col && <span className="text-text-2">{sortDir === 'desc' ? '▼' : '▲'}</span>}
    </button>
  );

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

  /* ── 컬럼 정의 ────────────────────────────────────────────────
     미참여만 보는 동안에는 순위·변동·검색노출이 정의상 전부 비어 있다.
     '-' 로 채운 칸 4개를 보여주는 대신 컬럼 자체를 접고, 그때 의미가 있는
     핵심 지표(월 검색량 · 참여자 · 경쟁도 · 상태)만 남긴다.               */
  const showRankColumns = participationFilter !== 'not_participated';

  const columns: DataTableColumn<KeywordItem>[] = [
    { key: 'keyword', header: <SortHead col="keyword">키워드</SortHead>, align: 'left' },
    ...(showRankColumns
      ? ([
          { key: 'rank', header: <SortHead col="rank">순위</SortHead>, align: 'right', width: 'w-24', divider: true },
          { key: 'exposure', header: '검색 노출', align: 'center', width: 'w-36' },
        ] as DataTableColumn<KeywordItem>[])
      : []),
    { key: 'volume', header: <SortHead col="volume">월 검색량</SortHead>, align: 'right', width: 'w-28', divider: true },
    { key: 'participants', header: <SortHead col="participants">참여자</SortHead>, align: 'right', width: 'w-24' },
    { key: 'comp', header: <SortHead col="comp">경쟁도</SortHead>, align: 'center', width: 'w-24' },
    { key: 'status', header: '상태', align: 'center', width: 'w-28' },
    { key: 'save', header: '저장', align: 'center', width: 'w-12' },
  ];

  const cellClass = 'px-3 py-3.5 align-middle';

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
      <div className={`${ANALYTICS_SCOPE} space-y-3`}>
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
                    ? 'bg-text text-white border-text'
                    : 'bg-surface text-dim border-border hover:border-border-strong hover:text-text'
                }`}
              >
                {tab}
                <span className={`ml-1 tabular-nums ${active ? 'text-white/70' : 'text-dim'}`}>({count})</span>
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
              className="flex-1 min-w-0 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-border-strong transition-colors"
            />
            <select
              value={participationFilter}
              onChange={e => { setParticipationFilter(e.target.value as ParticipationFilter); setCurrentPage(1); }}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text focus:outline-none focus:border-border-strong transition-colors shrink-0"
            >
              <option value="all">전체 키워드 ({totalKeywords})</option>
              <option value="participated">참여 키워드 ({participatedCount})</option>
              <option value="not_participated">미참여 키워드 ({notParticipatedCount})</option>
            </select>
            {filtersDirty && (
              <button
                onClick={resetFilters}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold bg-surface text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors cursor-pointer"
              >
                초기화
              </button>
            )}
          </div>

          {/* --- 경쟁도 + 정렬 --- */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-dim">경쟁도</span>
              <SegmentedFilter
                options={compFilterOptions}
                value={compFilter}
                onChange={f => { setCompFilter(f); setCurrentPage(1); }}
                tone="neutral"
              />
            </div>
            <div className="flex items-center gap-1">
              <select
                value={sortKey}
                onChange={e => { setSortKey(e.target.value as SortKey); setSortDir('desc'); setCurrentPage(1); }}
                title="정렬 기준"
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
                {sortDir === 'desc' ? '▼' : '▲'}
                <span>{sortDir === 'desc' ? '내림' : '오름'}</span>
              </button>
            </div>
          </div>

          {/* --- 미참여 안내(닫기 가능) --- */}
          {participationFilter === 'not_participated' && !noticeDismissed && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-[11px] leading-relaxed text-text-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-dim">
                <circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" />
              </svg>
              <p className="flex-1">
                <span className="font-semibold text-text">미참여 키워드</span>는 챌린지 참여 전이라 순위·변동·검색 노출 데이터가 없습니다.
                지금은 <span className="font-semibold text-text">월 검색량 · 참여자 · 경쟁도</span>로 참여할 키워드를 고르는 화면입니다.
                순위를 보려면 위에서 <span className="font-semibold text-text">참여 키워드</span>를 선택하세요.
              </p>
              <button
                type="button"
                onClick={dismissNotice}
                aria-label="안내 닫기"
                className="shrink-0 -mt-0.5 -mr-1 p-1 rounded text-dim hover:text-text hover:bg-surface-hover transition cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}

      {/* --- 키워드 리스트 --- */}
      {totalKeywords > 0 ? (
        <DataTable
          className="rounded-lg border border-border bg-surface overflow-hidden"
          columns={columns}
          rows={displayList}
          rowKey={kw => kw.keyword_id}
          maxHeight="65vh"
          minWidth={showRankColumns ? '900px' : '720px'}
          empty={{
            title: '조건에 맞는 키워드가 없습니다.',
            description: '주제·참여 여부·경쟁도 필터를 넓혀 보세요.',
            action: filtersDirty ? (
              <button
                onClick={resetFilters}
                className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-semibold text-text-2 hover:text-text hover:border-border-strong transition cursor-pointer"
              >
                필터 초기화
              </button>
            ) : undefined,
          }}
          footer={<Pagination page={currentPage} totalPages={totalPages} onChange={setCurrentPage} numbers />}
          renderRows={kw => {
            const comp = compMeta[getCompLevel(kw.participant_count)];
            const dimmed = !kw.is_participated;
            const isExpanded = expandedId === kw.keyword_id;
            const rankings = rankingsCache[kw.keyword_id];
            const isLoadingRank = rankingsLoading === kw.keyword_id;
            const top3 = top3Map[kw.keyword_id];
            const hasExposure = kw.view_tab_rank != null || kw.blog_search_rank != null;
            return (
              <>
                <tr
                  className={`hover:bg-surface-hover transition cursor-pointer ${dimmed ? 'opacity-70' : ''} ${isExpanded ? 'bg-surface-hover' : ''}`}
                  onClick={() => toggleRankings(kw.keyword_id)}
                >
                  {/* 키워드 — 2줄: 이름 / 주제 · TOP3 */}
                  <td className="px-4 py-3.5 align-middle">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/keywords/${kw.keyword_id}`}
                          className="text-[15px] font-bold hover:text-accent transition truncate"
                          onClick={e => e.stopPropagation()}
                        >
                          {kw.keyword}
                        </Link>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-dim transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-dim min-w-0">
                        <span className="shrink-0">{kw.category}</span>
                        {top3 && top3.length > 0 && (
                          <>
                            <span className="text-border shrink-0">|</span>
                            <span className="truncate" title={top3.map(t => `${t.rank}위 ${t.name}`).join(' · ')}>
                              {top3.map((t, idx) => (
                                <span key={t.naver_id}>
                                  <span className={t.rank === 1 ? 'text-gold font-bold' : t.rank === 2 ? 'text-silver font-bold' : 'text-bronze font-bold'}>{t.rank}위</span>
                                  <span className="ml-0.5 font-medium text-text-2">{t.name}</span>
                                  {idx < top3.length - 1 && <span className="mx-1 text-border">·</span>}
                                </span>
                              ))}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </td>

                  {showRankColumns && (
                    <>
                      {/* 순위 — 2줄: 순위 / 변동 */}
                      <td className={`${cellClass} text-right border-l border-border/40`}>
                        {kw.is_participated && kw.rank_position !== null ? (
                          <>
                            <div className={`text-[15px] font-black font-rank tabular-nums ${kw.rank_position === 1 ? 'text-gold' : kw.rank_position <= 3 ? 'text-accent' : ''}`}>
                              {kw.rank_position}위
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold">
                              {kw.rank_change === 0 ? (
                                <span className="text-dim">유지</span>
                              ) : (
                                <span className={kw.rank_change > 0 ? 'text-up' : 'text-down'}>
                                  {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <Dash title={kw.is_participated ? '아직 순위권에 들지 않았습니다' : '챌린지 미참여 — 순위 데이터 없음'} />
                        )}
                      </td>

                      {/* 검색 노출 — 통합검색/블로그탭을 한 칸으로 요약 */}
                      <td className={`${cellClass} text-center`}>
                        {hasExposure ? (
                          <span
                            className="inline-flex items-center gap-1"
                            title={`통합검색 ${kw.view_tab_rank ?? '노출 없음'} · 블로그탭 ${kw.blog_search_rank ?? '노출 없음'}`}
                          >
                            {kw.view_tab_rank != null && (
                              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[var(--a-neutral-bg)] text-[var(--a-neutral-fg)] tabular-nums">
                                통합 {kw.view_tab_rank}
                              </span>
                            )}
                            {kw.blog_search_rank != null && (
                              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[var(--a-neutral-bg)] text-[var(--a-neutral-fg)] tabular-nums">
                                블로그 {kw.blog_search_rank}
                              </span>
                            )}
                          </span>
                        ) : (
                          <Dash title="통합검색·블로그탭 모두 노출 없음" />
                        )}
                      </td>
                    </>
                  )}

                  {/* 월 검색량 */}
                  <td className={`${cellClass} text-right border-l border-border/40`}>
                    {kw.search_volume > 0 ? (
                      <span className="text-sm font-rank tabular-nums" title={`${kw.search_volume.toLocaleString()}회`}>
                        {formatCount(kw.search_volume)}
                      </span>
                    ) : (
                      <Dash title="검색량 데이터 없음" />
                    )}
                  </td>

                  {/* 참여자 */}
                  <td className={`${cellClass} text-right`}>
                    <span className="text-sm font-rank tabular-nums">{kw.participant_count.toLocaleString()}</span>
                    <span className="text-[11px] text-dim ml-0.5">명</span>
                  </td>

                  {/* 경쟁도 */}
                  <td className={`${cellClass} text-center`}>
                    <StatusBadge tone={comp.tone} label={comp.label} title={`참여자 ${kw.participant_count}명 기준`} />
                  </td>

                  {/* 상태 */}
                  <td className={`${cellClass} text-center`}>
                    {!kw.is_participated ? (
                      <StatusBadge tone="neutral" label="미참여" />
                    ) : kw.rank_position !== null ? (
                      <div className="flex items-center justify-center gap-1">
                        <StatusBadge tone="success" label="노출" />
                        {kw.is_integrated_top3 && (
                          <span className="text-[10px] font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded-full" title="통합검색 TOP3 노출">TOP3</span>
                        )}
                      </div>
                    ) : (
                      <StatusBadge tone="danger" label="미노출" />
                    )}
                  </td>

                  {/* 저장 */}
                  <td className={`${cellClass} text-center`} onClick={e => e.stopPropagation()}>
                    <BookmarkButton
                      isSaved={savedSet.has(kw.keyword)}
                      onClick={() => handleToggleSave(kw)}
                    />
                  </td>
                </tr>

                {isExpanded && (
                  <tr>
                    <td colSpan={columns.length} className="px-5 py-3 bg-bg/60">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-4">
                        {/* 챌린지 TOP3 */}
                        <div>
                          <p className="text-[11px] font-bold text-dim mb-1.5">챌린지 TOP 3</p>
                          {isLoadingRank ? (
                            <div className="flex items-center gap-2 py-1">
                              <div className="animate-spin w-4 h-4 border-2 border-text-2 border-t-transparent rounded-full" />
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
                              <div className="animate-spin w-4 h-4 border-2 border-text-2 border-t-transparent rounded-full" />
                              <span className="text-xs text-dim">크롤링 중...</span>
                            </div>
                          ) : exposureCache[kw.keyword_id]?.blog?.length > 0 ? (
                            <div className="space-y-1">
                              {exposureCache[kw.keyword_id].blog.slice(0, 5).map((b, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="font-bold font-rank tabular-nums text-text-2 w-5 text-right">{b.rank}</span>
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
                              <div className="animate-spin w-4 h-4 border-2 border-text-2 border-t-transparent rounded-full" />
                              <span className="text-xs text-dim">크롤링 중...</span>
                            </div>
                          ) : exposureCache[kw.keyword_id]?.view?.length > 0 ? (
                            <div className="space-y-1">
                              {exposureCache[kw.keyword_id].view.slice(0, 5).map((v, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs">
                                  <span className="font-bold font-rank tabular-nums text-text-2 w-5 text-right">{v.rank}</span>
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
              </>
            );
          }}
          renderMobileCard={kw => {
            const comp = compMeta[getCompLevel(kw.participant_count)];
            const dimmed = !kw.is_participated;
            const top3 = top3Map[kw.keyword_id];
            return (
              <div className={`px-4 py-3.5 ${dimmed ? 'opacity-70' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/keywords/${kw.keyword_id}`} className="text-[15px] font-bold truncate block hover:text-accent transition">
                      {kw.keyword}
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-dim">{kw.category}</span>
                      <StatusBadge tone={comp.tone} label={comp.label} />
                      {!kw.is_participated ? (
                        <StatusBadge tone="neutral" label="미참여" />
                      ) : kw.rank_position !== null ? (
                        <StatusBadge tone="success" label="노출" />
                      ) : (
                        <StatusBadge tone="danger" label="미노출" />
                      )}
                      {kw.is_participated && kw.is_integrated_top3 && (
                        <span className="text-[10px] font-bold text-gold bg-gold/15 px-1.5 py-0.5 rounded-full">TOP3</span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-dim tabular-nums">
                      월 검색량 {kw.search_volume > 0 ? formatCount(kw.search_volume) : '—'} · 참여자 {kw.participant_count.toLocaleString()}명
                    </div>
                    {top3 && top3.length > 0 && (
                      <div className="text-[10px] text-dim mt-1 truncate">
                        {top3.map((t, idx) => (
                          <span key={t.naver_id}>
                            <span className={t.rank === 1 ? 'text-gold font-bold' : t.rank === 2 ? 'text-silver font-bold' : 'text-bronze font-bold'}>{t.rank}위</span>
                            <span className="ml-0.5">{t.name}</span>
                            {idx < top3.length - 1 && <span className="mx-1 text-border">·</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {kw.is_participated && kw.rank_position !== null ? (
                      <>
                        <span className={`text-sm font-black font-rank tabular-nums ${kw.rank_position === 1 ? 'text-gold' : kw.rank_position <= 3 ? 'text-accent' : ''}`}>
                          {kw.rank_position}위
                        </span>
                        <span className="text-[11px] font-semibold">
                          {kw.rank_change === 0 ? (
                            <span className="text-dim">유지</span>
                          ) : (
                            <span className={kw.rank_change > 0 ? 'text-up' : 'text-down'}>
                              {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <Dash title={kw.is_participated ? '아직 순위권에 들지 않았습니다' : '챌린지 미참여 — 순위 데이터 없음'} />
                    )}
                    <BookmarkButton
                      isSaved={savedSet.has(kw.keyword)}
                      onClick={() => handleToggleSave(kw)}
                    />
                  </div>
                </div>
              </div>
            );
          }}
        />
      ) : (
        <KeywordSyncButton />
      )}
      </div>
    </DashboardCard>
  );
}
