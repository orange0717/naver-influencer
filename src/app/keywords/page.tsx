'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Keyword } from '@/lib/types';

interface CategoryGroup {
  category: string;
  total: number;
  keywords: Keyword[];
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [grouped, setGrouped] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // 커서 기반 페이지네이션 (카테고리 선택 시)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadedCountRef = useRef(0);

  const fetchData = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });

      if (category !== '전체') {
        params.set('category', category);
        if (cursor) params.set('cursor', cursor);
      } else {
        params.set('page', String(currentPageIndex + 1));
      }

      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/keywords?${params}`);
      const data = await res.json();

      setKeywords(data.keywords || []);
      setGrouped(data.grouped || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      console.error('키워드 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [category, search, currentPageIndex]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const cursor = cursorHistory[currentPageIndex];
      fetchData(cursor);
    }, search ? 500 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, search, currentPageIndex, cursorHistory]);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setCursorHistory([null]);
    setCurrentPageIndex(0);
    setNextCursor(null);
    loadedCountRef.current = 0;
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCursorHistory([null]);
    setCurrentPageIndex(0);
    setNextCursor(null);
    loadedCountRef.current = 0;
  };

  const goNext = () => {
    if (!nextCursor && category !== '전체') return;
    const newPageIndex = currentPageIndex + 1;
    if (cursorHistory.length <= newPageIndex && nextCursor) {
      setCursorHistory(prev => [...prev, nextCursor]);
    }
    setCurrentPageIndex(newPageIndex);
    loadedCountRef.current += keywords.length;
  };

  const goPrev = () => {
    if (currentPageIndex <= 0) return;
    loadedCountRef.current = Math.max(0, loadedCountRef.current - 50);
    setCurrentPageIndex(currentPageIndex - 1);
  };

  const compBadge = (level: string) => {
    if (level === 'low') return <span className="text-xs font-bold text-up bg-up/12 px-2 py-0.5 rounded-full">낮음</span>;
    if (level === 'medium') return <span className="text-xs font-bold text-gold bg-gold/12 px-2 py-0.5 rounded-full">보통</span>;
    return <span className="text-xs font-bold text-down bg-down/12 px-2 py-0.5 rounded-full">높음</span>;
  };

  const startNum = currentPageIndex * 50;
  const hasNext = category !== '전체' ? !!nextCursor : (startNum + keywords.length) < total;
  const isGroupedView = category === '전체' && !search.trim() && grouped.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">키워드 전체 목록</h1>
        <span className="text-xs text-dim font-rank">
          {loading ? '로딩 중...' : `총 ${total.toLocaleString()}개`}
        </span>
      </div>

      <input type="text" placeholder="키워드 검색..." value={search} onChange={e => handleSearchChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors" />

      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button key={cat} onClick={() => handleCategoryChange(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              category === cat ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:border-accent/40'
            }`}>{cat}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-dim">네이버에서 키워드를 가져오는 중...</p>
          </div>
        </div>
      ) : isGroupedView ? (
        /* ─── 전체: 주제별 그룹핑 뷰 (2열) ─── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {grouped.map((group) => (
            <div key={group.category} className="bg-surface rounded-xl border border-border overflow-hidden">
              {/* 카테고리 헤더 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg/50">
                <button
                  onClick={() => handleCategoryChange(group.category)}
                  className="flex items-center gap-2 hover:text-accent transition-colors cursor-pointer"
                >
                  <span className="font-bold text-sm">{group.category}</span>
                  <span className="text-xs text-accent">전체보기 →</span>
                </button>
                <span className="text-xs text-dim font-rank">{group.total.toLocaleString()}개</span>
              </div>

              {/* Desktop: 테이블 */}
              <table className="w-full text-sm hidden md:table">
                <tbody>
                  {group.keywords.map((kw, i) => (
                    <tr key={kw.id} className="border-b border-border/30 last:border-0 hover:bg-surface-hover transition-colors">
                      <td className="py-2.5 px-4 font-bold text-dim font-rank text-xs w-8">{i + 1}</td>
                      <td className="py-2.5 px-4">
                        <Link href={`/keywords/${kw.id}`} className="font-medium hover:text-accent transition-colors">
                          {kw.keyword}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold font-rank text-sm">{kw.participant_count.toLocaleString()}명</td>
                      <td className="py-2.5 px-4 text-center w-20">{compBadge(kw.competition_level)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: 카드 */}
              <div className="md:hidden divide-y divide-border/30">
                {group.keywords.map((kw, i) => (
                  <Link key={kw.id} href={`/keywords/${kw.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-dim font-rank w-5">{i + 1}</span>
                      <span className="font-medium text-sm">{kw.keyword}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-rank text-dim">{kw.participant_count.toLocaleString()}명</span>
                      {compBadge(kw.competition_level)}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── 카테고리 선택 or 검색: 기존 리스트 뷰 ─── */
        <>
          <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs w-8">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">키워드</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">카테고리</th>
                  <th className="text-right py-3 px-4 font-semibold text-dim text-xs">참여자</th>
                  <th className="text-center py-3 px-4 font-semibold text-dim text-xs">경쟁도</th>
                </tr>
              </thead>
              <tbody>
                {keywords.map((kw, i) => (
                  <tr key={kw.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-4 font-bold text-dim font-rank text-xs">{startNum + i + 1}</td>
                    <td className="py-3 px-4">
                      <Link href={`/keywords/${kw.id}`} className="font-bold hover:text-accent transition-colors">
                        {kw.keyword}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-xs text-dim">{kw.category}</td>
                    <td className="py-3 px-4 text-right font-bold font-rank">{kw.participant_count.toLocaleString()}</td>
                    <td className="py-3 px-4 text-center">{compBadge(kw.competition_level)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {keywords.length === 0 && <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>}
          </div>

          <div className="md:hidden space-y-3">
            {keywords.map((kw, i) => (
              <Link key={kw.id} href={`/keywords/${kw.id}`}
                className="block bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-dim font-rank">#{startNum + i + 1}</span>
                    <span className="font-bold text-sm">{kw.keyword}</span>
                  </div>
                  {compBadge(kw.competition_level)}
                </div>
                <div className="flex items-center gap-3 text-xs text-dim">
                  <span>{kw.category}</span>
                  <span>참여자 {kw.participant_count.toLocaleString()}명</span>
                </div>
              </Link>
            ))}
            {keywords.length === 0 && <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>}
          </div>

          {(hasNext || currentPageIndex > 0) && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                disabled={currentPageIndex <= 0}
                onClick={goPrev}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                ← 이전
              </button>
              <span className="text-xs text-dim font-rank">
                {startNum + 1} - {startNum + keywords.length} / {total.toLocaleString()}개
              </span>
              <button
                disabled={!hasNext}
                onClick={goNext}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                다음 →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
