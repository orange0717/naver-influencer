'use client';
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Keyword } from '@/lib/types';
import { getSubcategory, getSubcategoryList } from '@/data/subcategory-map';
import CategoryFilter from '@/components/CategoryFilter';
import BookmarkButton from '@/components/keywords/BookmarkButton';
import { useSavedKeywords } from '@/hooks/useSavedKeywords';
import { useAuth } from '@/hooks/useAuth';
import { newViewToken, viewHeaders, readQuotaExceeded, type QuotaInfo } from '@/lib/analysis-view';
import AnalysisQuotaNotice from '@/components/AnalysisQuotaNotice';
import { controlBoxClass } from '@/components/analytics/controls';
import StatusBadge from '@/components/analytics/StatusBadge';
import { ANALYTICS_SCOPE } from '@/components/analytics/tokens';
import '@/components/analytics/analytics-tokens.css';

const compTextMap: Record<string, string> = { low: '낮음', medium: '보통', high: '높음' };

interface CategoryGroup {
  category: string;
  total: number;
  keywords: Keyword[];
}

/* ── 상위 주제 매핑 ── */
const TOPIC_MAP: Record<string, string> = {
  '여행': '여행',
  '패션': '스타일',
  '뷰티': '스타일',
  '푸드': '푸드',
  'IT테크': '테크',
  '자동차': '테크',
  '리빙': '라이프',
  '육아': '라이프',
  '생활건강': '라이프',
  '게임': '게임',
  '동물/펫': '동물/펫',
  '운동/레저': '스포츠',
  '프로스포츠': '스포츠',
  '방송/연예': '엔터테인먼트',
  '대중음악': '엔터테인먼트',
  '영화': '엔터테인먼트',
  '공연/전시/예술': '컬쳐',
  '도서': '컬쳐',
  '경제/비즈니스': '경제/비즈니스',
  '어학/교육': '어학/교육',
};

const TOPIC_ORDER = ['여행', '스타일', '푸드', '테크', '라이프', '게임', '동물/펫', '스포츠', '엔터테인먼트', '컬쳐', '경제/비즈니스', '어학/교육'];

interface TopicGroup {
  topic: string;
  categories: CategoryGroup[];
  total: number;
}

interface RelatedKeyword {
  id: string;
  keyword: string;
  participant_count: number;
  search_volume_monthly: number;
}

export default function KeywordsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  // 키워드 분석 = 로그인 회원 누구나(무료 포함). 무료회원은 서버에서 하루 3회로 제한(withAnalysisView),
  // PRO·관리자는 무제한. 다운로드(CSV)는 기존대로 유료 전용 유지.
  const canDownload = user.isAdmin || user.subscriptionPlan === 'INFLUENCER';
  const [downloading, setDownloading] = useState(false);
  // 이 화면 mount 당 조회 토큰 1개 — 필터/검색/정렬/페이지네이션 재요청은 같은 조회로 dedup
  const [viewToken] = useState(() => newViewToken());
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user.id) {
      router.replace('/auth/login?redirect=/keywords');
      return;
    }
  }, [authLoading, user.id, router]);

  const handleDownload = async () => {
    if (!canDownload || downloading) return;
    setDownloading(true);
    try {
      const params = new URLSearchParams();
      if (category && category !== '전체') params.set('category', category);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/downloads/keywords?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '다운로드에 실패했습니다.');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/);
      const filename = m ? decodeURIComponent(m[1]) : `keywords_${Date.now()}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error(err);
      alert('다운로드 중 오류가 발생했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [grouped, setGrouped] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState('전체');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 정렬 상태
  const [sortKey, setSortKey] = useState<'participant_count' | 'competition_level' | 'search_volume_monthly' | 'search_volume_pc' | 'search_volume_mobile' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: typeof sortKey & string) => {
    if (sortKey === key) {
      if (sortOrder === 'desc') {
        setSortOrder('asc');
      } else {
        // 오름차순 → 초기화
        setSortKey(null);
      }
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
  const [rankingsLoading, setRankingsLoading] = useState<string | null>(null);

  // 관련키워드 캐시
  const [relatedCache, setRelatedCache] = useState<Record<string, RelatedKeyword[]>>({});

  // 저장된 키워드 토글
  const { savedSet, toggle: toggleSaved } = useSavedKeywords();
  const handleToggleSave = (kw: Keyword) => {
    toggleSaved(kw.keyword, {
      monthly_pc: kw.search_volume_pc || 0,
      monthly_mobile: kw.search_volume_mobile || 0,
      monthly_total: kw.search_volume_monthly || 0,
      competition: compTextMap[kw.competition_level] || '낮음',
    });
  };

  // 키워드 목록 로드 시 배치로 TOP3 가져오기 (점진적 로딩)
  useEffect(() => {
    const allKws = keywords.length > 0
      ? keywords
      : grouped.flatMap(g => g.keywords);
    if (allKws.length === 0) return;

    const BATCH = 20;
    const CONCURRENT = 5; // 5개씩 병렬, 완료되면 즉시 UI 업데이트
    const chunks: { names: string[]; kwList: typeof allKws }[] = [];
    for (let i = 0; i < allKws.length; i += BATCH) {
      const slice = allKws.slice(i, i + BATCH);
      chunks.push({ names: slice.map(kw => kw.keyword), kwList: slice });
    }

    let cancelled = false;
    (async () => {
      for (let i = 0; i < chunks.length; i += CONCURRENT) {
        if (cancelled) break;
        const batch = chunks.slice(i, i + CONCURRENT);
        const results = await Promise.all(
          batch.map(({ names }) =>
            fetch(`/api/keywords/batch-top3?keywords=${encodeURIComponent(names.join(','))}`)
              .then(res => res.json())
              .catch(() => ({ top3: {} }))
          )
        );
        if (cancelled) break;
        const merged: Record<string, { rank: number; name: string; naver_id: string }[]> = {};
        const allTop3 = Object.assign({}, ...results.map(r => r.top3 || {}));
        for (const { kwList } of batch) {
          for (const kw of kwList) {
            if (allTop3[kw.keyword]) merged[kw.id] = allTop3[kw.keyword];
          }
        }
        if (Object.keys(merged).length > 0) {
          setTop3Map(prev => ({ ...prev, ...merged }));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [keywords, grouped]);

  const toggleRankings = async (kwId: string) => {
    if (expandedId === kwId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(kwId);

    if (relatedCache[kwId]) return;

    setRankingsLoading(kwId);
    try {
      const res = await fetch(`/api/keywords/${kwId}/related`);
      const data = res.ok ? await res.json() : { related: [] };
      setRelatedCache(prev => ({ ...prev, [kwId]: data.related || [] }));
    } catch {
      setRelatedCache(prev => ({ ...prev, [kwId]: [] }));
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
    setError(null);
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

      const res = await fetch(`/api/keywords?${params}`, {
        headers: viewHeaders(viewToken),
      });
      if (!res.ok) {
        const exceeded = await readQuotaExceeded(res);
        if (exceeded) {
          setQuota(exceeded);
          return;
        }
        throw new Error('데이터를 불러오지 못했습니다.');
      }
      const data = await res.json();

      setKeywords(data.keywords || []);
      setGrouped(data.grouped || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setNextCursor(data.nextCursor || null);
    } catch (err) {
      console.error('키워드 로드 실패:', err);
      setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [category, currentPageIndex, sortKey, sortOrder, viewToken]);

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

  // 경쟁도는 분석 화면 공용 상태 토큰(초록/주황/빨강)만 쓴다 — /my '내 키워드' 배지와 같은 색.
  const compBadge = (level: string) => {
    if (level === 'low') return <StatusBadge tone="success" label="낮음" />;
    if (level === 'medium') return <StatusBadge tone="warning" label="보통" />;
    return <StatusBadge tone="danger" label="높음" />;
  };

  const startNum = currentPageIndex * 50;
  const hasNext = category !== '전체' ? !!nextCursor : (startNum + keywords.length) < total;
  const isGroupedView = category === '전체' && !search.trim() && grouped.length > 0;

  // 주제별로 카테고리 묶기
  const topicGrouped = useMemo<TopicGroup[]>(() => {
    if (!isGroupedView) return [];
    const topicMap = new Map<string, CategoryGroup[]>();
    for (const group of grouped) {
      const topic = TOPIC_MAP[group.category] || group.category;
      if (!topicMap.has(topic)) topicMap.set(topic, []);
      topicMap.get(topic)!.push(group);
    }
    return TOPIC_ORDER
      .filter(t => topicMap.has(t))
      .map(topic => ({
        topic,
        categories: topicMap.get(topic)!,
        total: topicMap.get(topic)!.reduce((sum, g) => sum + g.total, 0),
      }));
  }, [grouped, isGroupedView]);

  // 세부분류 목록 + 필터링
  const subCategories = useMemo(() => {
    // 카테고리 정의에서 전체 세부분류 가져오기 (정렬/비정렬 상관없이 일관된 목록)
    const definedSubs = getSubcategoryList(category);
    if (definedSubs.length > 0) return ['전체', ...definedSubs];
    // 정의 없는 카테고리: 로드된 키워드에서 추출
    const subs = keywords.map(kw => getSubcategory(kw.category, kw.keyword)).filter(Boolean);
    const unique = [...new Set(subs)].sort();
    return ['전체', ...unique];
  }, [category, keywords]);

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
        } else if (sortKey === 'search_volume_monthly') {
          diff = (a.search_volume_monthly || 0) - (b.search_volume_monthly || 0);
        } else if (sortKey === 'search_volume_pc') {
          diff = (a.search_volume_pc || 0) - (b.search_volume_pc || 0);
        } else if (sortKey === 'search_volume_mobile') {
          diff = (a.search_volume_mobile || 0) - (b.search_volume_mobile || 0);
        } else if (sortKey === 'competition_level') {
          diff = (compOrder[a.competition_level] || 0) - (compOrder[b.competition_level] || 0);
        }
        return sortOrder === 'asc' ? diff : -diff;
      });
    }
    return list;
  }, [keywords, subFilter, sortKey, sortOrder, search]);

  if (authLoading || !user.id) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-dim">권한을 확인하는 중...</p>
      </div>
    );
  }

  // 무료 하루 3회 조회 초과 — 데이터 대신 안내 화면 (서버가 402로 데이터를 반환하지 않음)
  if (quota) {
    return <AnalysisQuotaNotice quota={quota} />;
  }

  return (
    <div className={`${ANALYTICS_SCOPE} space-y-6`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-page-title">키워드 전체 목록</h1>
          <p className="text-sm text-dim mt-1">
            키워드를 누르면 검색어 트렌드와 전체 <span className="font-semibold text-accent">인플루언서 순위</span>를 볼 수 있어요.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {canDownload && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors cursor-pointer disabled:opacity-50"
              title="현재 필터 기준 최대 500건 CSV 다운로드"
            >
              {downloading ? '다운로드 중...' : 'CSV 다운로드'}
            </button>
          )}
          <span className="text-xs text-dim font-rank">
            {loading ? '로딩 중...' : `총 ${total.toLocaleString()}개`}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="text" placeholder="키워드 검색..." value={search} onChange={e => handleSearchChange(e.target.value)}
          className={`${controlBoxClass} flex-1 text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors`} />
        {(search || category !== '전체' || subFilter !== '전체' || sortKey) && (
          <button
            onClick={() => { setSearch(''); setCategory('전체'); setSubFilter('전체'); setSortKey(null); setSortOrder('desc'); setCursorHistory([null]); setCurrentPageIndex(0); setNextCursor(null); loadedCountRef.current = 0; }}
            className="shrink-0 h-8 px-3 rounded-lg text-xs font-semibold bg-surface text-text-2 border border-border hover:border-border-strong hover:text-text transition-colors cursor-pointer"
          >
            초기화
          </button>
        )}
      </div>

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
              className={`${controlBoxClass} text-text focus:outline-none focus:border-accent transition-colors cursor-pointer appearance-none pr-8`}
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
          {/* 버튼 바로가기 (데스크톱 전용 — 모바일은 위 select 사용) */}
          <div className="hidden md:flex flex-wrap gap-2">
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

      {error && (
        <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-center">
          <p className="text-sm text-down font-semibold">{error}</p>
          <button onClick={() => fetchData()} className="mt-2 text-xs text-accent hover:underline cursor-pointer">다시 시도</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-text-2 border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-dim">네이버에서 키워드를 가져오는 중...</p>
          </div>
        </div>
      ) : isGroupedView ? (
        /* ─── 전체: 주제별 그룹핑 뷰 ─── */
        <div className="space-y-8">
          {topicGrouped.map((topic) => (
            <div key={topic.topic}>
              {/* 주제 헤더 */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="category-title text-lg">{topic.topic}</h2>
                <span className="text-xs text-dim font-rank">{topic.total.toLocaleString()}개</span>
              </div>

              {/* 카테고리별 카드 (2열) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {topic.categories.map((group) => (
                  <div key={group.category} className="bg-surface rounded-lg border border-border overflow-hidden">
                    {/* 카테고리 헤더 */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-bg/50">
                      <button
                        onClick={() => handleCategoryChange(group.category)}
                        className="flex items-center gap-2 hover:text-accent transition-colors cursor-pointer"
                      >
                        <span className="category-title text-sm">{group.category}</span>
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
                            <td className="py-3.5 px-4 font-bold text-dim font-rank tabular-nums text-sm w-8">{i + 1}</td>
                            <td className="py-3.5 px-4">
                              <div className="min-w-0">
                                <Link href={`/keywords/${kw.id}`} className="text-[15px] font-bold hover:text-accent transition-colors truncate block">
                                  {kw.keyword}
                                </Link>
                                {top3Map[kw.id] && top3Map[kw.id].length > 0 && (
                                  <div className="mt-1 text-[11px] text-dim truncate" title={top3Map[kw.id].map(t => `${t.rank}위 ${t.name}`).join(' · ')}>
                                    {top3Map[kw.id].map((t, idx) => (
                                      <span key={t.naver_id}>
                                        <span className={t.rank === 1 ? 'text-gold font-bold' : t.rank === 2 ? 'text-silver font-bold' : 'text-bronze font-bold'}>{t.rank}위</span>
                                        <span className="ml-0.5 text-text-2 font-medium">{t.name}</span>
                                        {idx < top3Map[kw.id].length - 1 && <span className="mx-1 text-border">·</span>}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-3.5 px-3 text-sm text-dim">{kw.category}</td>
                            {sub && <td className="py-3.5 px-2 text-sm text-text-2 font-semibold">{sub}</td>}
                            <td className="py-3.5 px-4 text-right font-bold font-rank tabular-nums text-sm">{kw.participant_count.toLocaleString()}<span className="text-[11px] text-dim ml-0.5">명</span></td>
                            <td className="py-3.5 px-4 text-center w-20">{compBadge(kw.competition_level)}</td>
                            <td className="py-3.5 px-2 text-center w-10">
                              <BookmarkButton
                                isSaved={savedSet.has(kw.keyword)}
                                onClick={() => handleToggleSave(kw)}
                              />
                            </td>
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
                          className="block px-4 py-3 hover:bg-surface-hover transition">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-dim font-rank w-5">{i + 1}</span>
                              <span className="font-medium text-sm">{kw.keyword}</span>
                              {sub && <span className="text-xs text-text-2 font-semibold">{sub}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-rank text-dim">{kw.participant_count.toLocaleString()}명</span>
                              {compBadge(kw.competition_level)}
                              <BookmarkButton
                                isSaved={savedSet.has(kw.keyword)}
                                onClick={() => handleToggleSave(kw)}
                              />
                      </div>
                    </div>
                    {top3Map[kw.id] && top3Map[kw.id].length > 0 && (
                      <div className="text-[10px] text-dim mt-1 ml-7">
                        {top3Map[kw.id].map((t, idx) => (
                          <span key={t.naver_id}>
                            <span className={t.rank === 1 ? 'text-gold font-bold' : t.rank === 2 ? 'text-silver font-bold' : 'text-bronze font-bold'}>{t.rank}</span>
                            <span className="ml-0.5">{t.name}</span>
                            {idx < top3Map[kw.id].length - 1 && <span className="mx-1 text-border">|</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                  );
                })}
              </div>
            </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ─── 카테고리 선택 or 검색: 기존 리스트 뷰 ─── */
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-dim">
              {sortKey
                ? `정렬: ${sortKey === 'participant_count' ? '참여자' : sortKey === 'search_volume_monthly' ? '월 검색량' : sortKey === 'search_volume_pc' ? 'PC 검색량' : sortKey === 'search_volume_mobile' ? '모바일 검색량' : '경쟁도'} ${sortOrder === 'desc' ? '높은순' : '낮은순'}`
                : '정렬: 기본순'}
            </span>
            {sortKey && (
              <button onClick={() => setSortKey(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border/50 text-dim hover:border-accent/30 transition-colors cursor-pointer">초기화</button>
            )}
          </div>
          <div className="bg-surface rounded-lg border border-border overflow-x-auto hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-bg/50">
                  <th className="text-left py-3 px-4 font-semibold text-dim text-sm w-8">#</th>
                  <th className="text-left py-3 px-4 font-semibold text-dim text-sm">키워드</th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-sm">카테고리</th>
                  <th className="text-left py-3 px-2 font-semibold text-dim text-sm">세부분류</th>
                  <th className="text-right py-3 px-3 font-semibold text-dim text-sm cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('participant_count')}>
                    참여자{sortArrow('participant_count')}
                  </th>
                  <th className="text-right py-3 px-3 font-semibold text-dim text-sm cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('search_volume_monthly')}>
                    월 검색량{sortArrow('search_volume_monthly')}
                  </th>
                  <th className="text-right py-3 px-2 font-semibold text-dim text-xs cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('search_volume_pc')}>
                    PC{sortArrow('search_volume_pc')}
                  </th>
                  <th className="text-right py-3 px-2 font-semibold text-dim text-xs cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('search_volume_mobile')}>
                    모바일{sortArrow('search_volume_mobile')}
                  </th>
                  <th className="text-left py-3 px-3 font-semibold text-dim text-sm">등록일</th>
                  <th className="text-center py-3 px-3 font-semibold text-dim text-sm cursor-pointer hover:text-text transition-colors" onClick={() => handleSort('competition_level')}>
                    경쟁도{sortArrow('competition_level')}
                  </th>
                  <th className="text-center py-3 px-2 font-semibold text-dim text-sm w-10">저장</th>
                </tr>
              </thead>
              <tbody>
                {displayKeywords.map((kw, i) => {
                  const sub = getSubcategory(kw.category, kw.keyword);
                  const isExpanded = expandedId === kw.id;
                  const isLoadingRank = rankingsLoading === kw.id;
                  return (
                  <Fragment key={kw.id}>
                  <tr
                    className={`border-b border-border/50 hover:bg-surface-hover transition-colors cursor-pointer ${isExpanded ? 'bg-surface-hover' : ''}`}
                    onClick={() => toggleRankings(kw.id)}
                  >
                    <td className="py-3.5 px-4 font-bold text-dim font-rank text-sm">{startNum + i + 1}</td>
                    <td className="py-3.5 px-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Link href={`/keywords/${kw.id}`} className="text-[15px] font-bold hover:text-accent transition-colors truncate" onClick={e => e.stopPropagation()}>
                            {kw.keyword}
                          </Link>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`text-dim transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        {top3Map[kw.id] && top3Map[kw.id].length > 0 && (
                          <div className="mt-1 text-[11px] text-dim truncate" title={top3Map[kw.id].map(t => `${t.rank}위 ${t.name}`).join(' · ')}>
                            {top3Map[kw.id].map((t, idx) => (
                              <span key={t.naver_id}>
                                <span className={t.rank === 1 ? 'text-gold font-bold' : t.rank === 2 ? 'text-silver font-bold' : 'text-bronze font-bold'}>{t.rank}위</span>
                                <span className="ml-0.5 text-text-2 font-medium">{t.name}</span>
                                {idx < top3Map[kw.id].length - 1 && <span className="mx-1 text-border">·</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-sm text-dim">{kw.category}</td>
                    <td className="py-3.5 px-2 text-sm text-text-2 font-semibold">{sub || <span className="text-dim">—</span>}</td>
                    <td className="py-3.5 px-3 text-right font-bold font-rank tabular-nums text-sm">{kw.participant_count.toLocaleString()}</td>
                    <td className="py-3.5 px-3 text-right font-rank tabular-nums text-sm">
                      {kw.search_volume_monthly > 0 ? kw.search_volume_monthly.toLocaleString() : <span className="text-dim">—</span>}
                    </td>
                    <td className="py-3.5 px-2 text-right font-rank tabular-nums text-xs text-dim">
                      {kw.search_volume_pc > 0 ? kw.search_volume_pc.toLocaleString() : <span className="text-dim" title="검색량 데이터 없음">—</span>}
                    </td>
                    <td className="py-3.5 px-2 text-right font-rank tabular-nums text-xs text-dim">
                      {kw.search_volume_mobile > 0 ? kw.search_volume_mobile.toLocaleString() : <span className="text-dim" title="검색량 데이터 없음">—</span>}
                    </td>
                    <td className="py-3.5 px-3 text-sm text-dim">
                      {kw.first_seen_at ? new Date(kw.first_seen_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : <span className="text-dim" title="등록일 정보 없음">—</span>}
                    </td>
                    <td className="py-3.5 px-3 text-center">{compBadge(kw.competition_level)}</td>
                    <td className="py-3.5 px-2 text-center">
                      <BookmarkButton
                        isSaved={savedSet.has(kw.keyword)}
                        onClick={() => handleToggleSave(kw)}
                      />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={11} className="px-4 py-3 bg-bg/60 border-b border-border/50">
                        {isLoadingRank ? (
                          <div className="flex items-center gap-2 py-2 pl-8">
                            <div className="animate-spin w-4 h-4 border-2 border-text-2 border-t-transparent rounded-full" />
                            <span className="text-xs text-dim">불러오는 중...</span>
                          </div>
                        ) : relatedCache[kw.id] && relatedCache[kw.id].length > 0 ? (
                          <div className="pl-8">
                            <p className="text-xs font-bold text-dim mb-2">관련 키워드</p>
                            <div className="flex flex-wrap gap-1.5">
                              {relatedCache[kw.id].map(rk => (
                                <Link
                                  key={rk.id}
                                  href={`/keywords/${rk.id}`}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-surface border border-border rounded-lg text-xs hover:border-accent/40 hover:text-accent transition-colors"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <span className="font-semibold">{rk.keyword}</span>
                                  <span className="text-dim font-rank">{rk.participant_count}</span>
                                  {rk.search_volume_monthly > 0 && (
                                    <span className="text-dim font-rank">/ {rk.search_volume_monthly >= 10000 ? `${(rk.search_volume_monthly / 10000).toFixed(1)}만` : rk.search_volume_monthly.toLocaleString()}</span>
                                  )}
                                </Link>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="pl-8 py-2 text-xs text-dim">관련 키워드가 없습니다</div>
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
                className="block bg-surface rounded-lg border border-border p-4 hover:border-accent/40 transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-bold text-dim font-rank shrink-0">#{startNum + i + 1}</span>
                    <span className="font-bold text-[15px] truncate">{kw.keyword}</span>
                    <span className="text-dim text-sm shrink-0">{kw.category}</span>
                    {sub && <span className="text-sm text-text-2 font-semibold shrink-0">{sub}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {compBadge(kw.competition_level)}
                    <BookmarkButton
                      isSaved={savedSet.has(kw.keyword)}
                      onClick={() => handleToggleSave(kw)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-dim">
                  <span>참여자 {kw.participant_count.toLocaleString()}명</span>
                  {kw.search_volume_monthly > 0 && <span>월 {kw.search_volume_monthly.toLocaleString()}회</span>}
                  {kw.search_volume_pc > 0 && <span>PC {kw.search_volume_pc.toLocaleString()}</span>}
                  {kw.search_volume_mobile > 0 && <span>모바일 {kw.search_volume_mobile.toLocaleString()}</span>}
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
