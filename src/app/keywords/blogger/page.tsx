'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

interface KeywordResult {
  keyword: string;
  monthlyPc: number | string;
  monthlyMobile: number | string;
  monthlyTotal: number | string;
  competition: string;
}

interface SavedKeyword {
  id: string;
  keyword: string;
  monthly_pc: number;
  monthly_mobile: number;
  monthly_total: number;
  competition: string;
  created_at: string;
}

export default function BloggerKeywordsPage() {
  const [query, setQuery] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [results, setResults] = useState<KeywordResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [sortKey, setSortKey] = useState<'monthlyTotal' | 'monthlyPc' | 'monthlyMobile' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const inputRef = useRef<HTMLInputElement>(null);

  // 저장 관련 상태
  const [savedKeywords, setSavedKeywords] = useState<SavedKeyword[]>([]);
  const [savedSet, setSavedSet] = useState<Set<string>>(new Set());
  const [savingKeyword, setSavingKeyword] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [showSaved, setShowSaved] = useState(true);

  // 로그인 상태 확인 + 저장된 키워드 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (data.type && data.id) {
          setIsLoggedIn(true);
          loadSavedKeywords();
        } else {
          setIsLoggedIn(false);
        }
      } catch {
        setIsLoggedIn(false);
      }
    })();
  }, []);

  const loadSavedKeywords = async () => {
    try {
      const res = await fetch('/api/my/saved-keywords');
      if (!res.ok) return;
      const data = await res.json();
      const kws = data.keywords || [];
      setSavedKeywords(kws);
      setSavedSet(new Set(kws.map((k: SavedKeyword) => k.keyword)));
    } catch { /* ignore */ }
  };

  const toggleSave = async (kw: KeywordResult) => {
    if (!isLoggedIn) {
      alert('로그인이 필요합니다.');
      return;
    }
    const keyword = kw.keyword;
    setSavingKeyword(keyword);
    try {
      if (savedSet.has(keyword)) {
        // 삭제
        const res = await fetch(`/api/my/saved-keywords?keyword=${encodeURIComponent(keyword)}`, { method: 'DELETE' });
        if (res.ok) {
          setSavedSet(prev => { const next = new Set(prev); next.delete(keyword); return next; });
          setSavedKeywords(prev => prev.filter(k => k.keyword !== keyword));
        }
      } else {
        // 저장
        const res = await fetch('/api/my/saved-keywords', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword,
            monthly_pc: typeof kw.monthlyPc === 'number' ? kw.monthlyPc : 0,
            monthly_mobile: typeof kw.monthlyMobile === 'number' ? kw.monthlyMobile : 0,
            monthly_total: typeof kw.monthlyTotal === 'number' ? kw.monthlyTotal : 0,
            competition: kw.competition,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSavedSet(prev => new Set(prev).add(keyword));
          setSavedKeywords(prev => [data.saved, ...prev]);
        } else {
          const data = await res.json();
          alert(data.error || '저장에 실패했습니다.');
        }
      }
    } catch {
      alert('요청에 실패했습니다.');
    } finally {
      setSavingKeyword(null);
    }
  };

  const removeSaved = async (keyword: string) => {
    setSavingKeyword(keyword);
    try {
      const res = await fetch(`/api/my/saved-keywords?keyword=${encodeURIComponent(keyword)}`, { method: 'DELETE' });
      if (res.ok) {
        setSavedSet(prev => { const next = new Set(prev); next.delete(keyword); return next; });
        setSavedKeywords(prev => prev.filter(k => k.keyword !== keyword));
      }
    } catch { /* ignore */ }
    finally { setSavingKeyword(null); }
  };

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setSortKey(null);
    try {
      const res = await fetch(`/api/search-volume?keyword=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '검색에 실패했습니다.');
      const all = data.keywords || [];
      setTotalCount(all.length);
      setResults(all.slice(0, 100));
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색에 실패했습니다.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      search();
    }
  };

  const handleSort = (key: typeof sortKey & string) => {
    if (sortKey === key) {
      if (sortOrder === 'desc') setSortOrder('asc');
      else { setSortKey(null); }
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const sortArrow = (key: string) => {
    if (sortKey !== key) return ' \u2195';
    return sortOrder === 'desc' ? ' \u2193' : ' \u2191';
  };

  const toNum = (v: number | string): number => typeof v === 'number' ? v : 0;

  const sorted = sortKey ? [...results].sort((a, b) => {
    let diff = 0;
    if (sortKey === 'monthlyTotal') diff = toNum(a.monthlyTotal) - toNum(b.monthlyTotal);
    else if (sortKey === 'monthlyPc') diff = toNum(a.monthlyPc) - toNum(b.monthlyPc);
    else if (sortKey === 'monthlyMobile') diff = toNum(a.monthlyMobile) - toNum(b.monthlyMobile);
    return sortOrder === 'asc' ? diff : -diff;
  }) : results;

  const formatNum = (v: number | string) => {
    if (typeof v === 'string') return v;
    return v.toLocaleString();
  };

  const BookmarkIcon = ({ filled, spinning }: { filled: boolean; spinning?: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2"
      className={`shrink-0 ${filled ? 'text-accent' : 'text-dim'} ${spinning ? 'animate-pulse' : ''}`}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-extrabold">키워드 검색</h1>
        <p className="text-xs text-dim">네이버 검색 키워드의 검색량을 분석합니다</p>
      </div>

      {/* 검색창 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dim pointer-events-none">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="분석할 키워드를 입력하세요 (예: 맛집, 다이어트, 여행)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-11 pr-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <button
          onClick={search}
          disabled={loading || !query.trim()}
          className="shrink-0 px-6 py-2.5 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
        >
          {loading ? '분석 중...' : '검색'}
        </button>
      </div>

      {/* 저장된 키워드 */}
      {isLoggedIn && savedKeywords.length > 0 && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <BookmarkIcon filled />
              <span className="text-sm font-bold">저장된 키워드</span>
              <span className="text-xs text-accent font-rank">{savedKeywords.length}</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`text-dim transition-transform ${showSaved ? 'rotate-180' : ''}`}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {showSaved && (
            <div className="border-t border-border">
              {/* Desktop */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="border-b border-border/50 bg-bg/30">
                    <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">키워드</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs">월간 검색량</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs">PC</th>
                    <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs">모바일</th>
                    <th className="text-center py-2.5 px-3 font-semibold text-dim text-xs w-16">저장일</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {savedKeywords.map(sk => (
                    <tr key={sk.id} className="border-b border-border/30 hover:bg-surface-hover transition-colors">
                      <td className="py-2.5 px-4 text-sm font-bold">{sk.keyword}</td>
                      <td className="py-2.5 px-3 text-right font-rank text-sm font-bold">{sk.monthly_total.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-rank text-sm">{sk.monthly_pc.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right font-rank text-sm">{sk.monthly_mobile.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-center text-xs text-dim">
                        {new Date(sk.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-2.5 px-2">
                        <button
                          onClick={() => removeSaved(sk.keyword)}
                          disabled={savingKeyword === sk.keyword}
                          className="p-1 hover:bg-down/10 rounded transition-colors cursor-pointer disabled:opacity-40"
                          title="삭제"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim hover:text-down">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-border/30">
                {savedKeywords.map(sk => (
                  <div key={sk.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold truncate">{sk.keyword}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-dim">
                        <span>월 {sk.monthly_total.toLocaleString()}</span>
                        <span>PC {sk.monthly_pc.toLocaleString()}</span>
                        <span>모바일 {sk.monthly_mobile.toLocaleString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeSaved(sk.keyword)}
                      disabled={savingKeyword === sk.keyword}
                      className="shrink-0 ml-2 p-1.5 hover:bg-down/10 rounded transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="text-center">
            <div className="animate-spin w-7 h-7 border-2 border-accent border-t-transparent rounded-full mx-auto mb-2.5" />
            <p className="text-xs text-dim">네이버 검색광고 API에서 데이터를 가져오는 중...</p>
          </div>
        </div>
      )}

      {/* 결과 */}
      {!loading && searched && results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">
              검색 결과 <span className="text-accent font-rank">{totalCount.toLocaleString()}</span>개{totalCount > 100 && <span className="text-dim"> (상위 100개 표시)</span>}
            </span>
            <span className="text-xs text-dim">네이버 검색광고 API 기준</span>
          </div>

          {/* Desktop 테이블 */}
          <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs w-8">#</th>
                  <th className="text-left py-2.5 px-4 font-semibold text-dim text-xs">키워드</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort('monthlyTotal')}>
                    월간 검색량{sortArrow('monthlyTotal')}
                  </th>
                  <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort('monthlyPc')}>
                    PC{sortArrow('monthlyPc')}
                  </th>
                  <th className="text-right py-2.5 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSort('monthlyMobile')}>
                    모바일{sortArrow('monthlyMobile')}
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((kw, i) => (
                  <tr key={kw.keyword} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-2.5 px-4 font-bold text-dim font-rank text-sm">{i + 1}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[15px] font-bold ${i === 0 ? 'text-accent' : ''}`}>{kw.keyword}</span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold font-rank text-sm">{formatNum(kw.monthlyTotal)}</td>
                    <td className="py-2.5 px-3 text-right font-rank text-sm">{formatNum(kw.monthlyPc)}</td>
                    <td className="py-2.5 px-3 text-right font-rank text-sm">{formatNum(kw.monthlyMobile)}</td>
                    <td className="py-2.5 px-2">
                      <button
                        onClick={() => toggleSave(kw)}
                        disabled={savingKeyword === kw.keyword}
                        className="p-1.5 rounded hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-40"
                        title={savedSet.has(kw.keyword) ? '저장 취소' : '키워드 저장'}
                      >
                        <BookmarkIcon filled={savedSet.has(kw.keyword)} spinning={savingKeyword === kw.keyword} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile 카드 */}
          <div className="md:hidden space-y-3">
            {sorted.map((kw, i) => (
              <div key={kw.keyword} className="bg-surface rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-bold text-dim font-rank shrink-0">#{i + 1}</span>
                    <span className={`font-bold text-[15px] truncate ${i === 0 ? 'text-accent' : ''}`}>{kw.keyword}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => toggleSave(kw)}
                      disabled={savingKeyword === kw.keyword}
                      className="p-1 rounded hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      <BookmarkIcon filled={savedSet.has(kw.keyword)} spinning={savingKeyword === kw.keyword} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-dim">
                  <span>월 {formatNum(kw.monthlyTotal)}회</span>
                  <span>PC {formatNum(kw.monthlyPc)}</span>
                  <span>모바일 {formatNum(kw.monthlyMobile)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 결과 없음 */}
      {!loading && searched && results.length === 0 && !error && (
        <div className="text-center py-10 bg-surface border border-border rounded-2xl">
          <p className="text-sm text-dim">검색 결과가 없습니다.</p>
          <p className="text-xs text-dim/60 mt-1">다른 키워드로 시도해보세요.</p>
        </div>
      )}

      {/* 초기 상태 — 저장된 키워드가 없을 때만 안내 카드 노출 (저장된 키워드가 있으면 자동 노출되어 빈 공간 최소화) */}
      {!loading && !searched && (!isLoggedIn || savedKeywords.length === 0) && (
        <div className="text-center py-10 bg-surface border border-border rounded-2xl">
          <div className="w-12 h-12 mx-auto rounded-xl bg-accent/10 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <p className="text-base font-bold text-text mb-1.5">키워드를 검색해보세요</p>
          <p className="text-xs text-dim leading-relaxed">
            키워드를 입력하면 월간 검색량과 PC/모바일 검색 비율을 분석합니다.
          </p>
          <p className="text-[11px] text-dim/60 mt-3">무료 기능</p>
        </div>
      )}
    </div>
  );
}
