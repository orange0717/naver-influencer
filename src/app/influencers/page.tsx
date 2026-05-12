'use client';
import { useState, useEffect, useCallback } from 'react';
import { formatCount } from '@/lib/format';
import CategoryFilter from '@/components/CategoryFilter';
import { LastChallengeParticipationCell } from '@/components/LastChallengeParticipationCell';

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
  top1Count?: number;
  top2Count?: number;
  top3Count?: number;
  naverCreatedAt?: string;
  firstSeenAt?: string;
  lastCrawledAt?: string;
  lastChallengedAt?: string;
  isInactive?: boolean;
  isStopped?: boolean;
  isMember?: boolean;
}

type SortKey = 'first_seen_at' | 'subscriber_count' | 'total_keywords' | 'integrated_top3_count' | 'top3_ratio' | 'top1_count' | 'top2_count' | 'top3_count' | 'last_crawled_at' | 'last_challenged_at' | 'keyword_score';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'first_seen_at', label: '선정일' },
  { key: 'subscriber_count', label: '팬수' },
  { key: 'total_keywords', label: '챌린지수' },
  { key: 'top3_ratio', label: '비율' },
  { key: 'integrated_top3_count', label: 'TOP3' },
  { key: 'last_challenged_at', label: '챌린지 참여' },
  { key: 'last_crawled_at', label: '순위 수집' },
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

export default function InfluencersPage() {
  const [influencers, setInfluencers] = useState<InfluencerItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
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

      const res = await fetch(`/api/influencers?${params}`);
      if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
      const data = await res.json();

      setInfluencers(data.influencers || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setActiveTotal(data.activeTotal || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      console.error('인플루언서 로드 실패:', err);
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
              인플루언서 리스트
            </button>
            <span className="text-sm font-normal text-dim"> (구. 파워블로거 2016년도 폐지)</span>
          </h1>
        </div>
        <div className="text-right">
          <span className="text-xs text-dim font-rank">
            {loading ? '수집 중...' : category === '전체'
              ? <><span className="text-accent font-bold">{activeTotal.toLocaleString()}</span> / {total.toLocaleString()}명</>
              : `${category} ${total.toLocaleString()}명`}
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

      <CategoryFilter
        categories={categories}
        selected={category}
        onChange={handleCategoryChange}
        size="sm"
      />

      {/* 정렬 옵션 (모바일은 가로 스크롤, 데스크톱은 wrap) */}
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
        챌린지 수·TOP3·비율은 네이버 챌린지 순위를 수집한 뒤에 채워집니다. 팬수만 있고 앞 열이 0이면 순위 수집 대기이거나 참여 이력이 없을 수 있습니다. 마지막 열은 참여일이 없을 때 &quot;수집 + 날짜&quot;로 DB 갱신 시각만 표시됩니다.
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
                    팬수{sortArrow('subscriber_count')}
                  </th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('total_keywords')}>
                    챌린지{sortArrow('total_keywords')}
                  </th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('integrated_top3_count')}>
                    TOP3{sortArrow('integrated_top3_count')}
                  </th>
                  <th className="text-center py-3 px-2 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('top3_ratio')}>
                    비율{sortArrow('top3_ratio')}
                  </th>
                  <th className="text-center py-3 px-2 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('top1_count')}>
                    1위{sortArrow('top1_count')}
                  </th>
                  <th className="text-center py-3 px-2 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('top2_count')}>
                    2위{sortArrow('top2_count')}
                  </th>
                  <th className="text-center py-3 px-2 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('top3_count')}>
                    3위{sortArrow('top3_count')}
                  </th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('first_seen_at')}>
                    선정일{sortArrow('first_seen_at')}
                  </th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-xs cursor-pointer hover:text-accent transition-colors" onClick={() => handleSortChange('last_challenged_at')}>
                    마지막 챌린지 참여{sortArrow('last_challenged_at')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {influencers.map((inf, i) => (
                  <tr key={inf.naverId || inf.name + i} className={`border-b border-border/50 hover:bg-surface-hover transition-colors ${inf.isStopped || inf.isInactive ? 'opacity-50 bg-gray-50' : ''}`}>
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
                      {formatCount(inf.subscriberCount || inf.totalFollowerCount)}
                    </td>
                    <td className="py-3 px-3 text-center text-xs font-rank">
                      <span className={(inf.totalKeywords || 0) > 0 ? 'font-bold' : 'text-dim'}>{inf.totalKeywords || 0}</span>
                    </td>
                    <td className="py-3 px-3 text-center text-xs font-rank">
                      <span className={(inf.integratedTop3Count || 0) > 0 ? 'font-bold text-gold' : 'text-dim'}>{inf.integratedTop3Count || 0}</span>
                    </td>
                    <td className="py-3 px-2 text-center text-xs font-rank">
                      {(() => {
                        const t3 = inf.integratedTop3Count || 0;
                        const total = inf.totalKeywords || 0;
                        if (t3 > 0 && total > 0) {
                          const ratio = t3 / total;
                          return (
                            <span className={`font-bold ${ratio >= 0.5 ? 'text-gold' : ratio >= 0.3 ? 'text-up' : 'text-dim'}`}>
                              {(ratio * 100).toFixed(1)}%
                            </span>
                          );
                        }
                        return <span className="text-dim">—</span>;
                      })()}
                    </td>
                    <td className="py-3 px-2 text-center text-xs font-rank">
                      <span className={(inf.top1Count || 0) > 0 ? 'font-bold text-red-500' : 'text-dim'}>{inf.top1Count || 0}</span>
                    </td>
                    <td className="py-3 px-2 text-center text-xs font-rank">
                      <span className={(inf.top2Count || 0) > 0 ? 'font-bold text-blue-500' : 'text-dim'}>{inf.top2Count || 0}</span>
                    </td>
                    <td className="py-3 px-2 text-center text-xs font-rank">
                      <span className={(inf.top3Count || 0) > 0 ? 'font-bold text-green-600' : 'text-dim'}>{inf.top3Count || 0}</span>
                    </td>
                    <td className="py-3 px-3 text-xs text-dim">
                      {inf.naverCreatedAt ? formatNaverDate(inf.naverCreatedAt) : '—'}
                    </td>
                    <td className="py-3 px-3 text-xs text-dim">
                      <LastChallengeParticipationCell inf={inf} />
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
                className={`bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition ${inf.isStopped || inf.isInactive ? 'opacity-50' : ''}`}>
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
                    <div className="text-xs font-bold text-accent font-rank">{formatCount(inf.subscriberCount || inf.totalFollowerCount)}</div>
                    <div className="text-[10px] text-dim">팬수</div>
                  </div>
                </div>
                <div className="mb-2">
                  <div className="text-xs text-dim truncate">
                    {inf.myKeywordCategory}{inf.categoryMyType ? ` · ${inf.categoryMyType}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-[10px] text-dim">
                  <span>챌린지 {inf.totalKeywords || 0}개</span>
                  {(inf.integratedTop3Count || 0) > 0 && <span className="text-gold font-bold">TOP3 {inf.integratedTop3Count}개</span>}
                  {(inf.top1Count || 0) > 0 && <span className="text-red-500 font-bold">1위 {inf.top1Count}</span>}
                  {(inf.top2Count || 0) > 0 && <span className="text-blue-500 font-bold">2위 {inf.top2Count}</span>}
                  {(inf.top3Count || 0) > 0 && <span className="text-green-600 font-bold">3위 {inf.top3Count}</span>}
                  {inf.naverCreatedAt && <span>선정일 {formatNaverDate(inf.naverCreatedAt)}</span>}
                  <span className="flex items-center gap-1 flex-wrap">
                    <span className="shrink-0">마지막 챌린지</span>
                    <LastChallengeParticipationCell inf={inf} />
                  </span>
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
