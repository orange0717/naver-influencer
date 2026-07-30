'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import CategoryFilter from '@/components/CategoryFilter';

/** naver-topic-crawler.ts(NAVER_DOMAIN_CATEGORIES)와 동일한 20개 카테고리 — 클라이언트 번들에
 * 서버 전용 크롤러 모듈(supabase service role 포함)을 끌어오지 않기 위해 라벨만 별도 유지 */
const DISCOVER_CATEGORIES: { code: string; name: string }[] = [
  { code: 'travel', name: '여행' },
  { code: 'fashion', name: '패션' },
  { code: 'beauty', name: '뷰티' },
  { code: 'food', name: '푸드' },
  { code: 'technology', name: 'IT테크' },
  { code: 'car', name: '자동차' },
  { code: 'living', name: '리빙' },
  { code: 'parenting', name: '육아' },
  { code: 'health', name: '생활건강' },
  { code: 'game', name: '게임' },
  { code: 'pet', name: '동물/펫' },
  { code: 'sports', name: '운동/레저' },
  { code: 'prosports', name: '프로스포츠' },
  { code: 'broadcast', name: '방송/연예' },
  { code: 'music', name: '대중음악' },
  { code: 'movie', name: '영화' },
  { code: 'art', name: '공연/전시/예술' },
  { code: 'book', name: '도서' },
  { code: 'biz', name: '경제/비즈니스' },
  { code: 'edu', name: '어학/교육' },
];

interface InfluencerStat {
  rank: number;
  name: string;
  urlId: string;
  totalTopics: number;
  lastPublish: string | null;
  last7Days: number;
  last30Days: number;
  categories: Record<string, number>;
}

type SortKey = 'total' | 'last7' | 'last30' | 'recent' | 'name';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'total', label: '총 토픽순' },
  { key: 'last7', label: '최근7일순' },
  { key: 'last30', label: '최근30일순' },
  { key: 'recent', label: '최근발행순' },
  { key: 'name', label: '이름순' },
];

const TOP_CATEGORY_COUNT = 4;

function formatDate(d: string | null): string {
  if (!d) return '—';
  const date = new Date(`${d}T12:00:00Z`);
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function DiscoverInfluencersView() {
  const [items, setItems] = useState<InfluencerStat[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('total');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const categoryCode = useMemo(
    () => DISCOVER_CATEGORIES.find(c => c.name === category)?.code,
    [category],
  );

  const buildParams = useCallback(() => {
    const params = new URLSearchParams({ sort: sortBy, order });
    if (categoryCode) params.set('category', categoryCode);
    if (search.trim()) params.set('search', search.trim());
    return params;
  }, [categoryCode, search, sortBy, order]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams();
      params.set('_ts', String(Date.now()));
      const res = await fetch(`/api/discover/influencers?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
      const data = await res.json();
      setItems(data.items || []);
      setUpdatedAt(data.updatedAt || null);
    } catch (err) {
      console.error('Discover 발행량 집계 로드 실패:', err);
      setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    const timer = setTimeout(fetchData, search ? 500 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, search]);

  const handleSortChange = (key: SortKey) => {
    if (sortBy === key) {
      setOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(key);
      setOrder('desc');
    }
  };

  const sortArrow = (key: SortKey) => {
    if (sortBy !== key) return ' ↕';
    return order === 'desc' ? ' ↓' : ' ↑';
  };

  const topCategoryKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const [subject, n] of Object.entries(item.categories)) {
        if (subject === '기타') continue;
        counts.set(subject, (counts.get(subject) || 0) + n);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_CATEGORY_COUNT)
      .map(([subject]) => subject);
  }, [items]);

  const otherCount = (item: InfluencerStat) => {
    let sum = 0;
    for (const [subject, n] of Object.entries(item.categories)) {
      if (subject === '기타' || !topCategoryKeys.includes(subject)) sum += n;
    }
    return sum;
  };

  const downloadUrl = (format: 'csv' | 'xlsx') => {
    const params = buildParams();
    params.set('format', format);
    return `/api/discover/influencers?${params}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Discover 발행량 집계</h1>
          <p className="text-xs text-dim mt-1">
            네이버 인플루언서 Discover 페이지 기준 인플루언서별 토픽 발행량 순위
            {updatedAt && <span> · 최근 수집 {formatDate(updatedAt.slice(0, 10))}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={downloadUrl('csv')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 transition-colors"
          >
            CSV 다운로드
          </a>
          <a
            href={downloadUrl('xlsx')}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/40 transition-colors"
          >
            Excel 다운로드
          </a>
        </div>
      </div>

      <input
        type="text"
        placeholder="인플루언서 검색..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
      />

      <CategoryFilter
        categories={['전체', ...DISCOVER_CATEGORIES.map(c => c.name)]}
        selected={category}
        onChange={setCategory}
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
            <p className="text-sm text-dim">집계 중...</p>
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
                  <th className="text-right py-3 px-3 font-semibold text-dim text-xs">총 토픽</th>
                  <th className="text-right py-3 px-3 font-semibold text-dim text-xs">최근7일</th>
                  <th className="text-right py-3 px-3 font-semibold text-dim text-xs">최근30일</th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-xs">최근발행일</th>
                  {topCategoryKeys.map(key => (
                    <th key={key} className="text-right py-3 px-3 font-semibold text-dim text-xs">{key}</th>
                  ))}
                  <th className="text-right py-3 px-3 font-semibold text-dim text-xs">기타</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.urlId} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                    <td className="py-3 px-4 font-bold font-rank text-xs text-dim">{item.rank}</td>
                    <td className="py-3 px-4 font-bold">{item.name}</td>
                    <td className="py-3 px-3 text-right text-xs font-bold font-rank text-accent">{item.totalTopics}</td>
                    <td className="py-3 px-3 text-right text-xs font-rank">{item.last7Days}</td>
                    <td className="py-3 px-3 text-right text-xs font-rank">{item.last30Days}</td>
                    <td className="py-3 px-3 text-xs text-dim">{formatDate(item.lastPublish)}</td>
                    {topCategoryKeys.map(key => (
                      <td key={key} className="py-3 px-3 text-right text-xs font-rank text-dim">
                        {item.categories[key] || 0}
                      </td>
                    ))}
                    <td className="py-3 px-3 text-right text-xs font-rank text-dim">{otherCount(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <div className="text-center py-12 text-dim text-sm">데이터가 없습니다.</div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {items.map(item => (
              <div key={item.urlId} className="bg-surface rounded-xl border border-border p-4 hover:border-accent/40 transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-rank text-dim">#{item.rank}</span>
                    <span className="font-bold text-sm">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-accent font-rank">{item.totalTopics}</div>
                    <div className="text-[10px] text-dim">총 토픽</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-dim">
                  <span>최근7일 {item.last7Days}</span>
                  <span>최근30일 {item.last30Days}</span>
                  <span>최근발행 {formatDate(item.lastPublish)}</span>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div className="text-center py-12 text-dim text-sm">데이터가 없습니다.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
