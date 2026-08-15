'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import GlassCard from '@/components/dashboard/GlassCard';
import KeywordDetailDrawer from './KeywordDetailDrawer';
import { useAuth } from '@/hooks/useAuth';
import { rowsToCsv, downloadCsvInBrowser, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';
import BlogRankingClient from '@/app/keywords/blog-ranking/BlogRankingClient';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { BloggerProfile, BlogPost, RankingResult, RankDelta, SyncedState, KeywordRankLookupRow, RepKeywordEntry, AutoKeyword, KeywordMeta } from './KeywordRankingSection.helpers';
import { newViewToken, viewHeaders, type QuotaInfo } from '@/lib/analysis-view';
import AnalysisQuotaNotice from '@/components/AnalysisQuotaNotice';
import {
  STATE_API,
  FLASH_MS,
  fetchRankingState,
  fetchRepKeywordsState,
  saveKeywordsToDb,
  saveRankResultToDb,
  rankKey,
  isStale,
  timeAgo,
  computeDeltaDisplay,
  renderRankTab,
  renderRankPill,
  rankCellText,
  getProfileFromApi,
} from './KeywordRankingSection.helpers';
import SummaryCards from '@/components/analytics/SummaryCards';
import PeriodFilter, { isExtendedPeriod, periodLabel } from '@/components/analytics/PeriodFilter';
import SegmentedFilter, { type SegmentOption } from '@/components/analytics/SegmentedFilter';
import PostSearchBar, { selectClass } from '@/components/analytics/PostSearchBar';
import StatusBadge from '@/components/analytics/StatusBadge';
import CheckProgress from '@/components/analytics/CheckProgress';
import AnalyticsTableShell from '@/components/analytics/AnalyticsTableShell';

// 포스팅당 직접 추가할 수 있는 수동 키워드 개수 — 서버(keyword-ranking-state PUT)는 20개까지 받는다.
const MAX_MANUAL_KEYWORDS = 10;

// 보조·직접추가 키워드 칩 — 대표키워드와 동일하게 각각의 순위를 보여주고 개별 조회(⟳)를 건다.
function KeywordChip({ label, rankText, tone, checking, disabled, onOpen, onCheck }: {
  label: string;
  rankText: string;
  tone: 'secondary' | 'manual';
  checking: boolean;
  disabled: boolean;
  onOpen: () => void;
  onCheck: () => void;
}) {
  const toneCls = tone === 'manual' ? 'bg-accent/5 border-accent/20' : 'bg-bg border-border/60';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] pl-1.5 pr-1 py-0.5 rounded-full border ${toneCls}`}>
      <button onClick={onOpen} className="text-dim hover:text-accent truncate max-w-[110px] cursor-pointer" title={`${label} — 상세 보기`}>{label}</button>
      <span className="text-dim/70 font-rank shrink-0">{rankText}</span>
      <button onClick={onCheck} disabled={disabled} className="text-dim hover:text-accent cursor-pointer disabled:opacity-40 shrink-0" title={`${label} 순위 조회`}>{checking ? '…' : '⟳'}</button>
    </span>
  );
}

export default function KeywordRankingSection() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  // 이 화면 mount 당 조회 토큰 1개 (내 순위 상태 조회 요청에 공통 사용)
  const [viewToken] = useState(() => newViewToken());
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);

  // postId → 키워드 배열
  const [postKeywords, setPostKeywords] = useState<Record<string, string[]>>({});
  // postId → 키워드 배열 (편집 중)
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string[]>>({});
  // "postId::keyword" → RankingResult
  const [rankingResults, setRankingResults] = useState<Record<string, RankingResult>>({});
  // "postId::keyword" → RankDelta (전일대비/7일대비 계산 근거, get_keyword_rank_deltas RPC)
  const [rankDeltas, setRankDeltas] = useState<Record<string, RankDelta>>({});
  // "postId::keyword" → 키워드 메타(종류/대표여부/변형원본/포스팅URL) — 상세·렌더용 (스펙 #11)
  const [keywordMeta, setKeywordMeta] = useState<Record<string, KeywordMeta>>({});
  // postId → 영속화된 대표 키워드(post_representative_keywords) — 자동추출, 사용자가 직접 입력하는 커스텀 키워드와 별개
  const [repKeywords, setRepKeywords] = useState<Record<string, RepKeywordEntry>>({});
  const [extractingRepId, setExtractingRepId] = useState('');
  const [extractingAll, setExtractingAll] = useState(false);
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0 });
  const [stateReady, setStateReady] = useState(false);
  const [checkingKey, setCheckingKey] = useState('');
  // 자동/수동 백그라운드 일괄 갱신 진행 여부 (화면을 막지 않는 작은 표시용)
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  // '지금 업데이트' 사전 예상치 확인(스펙 #11/#14) — 무조건 조회 대신 대상 수·예상 호출·캐시 제외를 먼저 보여준다.
  const [refreshEstimate, setRefreshEstimate] = useState<{
    pairs: { post: BlogPost; keyword: string; meta?: KeywordMeta }[];
    stalePairs: { post: BlogPost; keyword: string; meta?: KeywordMeta }[];
    target: number; stale: number; fresh: number; estCalls: number;
  } | null>(null);
  const [refreshForceAll, setRefreshForceAll] = useState(false);
  const [refreshStarting, setRefreshStarting] = useState(false);
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');
  const [showKeywordSearch, setShowKeywordSearch] = useState(false);
  // 포스팅별 "직접 키워드 편집" 열림 상태 (스펙 #26: 수동 입력란은 기본 숨김, 편집 토글로만 노출)
  const [editOpen, setEditOpen] = useState<Set<string>>(new Set());
  // 키워드 상세 드로어 대상 (스펙 #27)
  const [detail, setDetail] = useState<{ post: BlogPost; keyword: string } | null>(null);

  // ── 노출 현황과 동일한 필터/정렬 상태 (스펙 #5~#11) ──
  const [period, setPeriod] = useState(30); // 기본 30일 (0 = 전체)
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  type StatusKey = 'all' | 'top10' | 'top30' | 'top100' | 'out' | 'unknown';
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  type Basis = 'integrated' | 'blog' | 'influencer';
  const [rankBasis, setRankBasis] = useState<Basis>('integrated'); // 순위 기준(기본 통합검색, 스펙 #5)
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'title'>('latest');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false); // 상단 보조버튼 더보기(⋯) (스펙 #22)
  const [reextracting, setReextracting] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState('');
  const [expandedSecondary, setExpandedSecondary] = useState<Set<string>>(new Set()); // 보조키워드 펼침 (스펙 #13)
  // 30일 이전(확장 기간) 확인 모달 (스펙 #8) — 자동조회 대신 명시적 확인
  const [extendPrompt, setExtendPrompt] = useState<number | null>(null);
  // 대표키워드 직접 수정 대상 (스펙 #15) — keyword_source=manual
  const [editRep, setEditRep] = useState<{ postId: string; value: string } | null>(null);
  const [savingRep, setSavingRep] = useState(false);
  const abortRef = useRef(false);
  const extractAbortRef = useRef(false);
  const refreshingRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const rankingResultsRef = useRef<Record<string, RankingResult>>({});
  const postKeywordsRef = useRef<Record<string, string[]>>({});
  const editingKeywordsRef = useRef<Record<string, string[]>>({});
  const repKeywordsRef = useRef<Record<string, RepKeywordEntry>>({});
  // 페이지 진입 시 자동 추출(스펙 #8) 제어용 — 중복 실행 방지 + 세션 내 재시도 방지 + 언마운트/페이지전환 중단
  const autoExtractRunningRef = useRef(false);
  const autoExtractAbortRef = useRef(false);
  const autoExtractDoneRef = useRef<Set<string>>(new Set());
  // postId → 디바운스 자동저장 타이머 (블러/엔터를 기다리지 않고도 입력 후 일정 시간 뒤 자동 저장)
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // handleKeywordSave의 최신 버전을 항상 가리키는 ref (디바운스 타이머가 오래된 클로저를 호출하지 않도록)
  const handleKeywordSaveRef = useRef<(postId: string) => void>(() => {});

  useEffect(() => { rankingResultsRef.current = rankingResults; }, [rankingResults]);
  useEffect(() => { postKeywordsRef.current = postKeywords; }, [postKeywords]);
  useEffect(() => { editingKeywordsRef.current = editingKeywords; }, [editingKeywords]);
  useEffect(() => { repKeywordsRef.current = repKeywords; }, [repKeywords]);

  const showError = useCallback((msg: string, ms = 5000) => {
    setErrorMessage(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMessage(''), ms);
  }, []);

  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    Object.values(flashTimersRef.current).forEach(clearTimeout);
    Object.values(saveTimersRef.current).forEach(clearTimeout);
    abortRef.current = true;
  }, []);

  const flashCell = useCallback((key: string) => {
    setFlashKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    if (flashTimersRef.current[key]) clearTimeout(flashTimersRef.current[key]);
    flashTimersRef.current[key] = setTimeout(() => {
      setFlashKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      delete flashTimersRef.current[key];
    }, FLASH_MS);
  }, []);

  const { user } = useAuth();
  const isLoggedIn = !!(user.id || user.authId);
  const canDownload = user.isAdmin || user.subscriptionPlan === 'INFLUENCER';

  const handleDownload = () => {
    if (!canDownload) return;
    const headers = ['제목', '검색 키워드', '통합검색', '블로그', '인플루언서', '전일대비', '7일대비', '검색량', '업데이트'];
    const rows: unknown[][] = [];
    for (const post of blogPosts) {
      const repKw = repKeywords[post.id]?.keyword;
      const kws = repKw ? [repKw, ...(postKeywords[post.id] || [])] : (postKeywords[post.id] || []);
      if (kws.length === 0) continue;
      for (const kw of kws) {
        if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
        const key = rankKey(post.id, kw);
        const result = rankingResults[key];
        const delta = rankDeltas[key];
        const prevDelta = computeDeltaDisplay(result?.viewTab.exposed ?? false, result?.viewTab.rank ?? null, delta?.prevRank ?? null, delta?.prevCheckedAt ?? null);
        const weekDelta = computeDeltaDisplay(result?.viewTab.exposed ?? false, result?.viewTab.rank ?? null, delta?.weekRank ?? null, delta?.weekCheckedAt ?? null);
        rows.push([
          post.title,
          kw === repKw ? `${kw} (대표)` : kw,
          rankCellText(result, result?.viewTab),
          rankCellText(result, result?.blogTab),
          rankCellText(result, result?.influencerTab),
          result ? prevDelta.label : '-',
          result ? weekDelta.label : '-',
          result?.searchVolume ?? '',
          result?.checkedAt ? new Date(result.checkedAt).toLocaleString('ko-KR') : '',
        ]);
      }
      if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
    }
    if (rows.length === 0) {
      alert('다운로드할 키워드 데이터가 없습니다. 먼저 키워드를 등록하고 순위를 확인해주세요.');
      return;
    }
    const csv = rowsToCsv(headers, rows);
    downloadCsvInBrowser(`my_keyword_ranking_${todayStamp()}.csv`, csv);
  };

  const handleResetResults = useCallback(async () => {
    if (!profile) return;
    if (!confirm('모든 포스팅의 키워드와 순위 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

    try {
      // 1. 프론트엔드 상태 초기화
      // 모든 로드된 포스팅에 대해 빈 키워드 상태 설정
      setEditingKeywords(prev => {
        const updated = { ...prev };
        if (blogPosts && blogPosts.length > 0) {
          blogPosts.forEach(post => {
            updated[post.id] = [''];
          });
        }
        return updated;
      });

      // 저장된 키워드 전부 삭제 (로컬 상태)
      setPostKeywords({});
      // 2. 모든 순위 결과 초기화 (로컬 상태)
      setRankingResults({});
      setRankDeltas({});
      queryClient.setQueryData(['keyword-ranking-state', profile.blogId], { postKeywords: {}, rankingResults: {}, rankDeltas: {} });

      // 3. DB: 키워드순위 상태 + 저장된 검색 키워드 테이블 모두 초기화
      await Promise.all([
        fetch(`${STATE_API}?all=true`, { method: 'DELETE' }).catch(() => null),
        fetch('/api/my/saved-keywords?all=true', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => null),
      ]);

      showError('모든 키워드와 순위 데이터가 초기화되었습니다.', 3000);
    } catch (err) {
      showError('초기화 중 오류가 발생했습니다.', 3000);
      console.error('Reset error:', err);
    }
  }, [profile, blogPosts, showError, queryClient]);

  const handleClearPostKeywords = async (postId: string) => {
    if (!profile) return;
    if (!confirm('이 포스팅의 모든 키워드를 삭제하시겠습니까?')) return;

    // DB 삭제가 확인된 뒤에만 화면 상태를 반영한다 (DB 반영 실패 시 화면만 비어보이는 것을 방지)
    const ok = await saveKeywordsToDb(profile.blogId, postId, []);
    if (!ok) {
      showError('삭제에 실패했습니다. 네트워크 확인 후 다시 시도해주세요.', 4000);
      return;
    }

    setEditingKeywords(prev => ({ ...prev, [postId]: [''] }));
    const updated = { ...postKeywords };
    delete updated[postId];
    setPostKeywords(updated);

    // 해당 포스팅의 순위 결과도 로컬에서 제거
    const newResults = { ...rankingResults };
    for (const key of Object.keys(newResults)) {
      if (key.startsWith(`${postId}::`)) {
        delete newResults[key];
      }
    }
    setRankingResults(newResults);

    queryClient.setQueryData(
      ['keyword-ranking-state', profile.blogId],
      (old: SyncedState | undefined) => {
        if (!old) return old;
        const nextResults = { ...old.rankingResults };
        for (const key of Object.keys(nextResults)) {
          if (key.startsWith(`${postId}::`)) delete nextResults[key];
        }
        const nextKeywords = { ...old.postKeywords };
        delete nextKeywords[postId];
        return { postKeywords: nextKeywords, rankingResults: nextResults };
      },
    );

    showError('포스팅의 키워드가 초기화되었습니다.', 3000);
  };

  // 노출 현황과 동일하게 전체 포스팅을 한 번에 로드하고 클라이언트에서 기간/상태/검색으로 필터한다(스펙 #2/#24).
  const fetchBlogPosts = useCallback(async (blogId: string) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&all=true`);
      if (res.ok) {
        const data = await res.json();
        const posts: BlogPost[] = data.posts || [];
        setBlogPosts(posts);
        setBlogPostsTotal(data.totalCount || posts.length);
      }
    } catch { /* ignore */ }
    finally { setPostsLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const p = await getProfileFromApi();
      setProfile(p);
      if (p?.blogId) {
        await fetchBlogPosts(p.blogId);
      }
      setLoading(false);
    })();
  }, [fetchBlogPosts]);

  // DB에서 저장된 키워드/순위 상태 복원 (기기 간 동기화). staleTime으로 재방문 시 재요청 최소화.
  // 무료 하루 3회 조회 제한 대상 — X-View-Token 을 실어 보내고, 402(초과)는 아래 effect 에서 안내 화면으로 전환.
  const { data: syncedState, error: syncedError } = useQuery({
    queryKey: ['keyword-ranking-state', profile?.blogId],
    queryFn: () => fetchRankingState(profile!.blogId, viewHeaders(viewToken)),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
    retry: false, // 402(무료 초과)는 재시도하지 않고 즉시 안내
  });

  useEffect(() => {
    const status = (syncedError as (Error & { status?: number }) | null)?.status;
    if (status === 402) setQuota({ used: 3, limit: 3, needsSignup: false });
  }, [syncedError]);

  // 영속화된 대표 키워드 복원 (post_representative_keywords, blog_id 기준 공용 — 크롤링 없이 즉시 조회)
  const { data: repState } = useQuery({
    queryKey: ['rep-keywords-state', profile?.blogId],
    queryFn: () => fetchRepKeywordsState(profile!.blogId, viewHeaders(viewToken)),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (repState) setRepKeywords(repState);
  }, [repState]);

  useEffect(() => {
    if (syncedState) {
      setPostKeywords(syncedState.postKeywords);
      setRankingResults(syncedState.rankingResults);
      setRankDeltas(syncedState.rankDeltas || {});
      setKeywordMeta(syncedState.keywordMeta || {});
      setStateReady(true);
      // 서버 상태가 도착한 시점에만 편집 중 입력을 서버 값으로 맞춘다.
      // (postKeywords를 의존성으로 두면 다른 포스트 저장 시마다 전체가 재초기화되어
      //  사용자가 다른 필드에 입력 중인 값을 덮어써버리는 문제가 있었음)
      setEditingKeywords(prev => {
        const next = { ...prev };
        for (const [postId, kws] of Object.entries(syncedState.postKeywords)) {
          next[postId] = kws.length > 0 ? [...kws] : [''];
        }
        return next;
      });
    }
  }, [syncedState]);

  // 새 포스트(페이지 전환 등)가 나타났을 때만 초기값을 채운다. 이미 존재하는 편집 상태는 건드리지 않음
  // (postKeywords 변경(다른 포스트 저장 등)에 반응하지 않도록 ref로 읽어 재실행 트리거에서 제외)
  useEffect(() => {
    if (!profile || blogPosts.length === 0) return;
    setEditingKeywords(prev => {
      let changed = false;
      const next = { ...prev };
      for (const post of blogPosts) {
        if (next[post.id] === undefined) {
          const saved = postKeywordsRef.current[post.id];
          next[post.id] = saved && saved.length > 0 ? [...saved] : [''];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [profile, blogPosts]);

  const handleKeywordChange = (postId: string, kwIndex: number, value: string) => {
    setEditingKeywords(prev => {
      const kws = [...(prev[postId] || [])];
      kws[kwIndex] = value;
      return { ...prev, [postId]: kws };
    });
    // 블러/엔터 없이도 입력이 멈추면 잠시 후 자동 저장 (탭 전환·닫기로 블러가 안 걸리는 경우 대비)
    if (saveTimersRef.current[postId]) clearTimeout(saveTimersRef.current[postId]);
    saveTimersRef.current[postId] = setTimeout(() => {
      delete saveTimersRef.current[postId];
      handleKeywordSaveRef.current(postId);
    }, 800);
  };

  const checkSingleKeyword = useCallback(async (
    post: BlogPost,
    keyword: string,
    force = false,
    meta?: KeywordMeta,
  ): Promise<{ ok: boolean; status: number; cached: boolean }> => {
    if (!profile || !keyword.trim()) return { ok: false, status: 0, cached: false };
    const key = rankKey(post.id, keyword.trim());
    setCheckingKey(key);
    try {
      const res = await fetch('/api/blog/check-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId: profile.blogId,
          postTitle: post.title,
          postId: post.id,
          keyword: keyword.trim(),
          force,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const nextResult: RankingResult = {
          blogTab: data.blogTab,
          viewTab: data.viewTab,
          influencerTab: data.influencerTab,
          query: data.query,
          searchVolume: data.searchVolume,
          status: data.status,
          checkedAt: data.checkedAt || new Date().toISOString(),
        };

        // 순위/노출 상태가 실제로 바뀐 셀만 애니메이션으로 표시
        const prevResult = rankingResultsRef.current[key];
        if (prevResult && (
          prevResult.viewTab.rank !== nextResult.viewTab.rank ||
          prevResult.viewTab.exposed !== nextResult.viewTab.exposed ||
          prevResult.blogTab.rank !== nextResult.blogTab.rank ||
          prevResult.blogTab.exposed !== nextResult.blogTab.exposed ||
          prevResult.influencerTab?.rank !== nextResult.influencerTab?.rank ||
          prevResult.influencerTab?.exposed !== nextResult.influencerTab?.exposed
        )) {
          flashCell(key);
        }

        setRankingResults(prev => ({ ...prev, [key]: nextResult }));
        // 변경된 항목만 React Query 캐시에 반영 (재마운트 시 즉시 최신 데이터 노출, 불필요한 전체 refetch 방지)
        queryClient.setQueryData(
          ['keyword-ranking-state', profile.blogId],
          (old: SyncedState | undefined) => old ? { ...old, rankingResults: { ...old.rankingResults, [key]: nextResult } } : old,
        );
        // DB에 순위 결과 갱신 (기기 간 동기화). 저장 실패 시 화면에 표시된 값이 DB와 어긋나므로
        // 캐시를 무효화해 다음 조회 시점에 DB 실제 값으로 다시 맞춘다.
        // meta(키워드 종류/대표여부/변형원본/포스팅URL)를 함께 저장(스펙 #11) — post_url은 항상 채운다.
        const mergedMeta: KeywordMeta = { postUrl: post.url, ...(meta || {}) };
        saveRankResultToDb(profile.blogId, post.id, keyword.trim(), nextResult, mergedMeta).then(ok => {
          if (!ok) queryClient.invalidateQueries({ queryKey: ['keyword-ranking-state', profile.blogId] });
        });
        // 저장된 키워드라면 saved_search_keywords 최신 순위 캐시도 갱신 (실패 무시)
        fetch('/api/my/saved-keywords', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: keyword.trim(),
            view_rank: nextResult.viewTab.rank ?? null,
            blog_rank: nextResult.blogTab.rank ?? null,
            view_exposed: nextResult.viewTab.exposed ?? null,
            blog_exposed: nextResult.blogTab.exposed ?? null,
            post_id: post.id,
          }),
        }).catch(() => { /* ignore */ });
        return { ok: true, status: res.status, cached: data?.cached === true };
      }
      if (res.status === 429) {
        showError('요청이 너무 많습니다. 5분 후 다시 시도해주세요.');
      } else {
        showError(`순위 확인 실패 (오류 ${res.status}). 잠시 후 다시 시도해주세요.`);
      }
      return { ok: false, status: res.status, cached: false };
    } catch {
      showError('네트워크 오류로 순위를 확인하지 못했습니다.');
      return { ok: false, status: 0, cached: false };
    } finally { setCheckingKey(''); }
  }, [profile, showError, flashCell, queryClient]);

  // 포스팅 제목+본문을 분석해 대표 키워드를 자동추출(post_representative_keywords에 영속화)하고,
  // 곧바로 그 키워드로 순위까지 확인한다 — 사용자가 직접 입력하는 커스텀 키워드와 별개 트랙.
  // 대표 키워드 "추출만" — 규칙기반(제목 우선, 네이버 무호출)으로 대표+보조를 뽑아 저장·표시한다.
  // 순위 조회(check-missing)는 트리거하지 않는다 → 추출과 순위조회 분리(스펙 #9). 대량 자동추출에도 안전.
  // refine=true면 제목이 애매할 때만 본문 1회 보정(개별 재추출 버튼용).
  const extractRepresentativeOnly = useCallback(async (
    post: BlogPost,
    opts: { refine?: boolean; ai?: boolean } = {},
  ): Promise<{ keyword: string | null; autoKeywords: AutoKeyword[] } | null> => {
    if (!profile) return null;
    try {
      const res = await fetch(
        `/api/blog/representative-keywords?blogId=${encodeURIComponent(profile.blogId)}&postId=${encodeURIComponent(post.id)}&title=${encodeURIComponent(post.title)}${opts.refine ? '&refine=1' : ''}${opts.ai ? '&ai=1' : ''}`,
      );
      if (!res.ok) return null;
      const data: {
        representativeKeyword?: string | null;
        source?: string;
        keywords?: string[];
        candidateScreen?: { keyword: string; exposed: boolean; rank: number | null }[];
        autoKeywords?: AutoKeyword[];
      } = await res.json();
      const keyword = data.representativeKeyword || null;
      const autoKeywords = data.autoKeywords || [];
      setRepKeywords(prev => ({
        ...prev,
        [post.id]: {
          keyword,
          source: data.source,
          candidates: data.keywords || [],
          candidateScreen: data.candidateScreen || [],
          autoKeywords,
        },
      }));
      return { keyword, autoKeywords };
    } catch {
      return null;
    }
  }, [profile]);

  // 개별 재추출 버튼(⟳): 추출 + 대표 1개 즉시 순위확인(사용자의 명시적 단건 액션). 보조/변형은 백그라운드가 채운다.
  const handleExtractRepresentative = useCallback(async (post: BlogPost) => {
    if (!profile) return;
    setExtractingRepId(post.id);
    try {
      // 개별 재추출은 사용자 명시 단건 액션 → 규칙+본문으로도 애매하면 AI 1회 보정 허용(스펙 #2/#5). 대량추출엔 미적용.
      const result = await extractRepresentativeOnly(post, { refine: true, ai: true });
      if (!result) {
        showError('대표 키워드 자동추출에 실패했습니다.', 4000);
        return;
      }
      const { keyword, autoKeywords } = result;
      if (keyword) {
        const primaryMeta = autoKeywords.find(a => a.isPrimary);
        await checkSingleKeyword(post, keyword, false, primaryMeta
          ? { keywordType: primaryMeta.keywordType, isPrimary: true, baseKeyword: primaryMeta.baseKeyword, postUrl: post.url }
          : { keywordType: 'primary', isPrimary: true, postUrl: post.url });
      }
    } finally {
      setExtractingRepId('');
    }
  }, [profile, extractRepresentativeOnly, checkSingleKeyword, showError]);

  // 대표 키워드가 아직 없는 포스팅을 순차적으로 "추출만" 실행 (규칙기반이라 저비용 → 0.4초 간격). 순위조회는 별도(스펙 #9).
  const extractAllRepresentative = useCallback(async () => {
    const targets = blogPosts.filter(p => !repKeywordsRef.current[p.id]?.keyword);
    if (targets.length === 0 || extractingAll) return;
    setExtractingAll(true);
    extractAbortRef.current = false;
    setExtractProgress({ current: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      if (extractAbortRef.current) break;
      await extractRepresentativeOnly(targets[i]);
      setExtractProgress({ current: i + 1, total: targets.length });
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 400));
    }
    setExtractingAll(false);
  }, [blogPosts, extractingAll, extractRepresentativeOnly]);

  const stopExtractingAll = () => { extractAbortRef.current = true; autoExtractAbortRef.current = true; };

  // 저장된 대표키워드를 현행 규칙(+애매하면 AI)으로 일괄 재추출한다(manual 지정분 제외).
  // 추출 규칙을 개선해도 이미 저장된 값은 화면에 그대로 남기 때문에 사용자가 직접 갱신할 수단이 필요하다.
  const runReextractAll = useCallback(async () => {
    if (!profile || reextracting) return;
    setReextracting(true);
    try {
      const res = await fetch('/api/my/representative-keywords/reextract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, confirm: true }),
      });
      if (!res.ok) { showError('대표키워드 재추출 중 오류가 발생했습니다.'); return; }
      const data: { reextracted: number; changed: number; skippedManual: number } = await res.json();
      queryClient.invalidateQueries({ queryKey: ['rep-keywords-state', profile.blogId] });
      setNoticeMessage(`대표키워드 ${data.reextracted}건 재추출 완료 (${data.changed}건 변경, 직접 지정 ${data.skippedManual}건 유지). 변경된 포스팅은 순위를 다시 확인해 주세요.`);
    } catch {
      showError('대표키워드 재추출 중 오류가 발생했습니다.');
    } finally {
      setReextracting(false);
    }
  }, [profile, reextracting, showError, queryClient]);

  // 페이지 진입 시(포스트+대표상태 로드 후) 대표 키워드가 없는 포스팅을 백그라운드로 자동 추출한다(스펙 #8).
  // 규칙기반(제목 우선)이라 저비용이고, 순위 조회(네이버)는 트리거하지 않는다(스펙 #9) —
  // 버튼을 누르지 않아도 '미확인'이 사라진다. 이미 시도한 포스트는 재시도하지 않고, 페이지 전환/언마운트 시 중단.
  useEffect(() => {
    if (!profile?.blogId || !repState || blogPosts.length === 0) return;
    const known = repState;
    const targets = blogPosts.filter(
      p => !known[p.id]?.keyword && !repKeywordsRef.current[p.id]?.keyword && !autoExtractDoneRef.current.has(p.id),
    );
    if (targets.length === 0 || autoExtractRunningRef.current || extractingAll) return;

    autoExtractRunningRef.current = true;
    autoExtractAbortRef.current = false;
    (async () => {
      for (const post of targets) {
        if (autoExtractAbortRef.current) break;
        autoExtractDoneRef.current.add(post.id);
        await extractRepresentativeOnly(post);
        if (autoExtractAbortRef.current) break;
        await new Promise(r => setTimeout(r, 400));
      }
      autoExtractRunningRef.current = false;
    })();

    return () => { autoExtractAbortRef.current = true; autoExtractRunningRef.current = false; };
  }, [profile?.blogId, repState, blogPosts, extractingAll, extractRepresentativeOnly]);

  // 포스팅의 자동 조회 키워드 pair(대표+보조+변형, 메타 포함). autoKeywords가 없으면 대표만.
  const autoPairsFor = useCallback((post: BlogPost): { post: BlogPost; keyword: string; meta: KeywordMeta }[] => {
    const entry = repKeywordsRef.current[post.id];
    const list: AutoKeyword[] = entry?.autoKeywords && entry.autoKeywords.length > 0
      ? entry.autoKeywords
      : (entry?.keyword ? [{ keyword: entry.keyword, normalized: entry.keyword, keywordType: 'primary', isPrimary: true, baseKeyword: entry.keyword }] : []);
    return list.map(ak => ({
      post,
      keyword: ak.keyword,
      meta: { keywordType: ak.keywordType, isPrimary: ak.isPrimary, baseKeyword: ak.baseKeyword, postUrl: post.url },
    }));
  }, []);

  // 자동 백그라운드 갱신 + 관리자 수동 강제 새로고침이 공유하는 순차 실행기
  const runBatch = useCallback(async (
    pairs: { post: BlogPost; keyword: string; meta?: KeywordMeta }[],
    opts: { force?: boolean } = {},
  ) => {
    if (pairs.length === 0 || refreshingRef.current) return;
    refreshingRef.current = true;
    abortRef.current = false;
    setCheckingAll(true);
    setCheckProgress({ current: 0, total: pairs.length });

    for (let i = 0; i < pairs.length; i++) {
      if (abortRef.current) break;
      setCheckProgress({ current: i + 1, total: pairs.length });
      const r = await checkSingleKeyword(pairs[i].post, pairs[i].keyword, !!opts.force, pairs[i].meta);
      if (r.status === 429) {
        showError(`요청 한도 초과로 ${i + 1}/${pairs.length}에서 중단했습니다. 5분 후 다시 시도해주세요.`, 8000);
        break;
      }
      // 캐시 히트는 네이버를 치지 않았으므로 대기 불필요 → 재조회 시 거의 즉시 완료
      if (i < pairs.length - 1 && !r.cached) {
        await new Promise(res => setTimeout(res, 7000));
      }
    }

    setCheckingAll(false);
    setCheckProgress({ current: 0, total: 0 });
    refreshingRef.current = false;
  }, [checkSingleKeyword, showError]);

  const handleKeywordSave = useCallback((postId: string) => {
    if (!profile) return;
    if (saveTimersRef.current[postId]) {
      clearTimeout(saveTimersRef.current[postId]);
      delete saveTimersRef.current[postId];
    }
    // ref를 사용해 최신 편집 상태를 읽는다 (디바운스 타이머가 오래된 렌더의 값을 저장하는 것을 방지)
    const kws = (editingKeywordsRef.current[postId] || []).map(k => k.trim()).filter(Boolean);
    // 실제로 저장된 값과 다를 때만 저장을 호출한다 (빈 입력창을 그냥 blur만 해도 매번 PUT이 나가는 것 방지).
    // 단, kws.length === 0(입력창을 지워 전부 빈 값이 된 경우)은 이전에 저장된 키워드가 있었다면
    // 반드시 DB에도 반영해야 한다 — 과거엔 이 경우 저장 호출 자체를 건너뛰어, 사용자가 키워드를 지워도
    // DB엔 예전 값이 남아있다가 새로고침하면 지운 키워드가 다시 나타나는 것처럼 보이는 버그가 있었음.
    const prevSaved = postKeywordsRef.current[postId] || [];
    const unchanged = prevSaved.length === kws.length && prevSaved.every((k, i) => k === kws[i]);
    if (unchanged) return;
    setPostKeywords(prev => {
      if (kws.length === 0) {
        const next = { ...prev };
        delete next[postId];
        return next;
      }
      return { ...prev, [postId]: kws };
    });
    saveKeywordsToDb(profile.blogId, postId, kws).then(ok => {
      if (ok) {
        // 저장 성공분을 쿼리 캐시에도 즉시 반영 (백그라운드 refetch로 되돌아가는 경합 방지)
        queryClient.setQueryData(
          ['keyword-ranking-state', profile.blogId],
          (old: SyncedState | undefined) => {
            if (!old) return old;
            const nextKeywords = { ...old.postKeywords };
            if (kws.length === 0) delete nextKeywords[postId];
            else nextKeywords[postId] = kws;
            return { ...old, postKeywords: nextKeywords };
          },
        );
      } else {
        showError('키워드 저장에 실패했습니다. 네트워크 확인 후 다시 시도해주세요.');
        // 화면과 DB가 어긋났을 수 있으므로 다음 조회 시점에 DB 실제 값으로 재동기화
        queryClient.invalidateQueries({ queryKey: ['keyword-ranking-state', profile.blogId] });
      }
    });
    // 신규/변경된 키워드는 최근 확인 기록이 없거나 10분 이상 지났을 때만 즉시 백그라운드로 확인
    if (kws.length > 0) {
      const post = blogPosts.find(p => p.id === postId);
      if (post) {
        const pairs = kws
          .filter(kw => isStale(rankingResultsRef.current[rankKey(postId, kw)]))
          .map(kw => ({ post, keyword: kw }));
        if (pairs.length > 0) runBatch(pairs);
      }
    }
  }, [profile, blogPosts, runBatch, queryClient, showError]);

  useEffect(() => { handleKeywordSaveRef.current = handleKeywordSave; }, [handleKeywordSave]);

  const addKeyword = (postId: string) => {
    setEditingKeywords(prev => {
      const kws = [...(prev[postId] || []), ''];
      return { ...prev, [postId]: kws };
    });
  };

  const removeKeyword = (postId: string, kwIndex: number) => {
    if (!profile) return;
    setEditingKeywords(prev => {
      const kws = [...(prev[postId] || [])];
      kws.splice(kwIndex, 1);
      if (kws.length === 0) return prev;
      return { ...prev, [postId]: kws };
    });
    // 저장도 즉시
    setTimeout(() => handleKeywordSave(postId), 0);
  };

  const stopChecking = () => {
    abortRef.current = true;
  };

  // 화면을 막지 않는 자동 새로고침: 저장된 키워드 중 10분 이상 지났거나 아직 확인 안 된 것만 백그라운드로 조회
  const scanAndRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    const pairs: { post: BlogPost; keyword: string; meta?: KeywordMeta }[] = [];
    const seen = new Set<string>();
    for (const post of blogPosts) {
      // 사용자 수동 키워드
      const kws = (postKeywordsRef.current[post.id] || []).map(k => k.trim()).filter(Boolean);
      for (const kw of kws) {
        const key = rankKey(post.id, kw);
        if (isStale(rankingResultsRef.current[key]) && !seen.has(key)) { seen.add(key); pairs.push({ post, keyword: kw, meta: { keywordType: 'manual', postUrl: post.url } }); }
      }
      // 자동 추출(대표+보조+변형)
      for (const p of autoPairsFor(post)) {
        const key = rankKey(post.id, p.keyword);
        if (isStale(rankingResultsRef.current[key]) && !seen.has(key)) { seen.add(key); pairs.push(p); }
      }
    }
    if (pairs.length > 0) runBatch(pairs);
  }, [blogPosts, runBatch, autoPairsFor]);

  useEffect(() => {
    if (!profile || !stateReady || blogPosts.length === 0) return;
    scanAndRefresh();
    const id = setInterval(scanAndRefresh, 60 * 1000);
    return () => clearInterval(id);
  }, [profile, stateReady, blogPosts, scanAndRefresh]);

  // 백그라운드 큐(refresh-personal-keyword-ranks cron)가 DB를 갱신하면 60초 폴링을 기다리지 않고 즉시 반영
  useEffect(() => {
    if (!profile?.blogId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`keyword-rank-lookups-${profile.blogId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'keyword_rank_lookups', filter: `blog_id=eq.${profile.blogId}` },
        (payload: RealtimePostgresChangesPayload<KeywordRankLookupRow>) => {
          const row = payload.new as KeywordRankLookupRow;
          if (!row?.post_id || !row?.keyword || !row?.checked_at) return;
          const key = rankKey(row.post_id, row.keyword);
          const rowStatus = (row.status === 'ok' || row.status === 'error' || row.status === 'unanalyzable') ? row.status : undefined;
          const nextResult: RankingResult = {
            // null(미확인/일시오류)을 false(미노출)로 뭉개지 않도록 그대로 유지한다(스펙 #8).
            viewTab: { exposed: row.view_exposed ?? null, rank: row.view_rank },
            blogTab: { exposed: row.blog_exposed ?? null, rank: row.blog_rank },
            influencerTab: { exposed: row.influencer_exposed ?? null, rank: row.influencer_rank },
            query: row.keyword,
            searchVolume: row.search_volume ?? undefined,
            status: rowStatus,
            checkedAt: row.checked_at,
          };
          const prevResult = rankingResultsRef.current[key];
          if (!prevResult || prevResult.checkedAt !== nextResult.checkedAt) {
            flashCell(key);
          }
          setRankingResults(prev => ({ ...prev, [key]: nextResult }));
          queryClient.setQueryData(
            ['keyword-ranking-state', profile.blogId],
            (old: SyncedState | undefined) => old ? { ...old, rankingResults: { ...old.rankingResults, [key]: nextResult } } : old,
          );
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.blogId, flashCell, queryClient]);

  // 캐시 무시하고 현재 페이지 전체를 강제로 다시 조회
  // 사용자별 쿨다운(스펙 12항): 서버 게이트가 마지막 실행 후 30분 이내 재실행을 막는다.
  // 현재 페이지 전체 조회 대상(대표+보조+변형 + 수동 키워드) 페어를 중복 없이 구성한다.
  const buildRefreshPairs = useCallback((): { post: BlogPost; keyword: string; meta?: KeywordMeta }[] => {
    const pairs: { post: BlogPost; keyword: string; meta?: KeywordMeta }[] = [];
    const seen = new Set<string>();
    for (const post of blogPosts) {
      const kws = (postKeywords[post.id] || []).map(k => k.trim()).filter(Boolean);
      for (const kw of kws) {
        const key = rankKey(post.id, kw);
        if (!seen.has(key)) { seen.add(key); pairs.push({ post, keyword: kw, meta: { keywordType: 'manual', postUrl: post.url } }); }
      }
      for (const p of autoPairsFor(post)) {
        const key = rankKey(post.id, p.keyword);
        if (!seen.has(key)) { seen.add(key); pairs.push(p); }
      }
    }
    return pairs;
  }, [blogPosts, postKeywords, autoPairsFor]);

  // '지금 업데이트' 1단계: 무조건 조회하지 않고, 조회 대상·예상 호출·캐시 제외 수를 먼저 계산해 확인 패널을 띄운다(스펙 #11/#14).
  const openRefreshEstimate = () => {
    if (!profile || blogPosts.length === 0 || refreshingRef.current) return;
    const pairs = buildRefreshPairs();
    // 최근 10분 내 조회된(캐시 최신) 키워드는 다시 호출하지 않는다(스펙 #15) → 실제 조회 대상은 stale만.
    const stalePairs = pairs.filter(p => isStale(rankingResultsRef.current[rankKey(p.post.id, p.keyword)]));
    setRefreshForceAll(false);
    setRefreshEstimate({
      pairs,
      stalePairs,
      target: pairs.length,
      stale: stalePairs.length,
      fresh: pairs.length - stalePairs.length,
      // 키워드당 통합·블로그·인플루언서 3탭을 HTML로 실측 → 대략 3배로 추정.
      estCalls: stalePairs.length * 3,
    });
  };

  // '지금 업데이트' 2단계: 사용자 확인 후 서버 쿨다운 게이트를 통과하면 배치 실행. 기본은 캐시 최신 제외(stale만),
  // '캐시 무시하고 전체 재조회'를 택하면 전체를 강제 재조회한다(스펙 #15).
  const confirmRefresh = async () => {
    if (!refreshEstimate || refreshingRef.current) return;
    const runPairs = refreshForceAll ? refreshEstimate.pairs : refreshEstimate.stalePairs;
    if (runPairs.length === 0) { setRefreshEstimate(null); return; }

    setRefreshStarting(true);
    try {
      const gateRes = await fetch('/api/my/keyword-ranking/refresh-gate', { method: 'POST' });
      if (gateRes.status === 429) {
        const { remainingSec } = await gateRes.json().catch(() => ({ remainingSec: 0 }));
        const mins = Math.max(1, Math.ceil((remainingSec || 0) / 60));
        showError(`방금 전체 순위를 새로고침했어요. 약 ${mins}분 후 다시 시도할 수 있습니다.`, 6000);
        return;
      }
      if (!gateRes.ok) {
        showError('지금 업데이트를 시작할 수 없습니다. 잠시 후 다시 시도해주세요.', 5000);
        return;
      }
    } catch {
      showError('네트워크 오류로 업데이트를 시작하지 못했습니다.', 5000);
      return;
    } finally {
      setRefreshStarting(false);
    }

    setRefreshEstimate(null);
    runBatch(runPairs, { force: refreshForceAll });
  };

  // 헤더에 보여줄 전체 데이터의 마지막 갱신 시각 (가장 최근 checkedAt)
  const overallLastUpdated = useMemo(() => {
    let latest: string | null = null;
    for (const r of Object.values(rankingResults)) {
      if (r.checkedAt && (!latest || r.checkedAt > latest)) latest = r.checkedAt;
    }
    return latest;
  }, [rankingResults]);

  const missingRepCount = useMemo(
    () => blogPosts.filter(p => !repKeywords[p.id]?.keyword).length,
    [blogPosts, repKeywords],
  );

  const toggleEdit = (postId: string) => setEditOpen(prev => {
    const next = new Set(prev);
    if (next.has(postId)) next.delete(postId); else next.add(postId);
    return next;
  });

  // 포스팅별 수동 키워드 편집기 — 데스크톱 테이블 행과 모바일 카드가 같은 UI를 쓴다.
  const renderManualKeywordEditor = (post: BlogPost) => {
    const keywords = editingKeywords[post.id] || [];
    return (
      <>
        <div className="text-[11px] text-dim mb-1.5">키워드 추가 — 이 포스팅에서 추가로 추적할 키워드를 입력하세요(대표키워드와 별개, 최대 {MAX_MANUAL_KEYWORDS}개). 입력하면 자동 저장되고 순위 조회가 시작됩니다.</div>
        <div className="flex flex-wrap items-center gap-2">
          {keywords.map((kw, kwIdx) => {
            const kres = rankingResults[rankKey(post.id, kw.trim())];
            return (
              <div key={kwIdx} className="flex items-center gap-1">
                <input
                  type="text"
                  value={kw}
                  onChange={e => handleKeywordChange(post.id, kwIdx, e.target.value)}
                  onBlur={() => handleKeywordSave(post.id)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); handleKeywordSave(post.id); } }}
                  className="px-2 py-1 text-xs bg-surface border border-border rounded-lg focus:border-accent outline-none w-32"
                  placeholder="키워드"
                />
                {kw.trim() && (
                  <button onClick={() => checkSingleKeyword(post, kw, true)} disabled={checkingAll} className="text-dim hover:text-accent cursor-pointer disabled:opacity-40 text-xs" title="이 키워드 순위 조회">⟳</button>
                )}
                {kres && <span className="text-[10px] text-dim">{rankCellText(kres, kres.viewTab)}</span>}
                {keywords.length > 1 && (
                  <button onClick={() => removeKeyword(post.id, kwIdx)} className="text-dim hover:text-down text-xs cursor-pointer">x</button>
                )}
              </div>
            );
          })}
          {keywords.length < MAX_MANUAL_KEYWORDS && (
            <button onClick={() => addKeyword(post.id)} className="text-xs text-accent cursor-pointer hover:underline">+ 추가</button>
          )}
          {keywords.some(k => k.trim()) && (
            <button onClick={() => handleClearPostKeywords(post.id)} className="text-xs text-down/60 hover:text-down cursor-pointer hover:underline">초기화</button>
          )}
        </div>
      </>
    );
  };

  // ── 노출 현황과 동일한 파생 상태 (기간/상태/검색 필터 + 요약 집계, 스펙 #3~#11·#18) ──
  const usingCustomRange = Boolean(customFrom || customTo);

  // 선택한 순위 기준(통합검색·블로그·인플루언서)의 탭 결과 (스펙 #5)
  const basisTab = useCallback((result: RankingResult | undefined) => {
    if (!result) return undefined;
    return rankBasis === 'blog' ? result.blogTab : rankBasis === 'influencer' ? result.influencerTab : result.viewTab;
  }, [rankBasis]);

  // 포스트의 대표키워드 + 최신 순위 결과
  const repResultOf = useCallback((post: BlogPost) => {
    const rep = repKeywords[post.id]?.keyword || null;
    const key = rep ? rankKey(post.id, rep) : '';
    return { rep, key, result: rep ? rankingResults[key] : undefined, delta: rep ? rankDeltas[key] : undefined };
  }, [repKeywords, rankingResults, rankDeltas]);

  // 종합 상태(선택 기준 기준, 스펙 #18): TOP10/30/100 / 순위권밖 / 미확인 / 확인실패
  const postTier = useCallback((post: BlogPost): 'top10' | 'top30' | 'top100' | 'out' | 'unknown' | 'error' => {
    const { rep, result } = repResultOf(post);
    if (!rep || !result) return 'unknown';
    if (result.status === 'error' || result.status === 'unanalyzable') return 'error';
    const tab = basisTab(result);
    if (!tab || tab.exposed === null || tab.exposed === undefined) return 'unknown';
    if (tab.exposed && typeof tab.rank === 'number') {
      if (tab.rank <= 10) return 'top10';
      if (tab.rank <= 30) return 'top30';
      if (tab.rank <= 100) return 'top100';
      return 'out';
    }
    return 'out';
  }, [repResultOf, basisTab]);

  // 기간 필터 적용된 포스트 (기본 30일, 커스텀 날짜 우선). 날짜 파싱 실패 시 포함(누락 방지).
  const periodPosts = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;
    let from = 0;
    let to = Infinity;
    if (usingCustomRange) {
      from = customFrom ? new Date(customFrom).getTime() : 0;
      to = customTo ? new Date(customTo).getTime() + DAY : Infinity;
    } else if (period !== 0) {
      from = now - period * DAY;
    }
    return blogPosts.filter(p => {
      const t = new Date((p.date || '').replace(/\./g, '-')).getTime();
      if (isNaN(t)) return true;
      return t >= from && t <= to;
    });
  }, [blogPosts, period, customFrom, customTo, usingCustomRange]);

  // 상태 필터 + 검색 + 정렬
  const displayList = useMemo(() => {
    let list = periodPosts;
    if (statusFilter !== 'all') {
      list = list.filter(p => {
        const s = postTier(p);
        if (statusFilter === 'top10') return s === 'top10';
        if (statusFilter === 'top30') return s === 'top10' || s === 'top30';
        if (statusFilter === 'top100') return s === 'top10' || s === 'top30' || s === 'top100';
        if (statusFilter === 'out') return s === 'out';
        if (statusFilter === 'unknown') return s === 'unknown' || s === 'error';
        return true;
      });
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(p => {
        if ((p.title || '').toLowerCase().includes(q)) return true;
        const e = repKeywords[p.id];
        if (e?.keyword && e.keyword.toLowerCase().includes(q)) return true;
        if ((e?.candidates || []).some(k => k.toLowerCase().includes(q))) return true;
        return false;
      });
    }
    const arr = [...list];
    arr.sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      const ta = new Date((a.date || '').replace(/\./g, '-')).getTime() || 0;
      const tb = new Date((b.date || '').replace(/\./g, '-')).getTime() || 0;
      return sortBy === 'oldest' ? ta - tb : tb - ta;
    });
    return arr;
  }, [periodPosts, statusFilter, searchQuery, sortBy, repKeywords, postTier]);

  // 요약 카드 집계 (기간 내 실제 DB 데이터 기준 — 임의 숫자 금지, 스펙 #3/#4)
  const summary = useMemo(() => {
    let repDone = 0;
    let top10 = 0;
    let top30 = 0;
    let unknown = 0;
    for (const p of periodPosts) {
      if (repKeywords[p.id]?.keyword) repDone++;
      const s = postTier(p);
      if (s === 'top10') top10++;
      if (s === 'top10' || s === 'top30') top30++;
      if (s === 'unknown' || s === 'error') unknown++;
    }
    return { total: periodPosts.length, repDone, top10, top30, unknown };
  }, [periodPosts, repKeywords, postTier]);

  const basisLabel = rankBasis === 'blog' ? '블로그' : rankBasis === 'influencer' ? '인플루언서' : '통합검색';

  const STATUS_META: Record<'top10' | 'top30' | 'top100' | 'out' | 'unknown' | 'error', { label: string; cls: string }> = {
    top10: { label: 'TOP 10', cls: 'text-up bg-up/10' },
    top30: { label: 'TOP 30', cls: 'text-accent bg-accent/10' },
    top100: { label: 'TOP 100', cls: 'text-amber-600 bg-amber-500/15' },
    out: { label: '순위권 밖', cls: 'text-down bg-down/10' },
    unknown: { label: '미확인', cls: 'text-dim bg-border/30' },
    error: { label: '확인실패', cls: 'text-dim bg-border/40' },
  };
  const STATUS_FILTER_OPTIONS: SegmentOption<StatusKey>[] = [
    { value: 'all', label: '전체' },
    { value: 'top10', label: 'TOP10' },
    { value: 'top30', label: 'TOP30' },
    { value: 'top100', label: 'TOP100' },
    { value: 'out', label: '순위권 밖' },
    { value: 'unknown', label: '미확인' },
  ];

  const toggleSecondary = (postId: string) => setExpandedSecondary(prev => {
    const next = new Set(prev);
    if (next.has(postId)) next.delete(postId); else next.add(postId);
    return next;
  });

  // 기간 변경: 30일 이전(확장)으로 넘어가면 자동조회하지 않고 확인 모달을 띄운다(스펙 #8).
  const handlePeriodChange = (n: number) => {
    setCustomFrom('');
    setCustomTo('');
    if (isExtendedPeriod(n) && !isExtendedPeriod(period) && !usingCustomRange) {
      setExtendPrompt(n);
    } else {
      setPeriod(n);
    }
  };

  // 대표키워드 직접 수정 저장 → keyword_source=manual (자동추출이 덮어쓰지 않음, 스펙 #15)
  const saveManualRep = async () => {
    if (!editRep || !profile) return;
    const kw = editRep.value.trim();
    if (!kw) return;
    setSavingRep(true);
    try {
      const post = blogPosts.find(p => p.id === editRep.postId);
      const res = await fetch('/api/blog/representative-keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, postId: editRep.postId, keyword: kw, title: post?.title }),
      });
      if (!res.ok) { showError('대표 키워드 저장에 실패했습니다.', 4000); return; }
      const data = await res.json();
      setRepKeywords(prev => ({
        ...prev,
        [editRep.postId]: {
          keyword: data.representativeKeyword || kw,
          source: 'manual',
          candidates: data.keywords || [kw],
          candidateScreen: [],
          autoKeywords: data.autoKeywords || [],
        },
      }));
      setEditRep(null);
    } catch {
      showError('네트워크 오류로 저장하지 못했습니다.', 4000);
    } finally {
      setSavingRep(false);
    }
  };

  // 로딩
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 bg-border/30 rounded animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-border/20 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // 무료 하루 3회 조회 초과 — 데이터 대신 안내 화면 (서버가 402로 순위 데이터를 반환하지 않음)
  if (quota) {
    return <AnalysisQuotaNotice quota={quota} />;
  }

  // 비로그인(게스트): 강제 리다이렉트 없이 로그인 유도 빈 상태 — /my 게스트 화면과 동일 톤
  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <h1 className="type-page-title">키워드순위</h1>
        <p className="text-sm text-dim leading-relaxed">
          로그인하시면 본인의 작업 데이터를 저장하고 다른 기기에서도 이어서 작업할 수 있습니다.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/auth/login?redirect=/my/keyword-ranking"
            className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition-colors"
          >
            로그인
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 border border-border bg-surface font-semibold rounded-xl hover:border-accent transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  // 로그인했지만 블로그 미연결
  if (!profile || !profile.blogId) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <h1 className="type-page-title">키워드순위</h1>
        <p className="text-sm text-dim">블로그 주소가 필요합니다.</p>
        <Link href="/profile" className="inline-block px-6 py-3 bg-accent text-white font-bold rounded-xl">
          마이페이지에서 블로그 연결
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="px-4 py-3 rounded-xl bg-down/10 border border-down/30 text-down text-sm flex items-start gap-2">
          <span className="font-bold shrink-0">!</span>
          <span className="flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="text-down/70 hover:text-down cursor-pointer text-xs shrink-0" aria-label="닫기">✕</button>
        </div>
      )}

      {noticeMessage && (
        <div className="px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-dim text-sm flex items-start gap-2">
          <span className="flex-1">{noticeMessage}</span>
          <button onClick={() => setNoticeMessage('')} className="text-dim/70 hover:text-accent cursor-pointer text-xs shrink-0" aria-label="닫기">✕</button>
        </div>
      )}

      {/* 헤더 + 주요 실행 버튼 (스펙 #2/#22/#23) */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">키워드 순위</h2>
          <p className="text-xs text-dim mt-1">
            내 블로그 전체 포스팅의 대표키워드와 네이버 검색 순위를 확인합니다. · 전체 {blogPostsTotal.toLocaleString()}개
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {extractingAll ? (
            <CheckProgress current={extractProgress.current} total={extractProgress.total} label="대표키워드 추출 중" onStop={stopExtractingAll} />
          ) : checkingAll ? (
            <CheckProgress current={checkProgress.current} total={checkProgress.total} label="순위 확인 중" onStop={stopChecking} />
          ) : missingRepCount > 0 ? (
            <button
              onClick={extractAllRepresentative}
              disabled={postsLoading || blogPosts.length === 0}
              className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 text-sm"
              title="대표키워드가 없는 포스팅의 대표키워드를 자동 추출합니다"
            >
              대표키워드 {missingRepCount}개 추출
            </button>
          ) : (
            <button
              onClick={openRefreshEstimate}
              disabled={postsLoading || blogPosts.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 text-sm"
              title="조회 대상과 예상 요청 수를 먼저 확인한 뒤 순위를 갱신합니다 (30분에 1회)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></svg>
              순위 업데이트
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setMoreMenuOpen(v => !v)}
              className="px-2.5 py-2 rounded-xl border border-border text-dim hover:text-accent hover:border-accent/40 transition cursor-pointer text-sm"
              title="더보기"
            >
              ⋯
            </button>
            {moreMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                <div className="absolute right-0 mt-1 z-50 w-40 bg-surface border border-border rounded-xl shadow-lg py-1 text-sm">
                  {canDownload && (
                    <button onClick={() => { handleDownload(); setMoreMenuOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-bg text-dim cursor-pointer">CSV 다운로드</button>
                  )}
                  {canDownload && profile && (
                    <a href={`/api/downloads/my-keyword-ranking?blogId=${encodeURIComponent(profile.blogId)}`} onClick={() => setMoreMenuOpen(false)} className="block px-3 py-2 hover:bg-bg text-dim">전체 리포트</a>
                  )}
                  <button
                    onClick={() => { runReextractAll(); setMoreMenuOpen(false); }}
                    disabled={reextracting || !profile}
                    className="w-full text-left px-3 py-2 hover:bg-bg text-dim cursor-pointer disabled:opacity-50"
                  >
                    {reextracting ? '재추출 중...' : '대표키워드 다시 추출'}
                  </button>
                  <button onClick={() => { handleResetResults(); setMoreMenuOpen(false); }} className="w-full text-left px-3 py-2 hover:bg-bg text-down/70 cursor-pointer">초기화</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 요약 카드 (스펙 #3/#4) */}
      <SummaryCards
        loading={postsLoading}
        cards={[
          { key: 'total', label: '전체 포스팅', value: summary.total, color: 'accent' },
          { key: 'repDone', label: '대표키워드 완료', value: summary.repDone, color: 'accent', description: summary.total ? `${Math.round((summary.repDone / summary.total) * 100)}%` : undefined },
          { key: 'top10', label: `TOP 10 · ${basisLabel}`, value: summary.top10, color: 'up' },
          { key: 'top30', label: `TOP 30 · ${basisLabel}`, value: summary.top30, color: 'up' },
          { key: 'unknown', label: '미확인', value: summary.unknown, color: 'dim' },
        ]}
      />

      {/* 필터 영역 (스펙 #6/#7/#10/#11) */}
      <div className="flex flex-col gap-3">
        <PeriodFilter
          period={period}
          onPeriod={handlePeriodChange}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
          usingCustomRange={usingCustomRange}
          onResetCustom={() => { setCustomFrom(''); setCustomTo(''); }}
        />
        <SegmentedFilter options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
        <PostSearchBar value={searchQuery} onChange={setSearchQuery} placeholder="게시글 제목·대표키워드 검색">
          <select value={rankBasis} onChange={e => setRankBasis(e.target.value as Basis)} className={selectClass} title="순위 기준">
            <option value="integrated">순위 기준: 통합검색</option>
            <option value="blog">순위 기준: 블로그</option>
            <option value="influencer">순위 기준: 인플루언서</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'latest' | 'oldest' | 'title')} className={selectClass}>
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="title">제목순</option>
          </select>
        </PostSearchBar>
        {overallLastUpdated && (
          <span className="text-[11px] text-dim">키워드 순위 최근 업데이트: {timeAgo(overallLastUpdated)}</span>
        )}
      </div>

      {/* 테이블 (스펙 #12) */}
      <AnalyticsTableShell title="포스팅 목록" loading={postsLoading} count={`${displayList.length}개`}>
        {postsLoading ? (
          <div className="text-center py-10 text-dim text-sm">포스트를 불러오는 중...</div>
        ) : blogPosts.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">게시물을 수집하지 못했습니다.</div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">
            해당 조건의 포스팅이 없습니다.
            <br />
            <span className="text-xs">기간 또는 순위 필터를 변경해보세요.</span>
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1200px]">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-left px-5 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-56">대표키워드</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">발행일</th>
                    <th className="text-center px-2 py-3 font-semibold w-20">통합검색</th>
                    <th className="text-center px-2 py-3 font-semibold w-20">블로그</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">인플루언서</th>
                    <th className="text-right px-2 py-3 font-semibold w-20">검색량</th>
                    <th className="text-center px-2 py-3 font-semibold w-20">전일대비</th>
                    <th className="text-center px-2 py-3 font-semibold w-20">7일대비</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">상태</th>
                    <th className="text-right px-3 py-3 font-semibold w-28">마지막 확인</th>
                    <th className="text-center px-3 py-3 font-semibold w-32">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {displayList.map(post => {
                    const { rep, key, result, delta } = repResultOf(post);
                    const tier = postTier(post);
                    const meta = STATUS_META[tier];
                    const flashing = key ? flashKeys.has(key) : false;
                    const isExtracting = extractingRepId === post.id;
                    const isChecking = checkingKey === key;
                    const secondaries = (repKeywords[post.id]?.autoKeywords || []).filter(a => !a.isPrimary);
                    const expanded = expandedSecondary.has(post.id);
                    const isEditing = editOpen.has(post.id);
                    const prevDelta = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.prevRank ?? null, delta?.prevCheckedAt ?? null) : null;
                    const weekDelta = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.weekRank ?? null, delta?.weekCheckedAt ?? null) : null;
                    const manualKeywords = (postKeywords[post.id] || []).map(k => k.trim()).filter(Boolean);
                    return (
                      <Fragment key={post.id}>
                        <tr className="hover:bg-surface-hover transition align-top">
                          <td className="px-5 py-3.5">
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="font-semibold truncate block max-w-[300px] hover:text-accent transition" title={post.title}>
                              {post.title}
                            </a>
                          </td>
                          <td className={`px-3 py-3.5 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>
                            <div className="space-y-1">
                              {rep ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full shrink-0">대표</span>
                                  <button onClick={() => setDetail({ post, keyword: rep })} className="text-xs font-semibold truncate hover:text-accent hover:underline cursor-pointer text-left max-w-[140px]" title={`${rep} — 상세 보기`}>{rep}</button>
                                  {repKeywords[post.id]?.source === 'manual' && <span className="text-[9px] text-dim shrink-0" title="직접 지정">수동</span>}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-dim">{isExtracting ? '추출 중…' : '대표키워드 미확인'}</span>
                                  {!isExtracting && (
                                    <>
                                      <button onClick={() => handleExtractRepresentative(post)} className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full hover:bg-accent/20 cursor-pointer">추출</button>
                                      <button onClick={() => setEditRep({ postId: post.id, value: '' })} className="text-[10px] font-bold text-dim border border-border px-2 py-0.5 rounded-full hover:text-accent hover:border-accent/50 cursor-pointer" title="대표키워드를 직접 입력합니다">직접 설정</button>
                                    </>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-[10px] flex-wrap">
                                {secondaries.length > 0 && (
                                  <button onClick={() => toggleSecondary(post.id)} className="text-dim hover:text-accent cursor-pointer">보조 {secondaries.length}개 {expanded ? '▲' : '▼'}</button>
                                )}
                                {rep && (
                                  <>
                                    <button onClick={() => setEditRep({ postId: post.id, value: rep })} className="text-dim hover:text-accent cursor-pointer">수정</button>
                                    <button onClick={() => handleExtractRepresentative(post)} disabled={isExtracting} className="text-dim hover:text-accent cursor-pointer disabled:opacity-40" title="대표키워드 다시 추출">{isExtracting ? '추출 중…' : '재추출'}</button>
                                  </>
                                )}
                                <button onClick={() => toggleEdit(post.id)} className="font-bold text-accent hover:underline cursor-pointer" title="이 포스팅에서 추가로 추적할 키워드를 등록합니다">
                                  {isEditing ? '편집 닫기' : `+ 키워드 추가${manualKeywords.length > 0 ? ` (${manualKeywords.length})` : ''}`}
                                </button>
                              </div>
                              {expanded && secondaries.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {secondaries.map(ak => {
                                    const kres = rankingResults[rankKey(post.id, ak.keyword)];
                                    const kchecking = checkingKey === rankKey(post.id, ak.keyword);
                                    return (
                                      <KeywordChip
                                        key={ak.keyword}
                                        label={ak.keyword}
                                        rankText={rankCellText(kres, kres?.viewTab)}
                                        tone="secondary"
                                        checking={kchecking}
                                        disabled={checkingAll || kchecking}
                                        onOpen={() => setDetail({ post, keyword: ak.keyword })}
                                        onCheck={() => checkSingleKeyword(post, ak.keyword, true, { keywordType: ak.keywordType, isPrimary: ak.isPrimary, baseKeyword: ak.baseKeyword, postUrl: post.url })}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                              {manualKeywords.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {manualKeywords.map(kw => {
                                    const kres = rankingResults[rankKey(post.id, kw)];
                                    const kchecking = checkingKey === rankKey(post.id, kw);
                                    return (
                                      <KeywordChip
                                        key={kw}
                                        label={kw}
                                        rankText={rankCellText(kres, kres?.viewTab)}
                                        tone="manual"
                                        checking={kchecking}
                                        disabled={checkingAll || kchecking}
                                        onOpen={() => setDetail({ post, keyword: kw })}
                                        onCheck={() => checkSingleKeyword(post, kw, true)}
                                      />
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="text-right px-3 py-3.5 text-xs text-dim whitespace-nowrap">{post.date}</td>
                          <td className={`text-center px-2 py-3.5 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>{renderRankTab(result, result?.viewTab)}</td>
                          <td className={`text-center px-2 py-3.5 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>{renderRankTab(result, result?.blogTab)}</td>
                          <td className={`text-center px-2 py-3.5 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>{renderRankTab(result, result?.influencerTab)}</td>
                          <td className="text-right px-2 py-3.5 text-xs text-dim">{result?.searchVolume ? result.searchVolume.toLocaleString() : '--'}</td>
                          <td className="text-center px-2 py-3.5">
                            {prevDelta ? <span className={`text-xs font-bold ${prevDelta.colorClass}`} title={prevDelta.tooltip}>{prevDelta.label}</span> : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className="text-center px-2 py-3.5">
                            {weekDelta ? <span className={`text-xs font-bold ${weekDelta.colorClass}`} title={weekDelta.tooltip}>{weekDelta.label}</span> : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className="text-center px-2 py-3.5">
                            {isChecking ? <StatusBadge label="분석중" cls="text-blue bg-blue/10" /> : <StatusBadge label={meta.label} cls={meta.cls} />}
                          </td>
                          <td className="text-right px-3 py-3.5">
                            <span className="text-[10px] text-dim" title={result?.checkedAt ? new Date(result.checkedAt).toLocaleString('ko-KR') : ''}>{result?.checkedAt ? timeAgo(result.checkedAt) : '--'}</span>
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => rep && setDetail({ post, keyword: rep })} disabled={!rep} className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer disabled:opacity-40">상세</button>
                              <button onClick={() => rep && checkSingleKeyword(post, rep, true)} disabled={!rep || checkingAll || isChecking} className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer disabled:opacity-40">{isChecking ? '검사 중' : '다시 검사'}</button>
                              <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                            </div>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr key={`${post.id}-edit`} className="bg-bg/40">
                            <td colSpan={12} className="px-5 py-3">{renderManualKeywordEditor(post)}</td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 (스펙 #29) */}
            <div className="md:hidden divide-y divide-border/20">
              {displayList.map(post => {
                const { rep, result, delta } = repResultOf(post);
                const tier = postTier(post);
                const meta = STATUS_META[tier];
                const isExtracting = extractingRepId === post.id;
                const isEditing = editOpen.has(post.id);
                const manualKeywords = (postKeywords[post.id] || []).map(k => k.trim()).filter(Boolean);
                const mSecondaries = (repKeywords[post.id]?.autoKeywords || []).filter(a => !a.isPrimary);
                const mPrev = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.prevRank ?? null, delta?.prevCheckedAt ?? null) : null;
                const mWeek = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.weekRank ?? null, delta?.weekCheckedAt ?? null) : null;
                return (
                  <div key={post.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm hover:text-accent transition line-clamp-2 flex-1">{post.title}</a>
                      <StatusBadge label={meta.label} cls={meta.cls} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {rep ? (
                        <>
                          <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full shrink-0">대표</span>
                          <button onClick={() => setDetail({ post, keyword: rep })} className="text-xs font-semibold truncate hover:text-accent hover:underline cursor-pointer text-left">{rep}</button>
                          <button onClick={() => setEditRep({ postId: post.id, value: rep })} className="text-[10px] text-dim hover:text-accent cursor-pointer ml-auto shrink-0">수정</button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-dim">{isExtracting ? '추출 중…' : '대표키워드 미확인'}</span>
                          {!isExtracting && (
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button onClick={() => handleExtractRepresentative(post)} className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full hover:bg-accent/20 cursor-pointer">추출</button>
                              <button onClick={() => setEditRep({ postId: post.id, value: '' })} className="text-[10px] font-bold text-dim border border-border px-2 py-0.5 rounded-full hover:text-accent hover:border-accent/50 cursor-pointer">직접 설정</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {result && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {renderRankPill('통합', result, result.viewTab)}
                        {renderRankPill('블로그', result, result.blogTab)}
                        {renderRankPill('인플루언서', result, result.influencerTab)}
                        <span className="text-[10px] text-dim ml-auto" title={result.checkedAt ? new Date(result.checkedAt).toLocaleString('ko-KR') : ''}>{result.checkedAt ? timeAgo(result.checkedAt) : ''}</span>
                      </div>
                    )}
                    {mPrev && mWeek && (
                      <div className="flex items-center gap-3 text-[10px] text-dim">
                        <span title={mPrev.tooltip}>전일대비 <b className={mPrev.colorClass}>{mPrev.label}</b></span>
                        <span title={mWeek.tooltip}>7일대비 <b className={mWeek.colorClass}>{mWeek.label}</b></span>
                      </div>
                    )}
                    {(mSecondaries.length > 0 || manualKeywords.length > 0) && (
                      <div className="flex flex-wrap gap-1">
                        {mSecondaries.map(ak => {
                          const kres = rankingResults[rankKey(post.id, ak.keyword)];
                          const kchecking = checkingKey === rankKey(post.id, ak.keyword);
                          return (
                            <KeywordChip
                              key={ak.keyword}
                              label={ak.keyword}
                              rankText={rankCellText(kres, kres?.viewTab)}
                              tone="secondary"
                              checking={kchecking}
                              disabled={checkingAll || kchecking}
                              onOpen={() => setDetail({ post, keyword: ak.keyword })}
                              onCheck={() => checkSingleKeyword(post, ak.keyword, true, { keywordType: ak.keywordType, isPrimary: ak.isPrimary, baseKeyword: ak.baseKeyword, postUrl: post.url })}
                            />
                          );
                        })}
                        {manualKeywords.map(kw => {
                          const kres = rankingResults[rankKey(post.id, kw)];
                          const kchecking = checkingKey === rankKey(post.id, kw);
                          return (
                            <KeywordChip
                              key={kw}
                              label={kw}
                              rankText={rankCellText(kres, kres?.viewTab)}
                              tone="manual"
                              checking={kchecking}
                              disabled={checkingAll || kchecking}
                              onOpen={() => setDetail({ post, keyword: kw })}
                              onCheck={() => checkSingleKeyword(post, kw, true)}
                            />
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs">
                      <button onClick={() => rep && setDetail({ post, keyword: rep })} disabled={!rep} className="text-dim hover:text-accent font-semibold cursor-pointer disabled:opacity-40">상세</button>
                      <button onClick={() => rep && checkSingleKeyword(post, rep, true)} disabled={!rep || checkingAll} className="text-dim hover:text-accent font-semibold cursor-pointer disabled:opacity-40">다시 검사</button>
                      <button onClick={() => toggleEdit(post.id)} className="text-accent font-semibold cursor-pointer ml-auto">
                        {isEditing ? '편집 닫기' : `+ 키워드 추가${manualKeywords.length > 0 ? ` (${manualKeywords.length})` : ''}`}
                      </button>
                    </div>
                    {isEditing && (
                      <div className="rounded-xl bg-bg/40 p-3">{renderManualKeywordEditor(post)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </AnalyticsTableShell>

      {/* 임의 키워드 검색 — 기존 로직 유지 */}
      <GlassCard padding="none">
        <button onClick={() => setShowKeywordSearch(v => !v)} className="w-full flex items-center justify-between px-5 py-4 cursor-pointer">
          <div className="text-left">
            <h3 className="font-bold text-[15px]">임의 키워드 검색</h3>
            <p className="text-[11px] text-dim mt-0.5">등록된 포스팅과 무관하게 원하는 키워드의 순위를 바로 조회</p>
          </div>
          <span className={`text-dim transition-transform ${showKeywordSearch ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {showKeywordSearch && (
          <div className="border-t border-border/50 p-4">
            <BlogRankingClient />
          </div>
        )}
      </GlassCard>

      {/* '지금 업데이트' 예상치 확인 모달 (스펙 #11/#14) */}
      {refreshEstimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!refreshStarting) setRefreshEstimate(null); }}>
          <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1">순위 업데이트 확인</h3>
            <p className="text-xs text-dim mb-4">무조건 전체를 조회하지 않고, 아래 대상만 네이버 검색으로 순위를 확인합니다.</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-dim">조회 대상</span><span className="font-bold">{refreshEstimate.target}개</span></div>
              <div className="flex justify-between"><span className="text-dim">최근 조회 캐시 제외</span><span className="font-bold">{refreshEstimate.fresh}개</span></div>
              <div className="flex justify-between"><span className="text-accent">순위 확인 필요</span><span className="font-bold text-accent">{refreshForceAll ? refreshEstimate.target : refreshEstimate.stale}개</span></div>
              <div className="flex justify-between"><span className="text-dim">예상 검색 요청</span><span className="font-bold">약 {(refreshForceAll ? refreshEstimate.target : refreshEstimate.stale) * 3}회</span></div>
            </div>
            <p className="text-[11px] text-dim mt-1.5">키워드당 통합·블로그·인플루언서 3개 탭을 검색결과 화면에서 실측(HTML)합니다.</p>
            <label className="flex items-center gap-2 mt-3 text-xs text-dim cursor-pointer select-none">
              <input type="checkbox" checked={refreshForceAll} onChange={e => setRefreshForceAll(e.target.checked)} className="accent-accent w-3.5 h-3.5" />
              캐시 무시하고 전체({refreshEstimate.target}개) 다시 조회
            </label>
            {refreshEstimate.stale === 0 && !refreshForceAll && (
              <p className="text-[11px] text-accent mt-2">모든 키워드가 최신입니다(최근 10분 내 조회). 다시 조회하려면 위 옵션을 선택하세요.</p>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setRefreshEstimate(null)} disabled={refreshStarting} className="flex-1 px-4 py-2 rounded-xl border border-border text-dim font-bold text-sm hover:bg-bg transition cursor-pointer disabled:opacity-50">취소</button>
              <button onClick={confirmRefresh} disabled={refreshStarting || (refreshEstimate.stale === 0 && !refreshForceAll)} className="flex-1 px-4 py-2 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">{refreshStarting ? '시작 중…' : '조회 시작'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 30일 이전(확장 기간) 확인 모달 (스펙 #8) */}
      {extendPrompt !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExtendPrompt(null)}>
          <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1">이전 포스팅도 확인하시겠습니까?</h3>
            <p className="text-xs text-dim mb-4">최근 30일 이후({periodLabel(extendPrompt)}) 포스팅까지 함께 표시합니다. 순위 조회는 &lsquo;순위 업데이트&rsquo;에서 별도로 실행됩니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setExtendPrompt(null)} className="flex-1 px-4 py-2 rounded-xl border border-border text-dim font-bold text-sm hover:bg-bg transition cursor-pointer">취소</button>
              <button onClick={() => { setPeriod(extendPrompt); setExtendPrompt(null); }} className="flex-1 px-4 py-2 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition cursor-pointer">확인</button>
            </div>
          </div>
        </div>
      )}

      {/* 대표키워드 직접 수정 모달 (스펙 #15) */}
      {editRep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!savingRep) setEditRep(null); }}>
          <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-1">대표 키워드 직접 수정</h3>
            <p className="text-xs text-dim mb-3">직접 입력한 대표키워드는 자동 추출로 덮어쓰지 않습니다.</p>
            <input
              type="text"
              value={editRep.value}
              onChange={e => setEditRep({ postId: editRep.postId, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveManualRep(); }}
              maxLength={40}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-border bg-bg text-sm focus:border-accent outline-none"
              placeholder="대표 키워드"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditRep(null)} disabled={savingRep} className="flex-1 px-4 py-2 rounded-xl border border-border text-dim font-bold text-sm hover:bg-bg transition cursor-pointer disabled:opacity-50">취소</button>
              <button onClick={saveManualRep} disabled={savingRep || !editRep.value.trim()} className="flex-1 px-4 py-2 rounded-xl bg-accent text-white font-bold text-sm hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">{savingRep ? '저장 중…' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 키워드 상세 드로어 (스펙 #27) */}
      {detail && profile && (
        <KeywordDetailDrawer
          key={`${detail.post.id}::${detail.keyword}`}
          blogId={profile.blogId}
          post={detail.post}
          keyword={detail.keyword}
          result={rankingResults[rankKey(detail.post.id, detail.keyword)]}
          delta={rankDeltas[rankKey(detail.post.id, detail.keyword)]}
          meta={keywordMeta[rankKey(detail.post.id, detail.keyword)]}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
