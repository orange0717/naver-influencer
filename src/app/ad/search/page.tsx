'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { formatCount } from '@/lib/format';
import { buildRuleSummary } from '@/lib/ai-search';
import type { InfluencerSearchFilters } from '@/lib/ai-search';
import CategoryFilter from '@/components/CategoryFilter';
import MessageModal from '@/components/MessageModal';

interface AdInfluencer {
  naverId: string;
  displayName: string;
  imageUrl: string;
  introduction: string;
  category: string;
  categoryType: string;
  myKeyword: string;
  subscriberCount: number;
  totalKeywords: number;
  integratedTop3Count: number;
  top3Ratio: number;
  top1Count: number;
  top2Count: number;
  top3Count: number;
  avgRank: number | null;
  bestRank: number | null;
  adFeeAmount: number | null;
  adFeeText: string | null;
  adProcess: string | null;
  ninflScore: number;
  lastChallengedAt: string | null;
  activityLevel: 'active' | 'recent' | 'inactive';
}

type SortKey = 'integrated_top3_count' | 'top3_ratio' | 'subscriber_count' | 'total_keywords' | 'best_rank' | 'ninfl_score';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'ninfl_score', label: 'N인플 점수' },
  { key: 'integrated_top3_count', label: 'TOP3' },
  { key: 'top3_ratio', label: '비율' },
  { key: 'subscriber_count', label: '팬수' },
  { key: 'total_keywords', label: '챌린지수' },
  { key: 'best_rank', label: '최고순위' },
];

const RANK_PRESETS = [
  { value: 10, label: 'TOP 10' },
  { value: 30, label: 'TOP 30' },
  { value: 50, label: 'TOP 50' },
  { value: 0, label: '전체' },
];

const FAN_PRESETS = [
  { value: 1000, label: '1,000+' },
  { value: 5000, label: '5,000+' },
  { value: 10000, label: '1만+' },
  { value: 50000, label: '5만+' },
  { value: 0, label: '전체' },
];

const ACTIVITY_PRESETS = [
  { value: 'active' as const, label: '활동중 (30일)' },
  { value: 'recent' as const, label: '최근 (90일)' },
  { value: 'all' as const, label: '전체' },
];

const TOP3_RATIO_PRESETS = [
  { value: 30, label: '30%+' },
  { value: 50, label: '50%+' },
  { value: 70, label: '70%+' },
  { value: 0, label: '전체' },
];

export default function AdSearchPage() {
  const [influencers, setInfluencers] = useState<AdInfluencer[]>([]);
  const [categories, setCategories] = useState<string[]>(['전체']);
  const [category, setCategory] = useState('전체');
  const [search, setSearch] = useState('');
  const [minRank, setMinRank] = useState(0);
  const [minFans, setMinFans] = useState(0);
  const [activityLevel, setActivityLevel] = useState<'active' | 'recent' | 'all'>('all');
  const [minTop3Ratio, setMinTop3Ratio] = useState(0);
  const [hasAdProfile, setHasAdProfile] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('integrated_top3_count');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [msgTarget, setMsgTarget] = useState<{ naverId: string; name: string } | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiFilters, setAiFilters] = useState<InfluencerSearchFilters | null>(null);

  const isFiltered = category !== '전체' || search || minRank > 0 || minFans > 0 || activityLevel !== 'all' || minTop3Ratio > 0 || hasAdProfile || !!aiFilters;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: aiFilters?.limit ? String(aiFilters.limit) : '20',
        sort: sortBy,
        order,
        activityLevel,
      });
      if (category !== '전체') params.set('category', category);
      if (search.trim()) params.set('search', search.trim());
      if (minRank > 0) params.set('minRank', String(minRank));
      if (minFans > 0) params.set('minFans', String(minFans));
      if (minTop3Ratio > 0) params.set('minTop3Ratio', String(minTop3Ratio));
      if (aiFilters?.min_total_keywords) params.set('minTotalKeywords', String(aiFilters.min_total_keywords));
      if (hasAdProfile) params.set('hasAdProfile', 'true');

      const res = await fetch(`/api/ad/search?${params}`);
      const data = await res.json();

      setInfluencers(data.influencers || []);
      setCategories(data.categories || ['전체']);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);

      // AI 검색 요약 갱신
      if (aiFilters && aiSummary) {
        setAiSummary(buildRuleSummary('', aiFilters, data.total || 0));
      }
    } catch {
      console.error('광고주 검색 실패');
    } finally {
      setLoading(false);
    }
  }, [page, category, search, minRank, minFans, activityLevel, minTop3Ratio, hasAdProfile, sortBy, order, aiFilters, aiSummary]);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(), search ? 500 : 0);
    return () => clearTimeout(timer);
  }, [fetchData, search]);

  const resetFilters = () => {
    setSearch('');
    setCategory('전체');
    setMinRank(0);
    setMinFans(0);
    setActivityLevel('all');
    setMinTop3Ratio(0);
    setHasAdProfile(false);
    setSortBy('integrated_top3_count');
    setOrder('desc');
    setPage(1);
    setAiSummary(null);
    setAiFilters(null);
  };

  // 자연어 검색: Enter 키 입력 시 서버 파서 API 호출
  const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const q = search.trim();
    if (!q) return;

    try {
      // 서버에서 파싱 (규칙 기반 + 파워콘텐츠 95K 키워드 매칭)
      const res = await fetch(`/api/ad/parse-query?q=${encodeURIComponent(q)}`);
      const { filters, matched } = await res.json() as { filters: InfluencerSearchFilters; matched: boolean };

      if (!matched) return; // 일반 텍스트 검색으로 폴백

      // 파서 결과를 UI 필터에 적용
      if (filters.category) setCategory(filters.category);
      if (filters.min_fan_count || filters.min_subscriber_count) {
        setMinFans(filters.min_fan_count || filters.min_subscriber_count || 0);
      }
      if (filters.ranking_top_n) setMinRank(filters.ranking_top_n);
      if (filters.recency_days) {
        setActivityLevel(filters.recency_days <= 30 ? 'active' : filters.recency_days <= 90 ? 'recent' : 'all');
      }

      // 정렬 매핑 (파서 sort_by → 페이지 SortKey)
      const sortMap: Record<string, SortKey> = {
        integrated_top3_count: 'integrated_top3_count',
        top3_ratio: 'top3_ratio',
        subscriber_count: 'subscriber_count',
        fan_count: 'subscriber_count',
        total_keywords: 'total_keywords',
        top1_count: 'integrated_top3_count',
      };
      if (filters.sort_by && sortMap[filters.sort_by]) {
        setSortBy(sortMap[filters.sort_by]);
      }
      if (filters.sort_order) setOrder(filters.sort_order);

      // keyword_text는 검색어로 유지
      if (filters.keyword_text) {
        setSearch(filters.keyword_text);
      } else {
        setSearch('');
      }

      setAiFilters(filters);
      setAiSummary(buildRuleSummary(q, filters, 0));
      setPage(1);
    } catch {
      // API 실패 시 일반 텍스트 검색으로 폴백
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setOrder(order === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(key);
      setOrder(key === 'best_rank' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const sortArrow = (key: SortKey) => {
    if (sortBy !== key) return ' ↕';
    return order === 'desc' ? ' ↓' : ' ↑';
  };

  const activityBadge = (level: string) => {
    if (level === 'active') return <span className="text-[10px] font-bold text-up bg-up/12 px-1.5 py-0.5 rounded-full">활동중</span>;
    if (level === 'recent') return <span className="text-[10px] font-bold text-gold bg-gold/12 px-1.5 py-0.5 rounded-full">최근활동</span>;
    return <span className="text-[10px] font-bold text-dim bg-bg px-1.5 py-0.5 rounded-full">비활동</span>;
  };

  const FilterBtn = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
        active
          ? 'bg-accent/20 text-accent border border-accent/40'
          : 'bg-surface border border-border/50 text-dim hover:border-accent/30'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/ad" className="text-xs text-dim hover:text-accent transition">광고주</Link>
          <span className="text-xs text-dim">/</span>
          <span className="text-xs text-accent font-semibold">인플루언서 찾기</span>
        </div>
        <h1 className="text-xl font-extrabold">인플루언서 찾기</h1>
        <p className="text-sm text-dim mt-1">키워드챌린지 실제 순위 데이터로 검증된 인플루언서를 찾아보세요</p>
      </div>

      {/* 검색바 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="자연어로 검색해보세요 (예: 뷰티 인플루언서 팬수 1만명 이상)"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); if (!e.target.value.trim()) { setAiSummary(null); setAiFilters(null); } }}
          onKeyDown={handleSearchKeyDown}
          className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
        />
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`shrink-0 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            filtersOpen ? 'bg-accent/20 text-accent border border-accent/40' : 'bg-surface border border-border text-dim hover:border-accent/30'
          }`}
        >
          필터 {filtersOpen ? '▲' : '▼'}
        </button>
        {isFiltered && (
          <button
            onClick={resetFilters}
            className="shrink-0 px-3 py-2.5 rounded-lg text-xs font-semibold bg-down/10 text-down border border-down/20 hover:bg-down/20 transition-colors cursor-pointer"
          >
            초기화
          </button>
        )}
      </div>

      {/* AI 검색 요약 */}
      {aiSummary && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-accent/8 border border-accent/20 rounded-lg">
          <span className="text-[10px] font-bold text-white bg-accent px-1.5 py-0.5 rounded">AI</span>
          <span className="text-xs text-text flex-1">{aiSummary}</span>
          <button
            onClick={resetFilters}
            className="text-[10px] text-dim font-semibold hover:text-down transition-colors cursor-pointer shrink-0"
          >
            초기화
          </button>
        </div>
      )}

      {/* 카테고리 */}
      <CategoryFilter categories={categories} selected={category} onChange={cat => { setCategory(cat); setPage(1); }} size="sm" />

      {/* 고급 필터 */}
      {filtersOpen && (
        <div className="bg-surface rounded-xl border border-border p-4 space-y-4">
          {/* 순위 범위 */}
          <div>
            <p className="text-xs font-semibold text-dim mb-2">최고 순위</p>
            <div className="flex flex-wrap gap-2">
              {RANK_PRESETS.map(p => (
                <FilterBtn key={p.value} active={minRank === p.value} onClick={() => { setMinRank(p.value); setPage(1); }}>
                  {p.label}
                </FilterBtn>
              ))}
            </div>
          </div>

          {/* 팬수 */}
          <div>
            <p className="text-xs font-semibold text-dim mb-2">팬수</p>
            <div className="flex flex-wrap gap-2">
              {FAN_PRESETS.map(p => (
                <FilterBtn key={p.value} active={minFans === p.value} onClick={() => { setMinFans(p.value); setPage(1); }}>
                  {p.label}
                </FilterBtn>
              ))}
            </div>
          </div>

          {/* 활동 수준 */}
          <div>
            <p className="text-xs font-semibold text-dim mb-2">활동 상태</p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_PRESETS.map(p => (
                <FilterBtn key={p.value} active={activityLevel === p.value} onClick={() => { setActivityLevel(p.value); setPage(1); }}>
                  {p.label}
                </FilterBtn>
              ))}
            </div>
          </div>

          {/* TOP3 비율 */}
          <div>
            <p className="text-xs font-semibold text-dim mb-2">TOP3 비율</p>
            <div className="flex flex-wrap gap-2">
              {TOP3_RATIO_PRESETS.map(p => (
                <FilterBtn key={p.value} active={minTop3Ratio === p.value} onClick={() => { setMinTop3Ratio(p.value); setPage(1); }}>
                  {p.label}
                </FilterBtn>
              ))}
            </div>
          </div>

          {/* 원고료 등록 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasAdProfile}
              onChange={e => { setHasAdProfile(e.target.checked); setPage(1); }}
              className="accent-accent w-4 h-4"
            />
            <span className="text-xs font-semibold text-dim">원고료 등록된 인플루언서만</span>
          </label>
        </div>
      )}

      {/* 정렬 + 결과 수 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-dim font-semibold">정렬</span>
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => handleSort(opt.key)}
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
        <span className="text-xs text-dim font-rank">
          {loading ? '검색 중...' : `검색 결과 ${total.toLocaleString()}명`}
        </span>
      </div>

      {/* 결과 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm text-dim">인플루언서를 찾고 있습니다...</p>
          </div>
        </div>
      ) : influencers.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm text-dim mb-2">조건에 맞는 인플루언서가 없습니다</p>
          <button onClick={resetFilters} className="text-xs text-accent font-semibold hover:underline cursor-pointer">필터 초기화</button>
        </div>
      ) : (
        <>
          {/* 카드 그리드 */}
          <div className="grid md:grid-cols-2 gap-4">
            {influencers.map(inf => (
              <div key={inf.naverId} className="bg-surface rounded-2xl border border-border p-5 hover:border-accent/40 transition">
                {/* 프로필 상단 */}
                <div className="flex items-start gap-3 mb-4">
                  {inf.imageUrl ? (
                    <img src={inf.imageUrl} alt={inf.displayName} className="w-12 h-12 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-lg shrink-0">
                      {inf.displayName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text truncate">{inf.displayName}</span>
                      {activityBadge(inf.activityLevel)}
                    </div>
                    <p className="text-xs text-dim truncate">
                      {inf.category}{inf.categoryType ? ` · ${inf.categoryType}` : ''}
                    </p>
                    {inf.myKeyword && (
                      <p className="text-[11px] text-accent font-semibold truncate mt-0.5">{inf.myKeyword}</p>
                    )}
                  </div>
                </div>

                {/* 핵심 지표 */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  <div className="text-center">
                    <p className="text-[10px] text-dim mb-0.5">팬수</p>
                    <p className="text-sm font-extrabold font-rank text-text">{formatCount(inf.subscriberCount)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-dim mb-0.5">챌린지</p>
                    <p className="text-sm font-extrabold font-rank text-text">{inf.totalKeywords}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-dim mb-0.5">TOP3</p>
                    <p className="text-sm font-extrabold font-rank text-accent">
                      {inf.integratedTop3Count}
                      <span className="text-[10px] text-dim font-normal ml-0.5">({inf.top3Ratio}%)</span>
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] text-dim mb-0.5">최고순위</p>
                    <p className="text-sm font-extrabold font-rank text-up">
                      {inf.bestRank ? `${inf.bestRank}위` : '-'}
                    </p>
                  </div>
                </div>

                {/* 순위 분포 */}
                {(inf.top1Count > 0 || inf.top2Count > 0 || inf.top3Count > 0) && (
                  <div className="flex items-center gap-2 mb-3">
                    {inf.top1Count > 0 && (
                      <span className="text-[10px] font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded">1위 {inf.top1Count}</span>
                    )}
                    {inf.top2Count > 0 && (
                      <span className="text-[10px] font-bold text-silver bg-silver/10 px-1.5 py-0.5 rounded">2위 {inf.top2Count}</span>
                    )}
                    {inf.top3Count > 0 && (
                      <span className="text-[10px] font-bold text-bronze bg-bronze/10 px-1.5 py-0.5 rounded">3위 {inf.top3Count}</span>
                    )}
                  </div>
                )}

                {/* 원고료 정보 */}
                <div className="bg-bg rounded-lg px-3 py-2 mb-3">
                  {inf.adFeeAmount ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-dim">원고료</span>
                      <span className="text-sm font-bold text-accent font-rank">{inf.adFeeAmount.toLocaleString()}원</span>
                    </div>
                  ) : inf.adFeeText ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-dim">원고료</span>
                      <span className="text-xs font-semibold text-text">{inf.adFeeText}</span>
                    </div>
                  ) : (
                    <p className="text-xs text-dim text-center">원고료 미등록</p>
                  )}
                </div>

                {/* 액션 */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-dim">
                    {inf.lastChallengedAt
                      ? `마지막 활동: ${new Date(inf.lastChallengedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`
                      : ''}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setMsgTarget({ naverId: inf.naverId, name: inf.displayName })}
                      className="text-xs text-dim font-semibold hover:text-accent transition-colors cursor-pointer"
                    >
                      쪽지 보내기
                    </button>
                    <Link
                      href={`/influencers/${inf.naverId}`}
                      className="text-xs text-accent font-semibold hover:underline"
                    >
                      프로필 보기 →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/30 disabled:opacity-40 cursor-pointer disabled:cursor-default transition-colors"
              >
                이전
              </button>
              <span className="text-xs text-dim font-rank">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-dim hover:border-accent/30 disabled:opacity-40 cursor-pointer disabled:cursor-default transition-colors"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
      {/* 쪽지 모달 */}
      {msgTarget && (
        <MessageModal
          receiverNaverId={msgTarget.naverId}
          receiverName={msgTarget.name}
          isOpen={true}
          onClose={() => setMsgTarget(null)}
        />
      )}
    </div>
  );
}
