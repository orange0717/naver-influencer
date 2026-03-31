'use client';
import { useState, useEffect, useCallback } from 'react';
import { formatCount } from '@/lib/format';
import CategoryFilter from '@/components/CategoryFilter';

interface InfluencerItem {
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
  foundInKeywords: string[];
  totalKeywords?: number;
  integratedTop3Count?: number;
  naverCreatedAt?: string;
  firstSeenAt?: string;
  lastCrawledAt?: string;
  isInactive?: boolean;
  isStopped?: boolean;
}

type SortKey = 'first_seen_at' | 'subscriber_count' | 'total_keywords' | 'integrated_top3_count' | 'last_crawled_at';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'first_seen_at', label: '선정일순' },
  { key: 'subscriber_count', label: '구독자순' },
  { key: 'total_keywords', label: '챌린지수순' },
  { key: 'integrated_top3_count', label: 'TOP3순' },
  { key: 'last_crawled_at', label: '마지막 참여일순' },
];

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function isNew(d: string | null | undefined): boolean {
  if (!d) return false;
  const diff = Date.now() - new Date(d).getTime();
  return diff < 30 * 24 * 60 * 60 * 1000; // 30일 이내
}

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('first_seen_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        sort: sortBy,
        order,
      });
      if (category !== '전체') params.set('category', category);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/influencers?${params}`);
      const data = await res.json();

      setInfluencers(data.influencers || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error('인플루언서 로드 실패:', err);
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

  // 페이지네이션 번호 생성
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
    if (sortBy !== key) return '';
    return order === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">인플루언서 리스트 <span className="text-sm font-normal text-dim">(구. 파워블로거 2016년도 폐지)</span></h1>
        </div>
        <div className="text-right">
          <span className="text-xs text-dim font-rank">
            {loading ? '수집 중...' : category === '전체' ? `총 ${total.toLocaleString()}명` : `${category} ${total.toLocaleString()}명`}
          </span>
          {!loading && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-green-600 font-bold">LIVE</span>
            </div>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="인플루언서 검색 (이름, 카테고리, 키워드, 유형)..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
      />

      <CategoryFilter categories={categories} selected={category} onChange={handleCategoryChange} size="sm" />

      {/* 정렬 옵션 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-dim font-semibold">정렬</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => handleSortChange(opt.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              sortBy === opt.key
                ? 'bg-accent/20 text-accent border border-accent/40'
                : 'bg-surface border border-border/50 text-dim hover:border-accent/30'
            }`}
          >
            {opt.label}{sortArrow(opt.key)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-dim">인플루언서 데이터를 불러오는 중...</p>
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
                    구독자{sortArrow('subscriber_count')}
                  </th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('total_keywords')}>
                    챌린지{sortArrow('total_keywords')}
                  </th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('integrated_top3_count')}>
                    TOP3{sortArrow('integrated_top3_count')}
                  </th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('first_seen_at')}>
                    선정일{sortArrow('first_seen_at')}
                  </th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('last_crawled_at')}>
                    마지막 참여일{sortArrow('last_crawled_at')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {influencers.map((inf, i) => (
                  <tr key={inf.naverId || inf.name + i} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-4 font-bold text-dim font-rank text-xs">{(page - 1) * 50 + i + 1}</td>
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
                            {inf.isInactive && (
                              <span className="text-[9px] font-medium text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded shrink-0">1년이상 활동이력 없음</span>
                            )}
                            {inf.isStopped && !inf.isInactive && (
                              <span className="text-[9px] font-medium text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded shrink-0">활동 중단</span>
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
                      {formatCount(inf.subscriberCount)}
                    </td>
                    <td className="py-3 px-3 text-center text-xs font-rank">
                      {(inf.totalKeywords || 0) > 0 ? (
                        <span className="font-bold">{inf.totalKeywords}</span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center text-xs font-rank">
                      {(inf.integratedTop3Count || 0) > 0 ? (
                        <span className="font-bold text-gold">{inf.integratedTop3Count}</span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-dim">
                      {inf.naverCreatedAt ? formatDate(inf.naverCreatedAt) : '—'}
                    </td>
                    <td className="py-3 px-3 text-xs text-dim">
                      {formatDate(inf.lastCrawledAt)}
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
                      {inf.isInactive && (
                        <span className="text-[9px] font-medium text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded shrink-0">1년이상 활동이력 없음</span>
                      )}
                      {inf.isStopped && !inf.isInactive && (
                        <span className="text-[9px] font-medium text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded shrink-0">활동 중단</span>
                      )}
                    </div>
                    <span className="text-xs text-dim">@{inf.naverId}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-accent font-rank">{formatCount(inf.subscriberCount)}</div>
                    <div className="text-[10px] text-dim">구독자</div>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="text-xs text-dim truncate">
                    {inf.myKeywordCategory}{inf.categoryMyType ? ` · ${inf.categoryMyType}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-[10px] text-dim">
                  {(inf.totalKeywords || 0) > 0 && <span>챌린지 {inf.totalKeywords}개</span>}
                  {(inf.integratedTop3Count || 0) > 0 && <span className="text-gold font-bold">TOP3 {inf.integratedTop3Count}개</span>}
                  {inf.naverCreatedAt && <span>선정일 {formatDate(inf.naverCreatedAt)}</span>}
                  {inf.lastCrawledAt && <span>마지막 참여일 {formatDate(inf.lastCrawledAt)}</span>}
                </div>
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
