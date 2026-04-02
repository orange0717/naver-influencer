'use client';
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { Keyword } from '@/lib/types';
import { getSubcategory } from '@/data/subcategory-map';
import CategoryFilter from '@/components/CategoryFilter';

interface CategoryGroup {
  category: string;
  total: number;
  keywords: Keyword[];
}

interface RankingInfo {
  influencer_name: string;
  influencer_url: string;
  rank_position: number;
  fan_count: number;
  naver_id: string;
}

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [grouped, setGrouped] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState('전체');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // 정렬 상태
  const [sortKey, setSortKey] = useState<'participant_count' | 'competition_level' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: 'participant_count' | 'competition_level') => {
    if (sortKey === key) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const sortArrow = (key: string) => {
    if (sortKey !== key) return ' ↕';
    return sortOrder === 'desc' ? ' ↓' : ' ↑';
  };

  // TOP3 인라인 표시 (DB 스냅샷 기반)
  const [top3Map, setTop3Map] = useState<Record<string, { rank: number; name: string; naver_id: string }[]>>({});

  // TOP3 펼치기 상태
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rankingsCache, setRankingsCache] = useState<Record<string, RankingInfo[]>>({});
  const [rankingsLoading, setRankingsLoading] = useState<string | null>(null);

  // 키워드 목록 로드 시 배치로 TOP3 가져오기 (keyword name 기반)
  useEffect(() => {
    if (keywords.length === 0) return;
    const names = keywords.slice(0, 20).map(kw => kw.keyword);
    fetch(`/api/keywords/batch-top3?keywords=${encodeURIComponent(names.join(','))}`)
      .then(res => res.json())
      .then(data => {
        if (data.top3) {
          // keyword name -> kw.id 매핑
          const mapped: Record<string, typeof data.top3[string]> = {};
          for (const kw of keywords) {
            if (data.top3[kw.keyword]) {
              mapped[kw.id] = data.top3[kw.keyword];
            }
          }
          setTop3Map(mapped);
        }
      })
      .catch(() => {});
  }, [keywords]);

  const toggleRankings = async (kwId: string) => {
    if (expandedId === kwId) {
      setExpandedId(null);
      return;
    }
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
      // 실패 시 빈 배열
      setRankingsCache(prev => ({ ...prev, [kwId]: [] }));
    } finally {
      setRankingsLoading(null);
    }
  };

  // 커서 기반 페이지네이션 (카테고리 선택 시)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const loadedCountRef = useRef(0);

  const fetchData = useCallback(async (cursor?: string | null, searchQuery?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });

      if (category !== '전체') {
        params.set('category', category);
        // 정렬 모드: DB에서 전체 키워드 조회
        if (sortKey) {
          params.set('sort', sortKey);
          params.set('order', sortOrder);
        } else if (cursor) {
          params.set('cursor', cursor);
        }
      } else {
        params.set('page', String(currentPageIndex + 1));
      }

      if (searchQuery) params.set('search', searchQuery);

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
  }, [category, currentPageIndex, sortKey, sortOrder]);

  // 카테고리/페이지/정렬 변경 시 fetch
  useEffect(() => {
    const cursor = cursorHistory[currentPageIndex];
    fetchData(cursor, sortKey ? undefined : search.trim() || undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, currentPageIndex, sortKey, sortOrder]);

  // 검색어 변경 시 fetch (정렬 모드가 아닐 때만 - 정렬 모드는 클라이언트 필터링)
  useEffect(() => {
    if (sortKey) return;
    const timer = setTimeout(() => {
      const cursor = cursorHistory[currentPageIndex];
      fetchData(cursor, search.trim() || undefined);
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setSubFilter('전체');
    setSearch('');
    setSortKey(null);
    setSortOrder('desc');
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

  // 세부분류 목록 + 필터링
  const subCategories = useMemo(() => {
    const subs = keywords.map(kw => getSubcategory(kw.category, kw.keyword)).filter(Boolean);
    const unique = [...new Set(subs)].sort();
    return ['전체', ...unique];
  }, [keywords]);

  const displayKeywords = useMemo(() => {
    let list = subFilter === '전체' ? [...keywords] : keywords.filter(kw => getSubcategory(kw.category, kw.keyword) === subFilter);
    // 정렬 모드에서 클라이언트 검색 (전체 데이터가 로드되어 있으므로)
    if (sortKey && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(kw => kw.keyword.toLowerCase().includes(q));
    }
    if (sortKey) {
      const compOrder: Record<string, number> = { low: 1, medium: 2, high: 3 };
      list = [...list].sort((a, b) => {
        let diff = 0;
        if (sortKey === 'participant_count') {
          diff = a.participant_count - b.participant_count;
        } else if (sortKey === 'competition_level') {
          diff = (compOrder[a.competition_level] || 0) - (compOrder[b.competition_level] || 0);
        }
        return sortOrder === 'asc' ? diff : -diff;
      });
    }
    return list;
  }, [keywords, subFilter, sortKey, sortOrder, search]);

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

      <CategoryFilter categories={categories} selected={category} onChange={handleCategoryChange} />

      {/* 세부분류 필터 (버튼 + 드롭다운) */}
      {subCategories.length > 2 && (
        <div className="space-y-2">
          {/* 드롭다운 + 개수 */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-dim">세부분류</span>
            <select
              value={subFilter}
              onChange={e => setSubFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-surface border border-border text-text focus:outline-none focus:border-accent transition-colors cursor-pointer appearance-none pr-8"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
            >
              {subCategories.map(sub => (
                <option key={sub} value={sub}>{sub === '전체' ? `전체 (${keywords.length})` : sub}</option>
              ))}
            </select>
            {subFilter !== '전체' && (
              <span className="text-xs text-accent font-rank">{displayKeywords.length}개</span>
            )}
          </div>
          {/* 버튼 바로가기 */}
          <div className="flex flex-wrap gap-2">
            {subCategories.map(sub => (
              <button key={sub} onClick={() => setSubFilter(sub)}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  subFilter === sub
                    ? 'bg-accent/20 text-accent border border-accent/40'
                    : 'bg-surface border border-border/50 text-dim hover:border-accent/30'
                }`}>{sub}</button>
            ))}
          </div>
        </div>
      )}

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
              <table className="w-full hidden md:table">
                <tbody>
                  {group.keywords.map((kw, i) => {
                    const sub = getSubcategory(kw.category, kw.keyword);
                    return (
                    <tr key={kw.id} className="border-b border-border/30 last:border-0 hover:bg-surface-hover transition-colors">
                      <td className="py-3 px-4 font-bold text-dim font-rank text-sm w-8">{i + 1}</td>
                      <td className="py-3 px-4">
                        <Link href={`/keywords/${kw.id}`} className="text-[15px] font-bold hover:text-accent transition-colors">
                          {kw.keyword}
                        </Link>
                      </td>
                      <td className="py-3 px-3 text-sm text-dim">{kw.category}</td>
                      {sub && <td className="py-3 px-2 text-sm text-accent font-semibold">{sub}</td>}
                      <td className="py-3 px-4 text-right font-bold font-rank text-sm">{kw.participant_count.toLocaleString()}명</td>
                      <td className="py-3 px-4 text-center w-20">{compBadge(kw.competition_level)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile: 카드 */}
              <div className="md:hidden divide-y divide-border/30">
                {group.keywords.map((kw, i) => {
                  const sub = getSubcategory(kw.category, kw.keyword);
                  return (
                  <Link key={kw.id} href={`/keywords/${kw.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-dim font-rank w-5">{i + 1}</span>
                      <span className="font-medium text-sm">{kw.keyword}</span>
                      {sub && <span className="text-xs text-accent font-semibold">{sub}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-rank text-dim">{kw.participant_count.toLocaleString()}명</span>
                      {compBadge(kw.competition_level)}
                    </div>
                  </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── 카테고리 선택 or 검색: 기존 리스트 뷰 ─── */
        <>
          <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-3 px-4 font-semibold text-dim text-sm w-8">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-sm">키워드</th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-sm">카테고리</th>
                  <th className="text-left py-3 px-2 font-semibold text-dim text-sm">세부분류</th>
                  <th className="text-right py-3 px-3 font-semibold text-dim text-sm cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort('participant_count')}>
                    참여자{sortArrow('participant_count')}
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-dim text-sm">월 검색량</th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-sm">등록일</th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-sm cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort('competition_level')}>
                    경쟁도{sortArrow('competition_level')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayKeywords.map((kw, i) => {
                  const sub = getSubcategory(kw.category, kw.keyword);
                  const isExpanded = expandedId === kw.id;
                  const rankings = rankingsCache[kw.id];
                  const isLoadingRank = rankingsLoading === kw.id;
                  return (
                  <Fragment key={kw.id}>
                  <tr
                    className={`border-b border-border/50 hover:bg-surface-hover transition-colors cursor-pointer ${isExpanded ? 'bg-accent/5' : ''}`}
                    onClick={() => toggleRankings(kw.id)}
                  >
                    <td className="py-3.5 px-4 font-bold text-dim font-rank text-sm">{startNum + i + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/keywords/${kw.id}`} className="text-[15px] font-bold hover:text-accent transition-colors shrink-0" onClick={e => e.stopPropagation()}>
                          {kw.keyword}
                        </Link>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-dim transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                        {top3Map[kw.id] && top3Map[kw.id].length > 0 && (
                          <span className="text-[11px] text-dim truncate">
                            {top3Map[kw.id].map((t, idx) => (
                              <span key={t.naver_id}>
                                <span className={t.rank === 1 ? 'text-gold font-bold' : t.rank === 2 ? 'text-silver font-bold' : 'text-bronze font-bold'}>{t.rank}</span>
                                <span className="ml-0.5">{t.name}</span>
                                {idx < top3Map[kw.id].length - 1 && <span className="mx-1 text-border">|</span>}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-sm text-dim">{kw.category}</td>
                    <td className="py-3.5 px-2 text-sm text-accent font-semibold">{sub || '—'}</td>
                    <td className="py-3.5 px-3 text-right font-bold font-rank text-sm">{kw.participant_count.toLocaleString()}</td>
                    <td className="py-3.5 px-3 text-right font-rank text-sm">
                      {kw.search_volume_monthly > 0 ? kw.search_volume_monthly.toLocaleString() : <span className="text-dim">—</span>}
                    </td>
                    <td className="py-3.5 px-3 text-sm text-dim">
                      {kw.first_seen_at ? new Date(kw.first_seen_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '—'}
                    </td>
                    <td className="py-3.5 px-3 text-center">{compBadge(kw.competition_level)}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="px-4 py-3 bg-bg/60 border-b border-border/50">
                        {isLoadingRank ? (
                          <div className="flex items-center gap-2 py-2 pl-8">
                            <div className="animate-spin w-4 h-4 border-2 border-accent border-t-transparent rounded-full" />
                            <span className="text-xs text-dim">순위 불러오는 중...</span>
                          </div>
                        ) : rankings && rankings.length > 0 ? (
                          <div className="pl-8 space-y-1.5">
                            <p className="text-xs font-bold text-dim mb-2">실시간 TOP 3</p>
                            {rankings.map(r => (
                              <div key={r.rank_position} className="flex items-center gap-3">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                  r.rank_position === 1 ? 'bg-gold' : r.rank_position === 2 ? 'bg-silver' : 'bg-bronze'
                                }`}>{r.rank_position}</span>
                                <Link
                                  href={`/influencers/${encodeURIComponent(r.naver_id)}`}
                                  className="text-sm font-semibold hover:text-accent transition-colors"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {r.influencer_name}
                                </Link>
                                {r.fan_count > 0 && (
                                  <span className="text-xs text-dim font-rank">
                                    팬 {r.fan_count >= 10000 ? `${(r.fan_count / 10000).toFixed(1)}만` : r.fan_count.toLocaleString()}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="pl-8 py-2 text-xs text-dim">순위 정보가 없습니다</div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
            {displayKeywords.length === 0 && <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>}
          </div>

          <div className="md:hidden space-y-3">
            {displayKeywords.map((kw, i) => {
              const sub = getSubcategory(kw.category, kw.keyword);
              return (
              <Link key={kw.id} href={`/keywords/${kw.id}`}
                className="block bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-bold text-dim font-rank shrink-0">#{startNum + i + 1}</span>
                    <span className="font-bold text-[15px] truncate">{kw.keyword}</span>
                    <span className="text-dim text-sm shrink-0">{kw.category}</span>
                    {sub && <span className="text-sm text-accent font-semibold shrink-0">{sub}</span>}
                  </div>
                  {compBadge(kw.competition_level)}
                </div>
                <div className="flex items-center gap-3 text-sm text-dim">
                  <span>참여자 {kw.participant_count.toLocaleString()}명</span>
                  {kw.search_volume_monthly > 0 && <span>월 {kw.search_volume_monthly.toLocaleString()}회</span>}
                </div>
              </Link>
              );
            })}
            {displayKeywords.length === 0 && <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>}
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
