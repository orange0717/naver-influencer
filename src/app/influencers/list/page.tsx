'use client';
import { useState, useEffect, useCallback } from 'react';
import { formatCount } from '@/lib/format';
import CategoryFilter from '@/components/CategoryFilter';

interface InfluencerListItem {
  name: string;
  naverId: string;
  profileUrl: string;
  imageUrl: string;
  introduction: string;
  subscriberCount: number;
  totalFollowerCount: number;
  myKeywordCategory: string;
  myKeyword: string;
  categoryMyType: string;
  naverCreatedAt?: string;
  firstSeenAt?: string;
}

type SortKey = 'first_seen_at' | 'subscriber_count';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'first_seen_at', label: '선정일' },
  { key: 'subscriber_count', label: '팬수' },
];

// 네이버 선정일 전용: 네이버는 UTC 기준 날짜로 선정일을 표기하므로 UTC 기준으로 출력
function formatNaverDate(d: string | null | undefined): string {
  if (!d) return '—';
  const isDateOnly = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const date = isDateOnly ? new Date(`${d}T12:00:00Z`) : new Date(d);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function isNew(d: string | null | undefined): boolean {
  if (!d) return false;
  const diff = Date.now() - new Date(d).getTime();
  return diff < 30 * 24 * 60 * 60 * 1000; // 30일 이내
}

export default function InfluencersListPage() {
  const [influencers, setInfluencers] = useState<InfluencerListItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('first_seen_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        sort: sortBy,
        order,
      });
      if (category !== '전체') params.set('category', category);
      if (search.trim()) params.set('search', search.trim());
      params.set('_ts', String(Date.now()));

      const res = await fetch(`/api/influencers/list?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
      const data = await res.json();

      setInfluencers(data.influencers || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error('인플루언서 명단 로드 실패:', err);
      setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, category, search, sortBy, order]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, search ? 500 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, search]);

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setSearch('');
    setSortBy('first_seen_at');
    setOrder('desc');
    setPage(1);
  };

  const handleSortChange = (key: SortKey) => {
    if (sortBy === key) {
      setOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setOrder('desc');
    }
    setPage(1);
  };

  const getPageNumbers = () => {
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const sortArrow = (key: SortKey) => {
    if (sortBy !== key) return ' ↕';
    return order === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('전체');
                setSortBy('first_seen_at');
                setOrder('desc');
                setPage(1);
              }}
              className="hover:text-accent transition-colors cursor-pointer"
            >
              인플루언서 명단
            </button>
            <span className="text-sm font-normal text-dim"> (무료)</span>
          </h1>
        </div>
        <div className="text-right">
          <span className="text-xs text-dim font-rank">
            {loading ? '수집 중...' : `${total.toLocaleString()}명`}
          </span>
        </div>
      </div>

      <input
        type="text"
        placeholder="인플루언서 검색 (이름, 카테고리, 키워드, 유형)..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
      />

      <CategoryFilter
        categories={categories}
        selected={category}
        onChange={handleCategoryChange}
        size="sm"
      />

      <div className="flex flex-nowrap md:flex-wrap items-center gap-2 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0 -mx-1 px-1">
        <span className="text-xs text-dim font-semibold shrink-0">정렬</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => handleSortChange(opt.key)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              sortBy === opt.key
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-surface border border-border/50 text-dim hover:border-accent/30'
            }`}
          >
            {opt.label}{sortArrow(opt.key)}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-dim -mt-1 mb-2 px-0.5 leading-relaxed">
        이름·프로필·팬수·활동 분야·선정일만 담은 순수 명단입니다. 챌린지 참여 수·TOP3 실적·N인플 순위는{' '}
        <a href="/subscribe?highlight=influencer" className="text-accent font-semibold hover:underline">인플루언서 플랜</a>에서 확인할 수 있어요.
      </p>

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
          <button onClick={() => fetchData()} className="mt-2 text-xs text-accent hover:underline cursor-pointer">다시 시도</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-dim">인플루언서 명단을 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="bg-surface rounded-xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs w-8">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">인플루언서</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-xs">활동 분야</th>
                  <th className="text-right py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('subscriber_count')}>
                    팬수{sortArrow('subscriber_count')}
                  </th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('first_seen_at')}>
                    선정일{sortArrow('first_seen_at')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {influencers.map((inf, i) => (
                  <tr key={inf.naverId || inf.name + i} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-4 font-bold font-rank text-xs">
                      <span className="text-dim">{(page - 1) * 50 + i + 1}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        {inf.imageUrl ? (
                          <img src={inf.imageUrl} alt={inf.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-xs shrink-0">
                            {inf.name.charAt(0)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <a href={inf.profileUrl} target="_blank" rel="noopener noreferrer"
                              className="font-bold hover:text-accent transition-colors truncate max-w-[180px]">
                              {inf.name}
                            </a>
                            {isNew(inf.firstSeenAt) && (
                              <span className="text-[9px] font-bold text-white bg-accent px-1.5 py-0.5 rounded shrink-0">NEW</span>
                            )}
                          </div>
                          <span className="text-xs text-dim">@{inf.naverId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs">
                        <span className="font-semibold text-text">{inf.myKeywordCategory || '-'}</span>
                        {inf.categoryMyType && (
                          <span className="text-dim ml-1">· {inf.categoryMyType}</span>
                        )}
                      </div>
                      {inf.myKeyword && (
                        <div className="text-[10px] text-dim mt-0.5">{inf.myKeyword}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right text-xs font-bold font-rank text-accent">
                      {formatCount(inf.subscriberCount || inf.totalFollowerCount)}
                    </td>
                    <td className="py-3 px-3 text-xs text-dim">
                      {inf.naverCreatedAt ? formatNaverDate(inf.naverCreatedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {influencers.length === 0 && (
              <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {influencers.map((inf, i) => (
              <div key={inf.naverId || inf.name + i}
                className="bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition">
                <div className="flex items-center gap-3 mb-2">
                  {inf.imageUrl ? (
                    <img src={inf.imageUrl} alt={inf.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                      {inf.name.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <a href={inf.profileUrl} target="_blank" rel="noopener noreferrer"
                        className="font-bold text-sm hover:text-accent transition-colors truncate">
                        {inf.name}
                      </a>
                      {isNew(inf.firstSeenAt) && (
                        <span className="text-[9px] font-bold text-white bg-accent px-1.5 py-0.5 rounded shrink-0">NEW</span>
                      )}
                    </div>
                    <span className="text-xs text-dim">@{inf.naverId}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-accent font-rank">{formatCount(inf.subscriberCount || inf.totalFollowerCount)}</div>
                    <div className="text-[10px] text-dim">팬수</div>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="text-xs text-dim truncate">
                    {inf.myKeywordCategory}{inf.categoryMyType ? ` · ${inf.categoryMyType}` : ''}
                  </div>
                </div>
                {inf.naverCreatedAt && (
                  <div className="text-[10px] text-dim">선정일 {formatNaverDate(inf.naverCreatedAt)}</div>
                )}
              </div>
            ))}
            {influencers.length === 0 && (
              <div className="text-center py-12 text-dim text-sm">검색 결과가 없습니다.</div>
            )}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-4 flex-wrap">
              <button
                disabled={page <= 1}
                onClick={() => setPage(1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                title="첫 페이지">
                ≪
              </button>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                이전
              </button>
              {getPageNumbers().map((p, idx) =>
                p === '...' ? (
                  <span key={`dots-${idx}`} className="px-2 py-1.5 text-xs text-dim">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      page === p
                        ? 'bg-accent text-white'
                        : 'bg-surface border border-border text-dim hover:border-accent/40'
                    }`}>
                    {p}
                  </button>
                ),
              )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default">
                다음
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                title="마지막 페이지">
                ≫
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
