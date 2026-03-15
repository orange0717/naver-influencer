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

const ITEMS_PER_PAGE = 10;

function CategoryKeywordGroup({ category, keywords }: { category: string; keywords: KeywordItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayList = expanded ? keywords : keywords.slice(0, ITEMS_PER_PAGE);
  const hasMore = keywords.length > ITEMS_PER_PAGE;

  return (
    <GlassCard padding="none">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-bg/30">
        <span className="text-sm font-bold">{category}</span>
        <span className="text-xs text-dim font-rank">{keywords.length}개</span>
      </div>
      <div className="divide-y divide-border/20">
        {displayList.map(kw => (
          <Link key={kw.keyword_id} href={`/keywords/${kw.keyword_id}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-surface-hover transition">
            <div className="min-w-0">
              <span className="text-sm truncate block">{kw.keyword}</span>
              <span className="text-xs text-dim">
                {kw.participant_count}명 참여
                {kw.search_volume > 0 ? ` · 월 ${formatCount(kw.search_volume)}회` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {kw.rank_change !== 0 && (
                <span className={`text-xs font-bold ${kw.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                  {kw.rank_change > 0 ? '▲' : '▼'}{Math.abs(kw.rank_change)}
                </span>
              )}
              {kw.rank_position !== null ? (
                <>
                  <span className="text-[10px] font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">노출</span>
                  <span className={`text-xs font-black font-rank px-2 py-0.5 rounded ${
                    kw.rank_position <= 3 ? 'bg-accent/15 text-accent' : 'bg-border/30 text-dim'
                  }`}>
                    {kw.rank_position}위
                  </span>
                </>
              ) : (
                <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">미노출</span>
              )}
            </div>
          </Link>
        ))}
      </div>
      {hasMore && (
        <div className="px-5 py-3 border-t border-border/50 text-center">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-semibold text-accent hover:text-accent-hover transition"
          >
            {expanded ? '접기' : `더 보기 (${keywords.length - ITEMS_PER_PAGE}개 더)`}
          </button>
        </div>
      )}
    </GlassCard>
  );
}

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

  // 카테고리 목록
  const categories = useMemo(() => {
    return ['전체', ...categoryGroups.map(g => g.category)];
  }, [categoryGroups]);

  // 전체 키워드 flat 리스트
  const allKeywords = useMemo(() => {
    return categoryGroups.flatMap(g => g.keywords);
  }, [categoryGroups]);

  // 필터링된 키워드
  const filteredKeywords = useMemo(() => {
    let list = allKeywords;

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

    // 검색 필터
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(kw => kw.keyword.toLowerCase().includes(q));
    }

    return list;
  }, [allKeywords, selectedCategory, rankFilter, search]);

  // 필터된 결과를 카테고리별로 재그룹핑
  const filteredGroups = useMemo(() => {
    if (selectedCategory !== '전체') {
      // 단일 카테고리 → 그룹핑 없이 flat
      return [{ category: selectedCategory, keywords: filteredKeywords }];
    }
    const map = new Map<string, KeywordItem[]>();
    for (const kw of filteredKeywords) {
      const cat = kw.category || '기타';
      const arr = map.get(cat) || [];
      arr.push(kw);
      map.set(cat, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .map(([category, keywords]) => ({ category, keywords }));
  }, [filteredKeywords, selectedCategory]);

  const rankedCount = allKeywords.filter(kw => kw.rank_position !== null).length;
  const unrankedCount = allKeywords.filter(kw => kw.rank_position === null).length;

  return (
    <div className="space-y-4">
      {/* 헤더 + 필터 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[15px]">내 키워드 리스트</h3>
          <span className="text-xs text-dim">
            {filteredKeywords.length !== totalKeywords
              ? `${filteredKeywords.length} / ${totalKeywords}개`
              : `${categories.length - 1}개 주제 · ${totalKeywords}개 키워드`}
          </span>
        </div>

        {totalKeywords > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            {/* 검색 */}
            <input
              type="text"
              placeholder="키워드 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
            />
            {/* 카테고리 드롭다운 */}
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text focus:outline-none focus:border-accent transition-colors shrink-0"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === '전체' ? `전체 (${totalKeywords})` : `${cat} (${categoryGroups.find(g => g.category === cat)?.keywords.length || 0})`}
                </option>
              ))}
            </select>
            {/* 노출 필터 */}
            <select
              value={rankFilter}
              onChange={e => setRankFilter(e.target.value as 'all' | 'ranked' | 'unranked')}
              className="px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-text focus:outline-none focus:border-accent transition-colors shrink-0"
            >
              <option value="all">전체 상태</option>
              <option value="ranked">노출 ({rankedCount})</option>
              <option value="unranked">미노출 ({unrankedCount})</option>
            </select>
          </div>
        )}
      </div>

      {/* 키워드 리스트 */}
      {filteredGroups.length > 0 ? (
        filteredGroups.map(({ category, keywords }) => (
          <CategoryKeywordGroup key={category} category={category} keywords={keywords} />
        ))
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
