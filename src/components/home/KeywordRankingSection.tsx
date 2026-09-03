'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import GlassCard from '@/components/dashboard/GlassCard';
import KeywordDetailDrawer from './KeywordDetailDrawer';
import { useAuth } from '@/hooks/useAuth';
import { planAtLeast, toPlanKey } from '@/lib/plans';
import { useMemberOnlyGate } from '@/contexts/MemberOnlyGateContext';
import { rowsToCsv, downloadCsvInBrowser, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';
import BlogRankingClient from '@/app/keywords/blog-ranking/BlogRankingClient';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { BloggerProfile, BlogPost, RankingResult, RankDelta, SyncedState, KeywordRankLookupRow, RepKeywordEntry, AutoKeyword, KeywordMeta, KeywordRow } from './KeywordRankingSection.helpers';
import { newViewToken, viewHeaders, type QuotaInfo } from '@/lib/analysis-view';
import { extractRepresentativeKeyword, extractRepresentativeKeywordsBulk, BULK_EXTRACT_CHUNK } from '@/lib/representative-keyword-client';
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
  buildKeywordRows,
  normalizeForCompare,
  KIND_META,
  MAX_KEYWORDS_PER_POST,
} from './KeywordRankingSection.helpers';
// 분석 화면 공용 디자인 시스템 — 골격(DashboardLayout) · 필터 바 · 표 · 지표 카드를 그대로 쓴다.
import {
  AddKeywordControl,
  ConfirmDialog,
  DashboardLayout,
  DataTable,
  FilterControlBar,
  POST_SORT_OPTIONS,
  selectControlClass,
  isExtendedPeriod,
  periodLabel,
  StatusBadge,
  CheckProgress,
  MoreMenu,
  menuItemClass,
  menuLinkClass,
  menuItemDangerClass,
  actionButtonSecondaryClass,
  type DataTableColumn,
  type SegmentOption,
  type StatusTone,
} from '@/components/analytics';

type StatusKey = 'all' | 'top10' | 'top30' | 'top100' | 'changed' | 'out' | 'unknown';

// 상태 배지는 공용 상태 토큰(tone)만 쓴다 — 화면마다 임의 색을 두지 않기 위함.
const STATUS_META: Record<'top10' | 'top30' | 'top100' | 'out' | 'unknown' | 'error', { label: string; tone: StatusTone }> = {
  top10: { label: 'TOP 10', tone: 'success' },
  top30: { label: 'TOP 30', tone: 'accent' },
  top100: { label: 'TOP 100', tone: 'warning' },
  out: { label: '순위권 밖', tone: 'danger' },
  unknown: { label: '미확인', tone: 'neutral' },
  error: { label: '확인실패', tone: 'neutral' },
};

const STATUS_FILTER_OPTIONS: SegmentOption<StatusKey>[] = [
  { value: 'all', label: '전체' },
  { value: 'top10', label: 'TOP10' },
  { value: 'top30', label: 'TOP30' },
  { value: 'top100', label: 'TOP100' },
  { value: 'changed', label: '순위변동' },
  { value: 'out', label: '순위권 밖' },
  { value: 'unknown', label: '미확인' },
];

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
  /** 포스팅 조회가 실패했는가. '수집된 글 0개'와 반드시 구분해야 하는 상태다. */
  const [postsFailed, setPostsFailed] = useState(false);

  // postId → 이 포스팅에 등록된 전체 키워드 배열 (대표·보조·추가 모두 — keyword_rank_lookups 의 사본)
  // ⚠️ 저장(PUT)은 "이 목록에 없는 키워드는 삭제"이므로, 부분 목록을 저장하면 자동추출분이 지워진다.
  const [postKeywords, setPostKeywords] = useState<Record<string, string[]>>({});
  // 키워드 컬럼에서 직접 추가 중인 포스팅 (postId) + 입력값
  const [addingFor, setAddingFor] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  // 등록 실패 사유는 입력창 바로 아래에 띄운다.
  // 상단 배너로만 알리면 표 중간에서 등록한 사용자에겐 화면 밖이라 "버튼이 안 눌린다"로 보인다.
  const [addError, setAddError] = useState('');
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
  // 검사 중인 키. 행마다 따로 재검사할 수 있으므로 집합으로 둔다 — 단일 문자열이면
  // 두 행을 잇달아 눌렀을 때 먼저 끝난 쪽이 아직 도는 행의 '검사 중' 표시까지 지운다.
  const [checkingKeys, setCheckingKeys] = useState<ReadonlySet<string>>(() => new Set());
  // 자동/수동 백그라운드 일괄 갱신 진행 여부 (화면을 막지 않는 작은 표시용)
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  // 배치 시작 시각 — 진행률 pill이 실제 경과 속도로 남은 시간을 추정하는 데 쓴다(추출·순위확인 동시 실행 없음)
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
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
  // 키워드 상세 드로어 대상 (스펙 #27)
  const [detail, setDetail] = useState<{ post: BlogPost; keyword: string } | null>(null);

  // ── 노출 현황과 동일한 필터/정렬 상태 (스펙 #5~#11) ──
  const [period, setPeriod] = useState(30); // 기본 30일 (0 = 전체)
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all');
  type Basis = 'integrated' | 'blog' | 'influencer';
  const [rankBasis, setRankBasis] = useState<Basis>('integrated'); // 순위 기준(기본 통합검색, 스펙 #5)
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'title'>('latest');
  const [reextracting, setReextracting] = useState(false);
  // '대표키워드 추출' 확인 패널 — 순위 업데이트와 같은 방식으로 대상 수를 먼저 보여준 뒤 실행한다.
  const [extractPrompt, setExtractPrompt] = useState<{ missing: number; stored: number } | null>(null);
  const [extractIncludeStored, setExtractIncludeStored] = useState(false);
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
  const repKeywordsRef = useRef<Record<string, RepKeywordEntry>>({});
  // 페이지 진입 시 자동 추출(스펙 #8) 제어용 — 중복 실행 방지 + 세션 내 재시도 방지 + 언마운트/페이지전환 중단
  const autoExtractRunningRef = useRef(false);
  const autoExtractAbortRef = useRef(false);
  const autoExtractDoneRef = useRef<Set<string>>(new Set());

  const keywordMetaRef = useRef<Record<string, KeywordMeta>>({});

  useEffect(() => { rankingResultsRef.current = rankingResults; }, [rankingResults]);
  useEffect(() => { postKeywordsRef.current = postKeywords; }, [postKeywords]);
  useEffect(() => { repKeywordsRef.current = repKeywords; }, [repKeywords]);
  useEffect(() => { keywordMetaRef.current = keywordMeta; }, [keywordMeta]);

  const showError = useCallback((msg: string, ms = 5000) => {
    setErrorMessage(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMessage(''), ms);
  }, []);

  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    Object.values(flashTimersRef.current).forEach(clearTimeout);
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
  // 세션이 끊겨 401 이 오면 "잠시 후 다시 시도" 같은 안내는 거짓말이 된다 — 기다려도 절대 풀리지 않는다.
  // 미노출 화면(MissingPostsSection)은 같은 상황에서 이미 로그인 게이트를 띄우고 있어서 동작을 맞춘다.
  const { openGate } = useMemberOnlyGate();
  const isLoggedIn = !!(user.id || user.authId);
  const canDownload = user.isAdmin || planAtLeast(toPlanKey(user.subscriptionPlan), 'max');

  // CSV도 화면과 동일하게 (포스팅 제목, 키워드)를 각각 독립 컬럼으로 내보낸다.
  const handleDownload = () => {
    if (!canDownload) return;
    const headers = ['포스팅 제목', '키워드', '키워드 종류', '작성일', '통합검색', '블로그탭', '인플탭', '검색량', '전일대비', '7일대비', '마지막 확인'];
    const rows: unknown[][] = [];
    for (const post of blogPosts) {
      for (const row of keywordRowsFor(post)) {
        if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
        const key = rankKey(post.id, row.keyword);
        const result = rankingResults[key];
        const delta = rankDeltas[key];
        const prevDelta = computeDeltaDisplay(result?.viewTab.exposed ?? false, result?.viewTab.rank ?? null, delta?.prevRank ?? null, delta?.prevCheckedAt ?? null);
        const weekDelta = computeDeltaDisplay(result?.viewTab.exposed ?? false, result?.viewTab.rank ?? null, delta?.weekRank ?? null, delta?.weekCheckedAt ?? null);
        rows.push([
          post.title,
          row.keyword,
          KIND_META[row.kind].label,
          post.date ?? '',
          rankCellText(result, result?.viewTab),
          rankCellText(result, result?.blogTab),
          rankCellText(result, result?.influencerTab),
          result?.searchVolume ?? '',
          result ? prevDelta.label : '-',
          result ? weekDelta.label : '-',
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
      // 1. 프론트엔드 상태 초기화 — 저장된 키워드 전부 삭제 (로컬 상태)
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
  }, [profile, showError, queryClient]);

  // 노출 현황과 동일하게 전체 포스팅을 한 번에 로드하고 클라이언트에서 기간/상태/검색으로 필터한다(스펙 #2/#24).
  // 조회 실패를 조용히 삼키면 blogPosts 가 [] 로 남고, 그게 '글이 0개'와 구별되지 않는다.
  // 실패 여부를 들고 있어야 빈 표에 "못 불러왔다(다시 시도)"와 "수집된 글이 없다"를 갈라 쓸 수 있다.
  const fetchBlogPosts = useCallback(async (blogId: string) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&all=true`);
      if (!res.ok) { setPostsFailed(true); return; }
      const data = await res.json();
      const posts: BlogPost[] = data.posts || [];
      setPostsFailed(false);
      setBlogPosts(posts);
      setBlogPostsTotal(data.totalCount || posts.length);
    } catch { setPostsFailed(true); }
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
    }
  }, [syncedState]);

  const checkSingleKeyword = useCallback(async (
    post: BlogPost,
    keyword: string,
    force = false,
    meta?: KeywordMeta,
  ): Promise<{ ok: boolean; status: number; cached: boolean }> => {
    if (!profile || !keyword.trim()) return { ok: false, status: 0, cached: false };
    const key = rankKey(post.id, keyword.trim());
    setCheckingKeys(prev => new Set(prev).add(key));
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
      // 401/402 는 '실패'가 아니라 '시작할 수 없음'이다. 기다린다고 풀리지 않으므로
      // "잠시 후 다시 시도"라고 말하면 안 된다. 예전에는 둘 다 `오류 401`·`오류 402` 라는
      // HTTP 상태 코드가 그대로 화면에 나가서, 로그인이 끊긴 건지 크레딧이 없는 건지
      // 알 수 없었다. (미노출 화면은 같은 엔드포인트에서 이미 이렇게 구분하고 있다.)
      if (res.status === 401) {
        openGate('/my/keyword-ranking');
      } else if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        const detail = (typeof d.required === 'number' && typeof d.balance === 'number')
          ? ` (필요 ${d.required} · 보유 ${d.balance})`
          : '';
        showError(`크레딧이 부족해 순위를 확인하지 못했습니다${detail}. 구독 페이지에서 충전할 수 있습니다.`, 8000);
      } else if (res.status === 429) {
        showError('요청이 너무 많습니다. 5분 후 다시 시도해주세요.');
      } else {
        showError('순위를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
      return { ok: false, status: res.status, cached: false };
    } catch {
      showError('네트워크 오류로 순위를 확인하지 못했습니다.');
      return { ok: false, status: 0, cached: false };
    } finally {
      setCheckingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [profile, showError, flashCell, queryClient, openGate]);

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
    // AI 브리핑·AI 탭 화면과 같은 추출 경로를 쓴다(추출 옵션이 어긋나 두 화면의 대표 키워드가
    // 달라지는 것을 막기 위해 호출을 lib 한 곳으로 모음).
    const data = await extractRepresentativeKeyword(profile.blogId, post, opts);
    if (!data) return null;
    setRepKeywords(prev => ({
      ...prev,
      [post.id]: {
        keyword: data.keyword,
        source: data.source,
        candidates: data.candidates,
        candidateScreen: data.candidateScreen,
        autoKeywords: data.autoKeywords,
      },
    }));
    return { keyword: data.keyword, autoKeywords: data.autoKeywords };
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

  // 대표 키워드가 아직 없는 포스팅을 일괄 추출한다("대표키워드 추출" 버튼). 순위조회는 별도(스펙 #9).
  // 포스팅당 1회씩 호출하던 것을 서버 배치(/api/my/representative-keywords/extract)로 묶어
  // 25개씩 전송한다 — 추출 규칙과 저장 위치는 개별 추출과 동일(post_representative_keywords).
  const extractAllRepresentative = useCallback(async () => {
    if (!profile || extractingAll) return false;
    const targets = blogPosts.filter(p => !repKeywordsRef.current[p.id]?.keyword);
    if (targets.length === 0) return true;

    setExtractingAll(true);
    extractAbortRef.current = false;
    setExtractProgress({ current: 0, total: targets.length });
    setBatchStartedAt(Date.now());

    let done = 0;
    let ok = true;
    // 서버가 시간예산을 넘겨 일부를 남기면(skipped) 남은 만큼 다음 회차로 다시 보낸다.
    const queue = [...targets];
    while (queue.length > 0) {
      // 사용자가 '중지'를 누르면 여기서 끝낸다. ok=false 로 돌려 뒤따르는 재추출까지 이어지지 않게 한다.
      if (extractAbortRef.current) { ok = false; break; }
      const chunk = queue.slice(0, BULK_EXTRACT_CHUNK);
      const res = await extractRepresentativeKeywordsBulk(
        profile.blogId,
        chunk.map(p => ({ id: p.id, title: p.title })),
      );
      if (!res) {
        showError('대표키워드 일괄 추출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        ok = false;
        break;
      }

      setRepKeywords(prev => {
        const next = { ...prev };
        for (const [postId, r] of Object.entries(res.results)) {
          next[postId] = {
            keyword: r.keyword,
            source: r.source,
            candidates: r.candidates,
            candidateScreen: r.candidateScreen,
            autoKeywords: r.autoKeywords,
          };
        }
        return next;
      });

      // 실제로 결과가 돌아온 것만 큐에서 뺀다(개별 실패분도 여기서 걸러진다).
      const extracted = new Set(Object.keys(res.results));
      const remaining = chunk.filter(p => !extracted.has(p.id));
      if (remaining.length === chunk.length) {
        // 한 건도 처리되지 않으면 다시 보내도 같은 결과 → 무한루프 대신 중단한다.
        showError('일부 포스팅의 대표키워드를 추출하지 못했습니다. 잠시 후 다시 시도해주세요.');
        ok = false;
        break;
      }
      queue.splice(0, chunk.length, ...remaining);
      done += chunk.length - remaining.length;
      setExtractProgress({ current: Math.min(done, targets.length), total: targets.length });
    }

    setExtractingAll(false);
    setBatchStartedAt(null);
    // 서버가 확정한 값으로 다시 맞춘다(다른 화면·기기와 같은 대표 키워드를 보게 유지)
    queryClient.invalidateQueries({ queryKey: ['rep-keywords-state', profile.blogId] });
    return ok;
  }, [profile, blogPosts, extractingAll, showError, queryClient]);

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
      if (res.status === 401) { openGate('/my/keyword-ranking'); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showError(d.error || '대표키워드 재추출 중 오류가 발생했습니다.');
        return;
      }
      const data: { reextracted: number; changed: number; skippedManual: number } = await res.json();
      queryClient.invalidateQueries({ queryKey: ['rep-keywords-state', profile.blogId] });
      setNoticeMessage(`대표키워드 ${data.reextracted}건 재추출 완료 (${data.changed}건 변경, 직접 지정 ${data.skippedManual}건 유지). 변경된 포스팅은 순위를 다시 확인해 주세요.`);
    } catch {
      showError('대표키워드 재추출 중 오류가 발생했습니다.');
    } finally {
      setReextracting(false);
    }
  }, [profile, reextracting, showError, queryClient]);

  // 주 실행 버튼 '대표키워드 추출' — 무조건 돌리지 않고 대상 수(미추출/저장됨)를 먼저 보여준다.
  const openExtractPrompt = useCallback(() => {
    if (!profile || blogPosts.length === 0) return;
    const missing = blogPosts.filter(p => !repKeywordsRef.current[p.id]?.keyword).length;
    // 미추출이 하나도 없으면 사용자가 원하는 건 "현행 규칙으로 다시 뽑기"이므로 기본으로 켠다.
    setExtractIncludeStored(missing === 0);
    setExtractPrompt({ missing, stored: blogPosts.length - missing });
  }, [profile, blogPosts]);

  const confirmExtract = useCallback(async () => {
    const includeStored = extractIncludeStored;
    setExtractPrompt(null);
    const ok = await extractAllRepresentative();
    if (ok && includeStored) await runReextractAll();
  }, [extractIncludeStored, extractAllRepresentative, runReextractAll]);

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
    setBatchStartedAt(Date.now());

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
    setBatchStartedAt(null);
    refreshingRef.current = false;
  }, [checkSingleKeyword, showError]);

  // 포스팅의 "전체" 키워드 목록을 DB에 저장한다.
  // ⚠️ 서버 PUT은 "이 목록에 없는 키워드는 삭제" 시맨틱이므로, 반드시 대표·보조·추가를 모두 포함한
  //    전체 목록을 넘겨야 한다. 추가분만 넘기면 자동추출된 대표·보조 키워드의 순위 기록이 통째로 지워진다.
  const persistPostKeywords = useCallback(async (postId: string, keywords: string[]): Promise<boolean> => {
    if (!profile) return false;
    const prevSaved = postKeywordsRef.current[postId] || [];
    const applyLocal = (list: string[]) => setPostKeywords(prev => {
      if (list.length === 0) {
        const next = { ...prev };
        delete next[postId];
        return next;
      }
      return { ...prev, [postId]: list };
    });

    // 낙관적 반영 — 페이지 새로고침 없이 즉시 키워드 컬럼에 표시
    applyLocal(keywords);

    const ok = await saveKeywordsToDb(profile.blogId, postId, keywords);
    if (ok) {
      // 저장 성공분을 쿼리 캐시에도 즉시 반영 (백그라운드 refetch로 되돌아가는 경합 방지)
      queryClient.setQueryData(
        ['keyword-ranking-state', profile.blogId],
        (old: SyncedState | undefined) => {
          if (!old) return old;
          const nextKeywords = { ...old.postKeywords };
          if (keywords.length === 0) delete nextKeywords[postId];
          else nextKeywords[postId] = keywords;
          return { ...old, postKeywords: nextKeywords };
        },
      );
    } else {
      // 실패 시 화면을 되돌린다 (DB엔 없는데 화면에만 남는 유령 키워드 방지)
      applyLocal(prevSaved);
      showError('키워드 저장에 실패했습니다. 네트워크 확인 후 다시 시도해주세요.');
      queryClient.invalidateQueries({ queryKey: ['keyword-ranking-state', profile.blogId] });
    }
    return ok;
  }, [profile, queryClient, showError]);

  // 키워드 컬럼의 '＋ 키워드 추가' 등록 처리.
  // 포스팅 제목은 절대 수정하지 않는다 — (포스팅 1개 → 키워드 N개) 관계로 키워드 행만 추가한다.
  const submitAddKeyword = useCallback(async (post: BlogPost) => {
    const kw = addValue.trim();
    if (!kw || addSaving) return;
    setAddError('');

    const norm = normalizeForCompare(kw);
    const existing = postKeywordsRef.current[post.id] || [];
    // 대표·보조는 아직 순위조회 전이면 existing 에 없을 수 있으므로 추출 결과까지 합쳐 중복 검사한다.
    const known = new Set(
      [...existing, ...autoPairsFor(post).map(p => p.keyword)].map(normalizeForCompare),
    );
    if (known.has(norm)) {
      // 어떤 종류로 이미 있는지까지 알려준다. 특히 보조는 기본 접힘이라
      // "등록도 안 되고 목록에도 없는" 상태로 보여서 가장 헷갈린다 → 펼쳐서 실제 위치를 보여준다.
      const rep = repKeywordsRef.current[post.id];
      const auto = (rep?.autoKeywords || []).find(a => normalizeForCompare(a.keyword) === norm);
      const isPrimary = normalizeForCompare(rep?.keyword || '') === norm || !!auto?.isPrimary;
      if (auto && !auto.isPrimary) setExpandedSecondary(prev => new Set(prev).add(post.id));
      setAddError(
        isPrimary ? `'${kw}'는 이미 대표 키워드로 등록되어 있습니다.`
        : auto ? `'${kw}'는 이미 보조 키워드로 등록되어 있습니다. 아래 목록에서 확인하세요.`
        : `'${kw}'는 이미 이 포스팅에 등록된 키워드입니다.`,
      );
      return;
    }
    if (existing.length >= MAX_KEYWORDS_PER_POST) {
      setAddError(`이 포스팅은 키워드 ${MAX_KEYWORDS_PER_POST}개를 모두 사용했습니다. 기존 키워드를 삭제한 뒤 추가해주세요.`);
      return;
    }

    setAddSaving(true);
    const ok = await persistPostKeywords(post.id, [...existing, kw]);
    setAddSaving(false);
    if (!ok) {
      setAddError('저장에 실패했습니다. 네트워크 확인 후 다시 시도해주세요.');
      return;
    }

    setAddValue(''); // 입력창은 열어둔 채 비워서 연속 등록 가능
    // 등록 즉시 기존 순위 조회 로직 연결. 다른 배치가 실행 중이면 runBatch 가 건너뛰지만,
    // scanAndRefresh 가 60초 주기로 미확인 키워드를 다시 집어가므로 누락되지 않는다.
    runBatch([{ post, keyword: kw, meta: { keywordType: 'manual', postUrl: post.url } }]);
  }, [addValue, addSaving, autoPairsFor, persistPostKeywords, runBatch]);

  // 직접 추가한 키워드 삭제 — 해당 키워드의 순위 기록도 함께 정리한다.
  const removeManualKeyword = useCallback(async (post: BlogPost, keyword: string) => {
    if (!profile) return;
    if (!confirm(`'${keyword}' 키워드를 삭제하시겠습니까?\n이 키워드의 순위 기록도 함께 삭제됩니다.`)) return;

    const existing = postKeywordsRef.current[post.id] || [];
    const ok = await persistPostKeywords(post.id, existing.filter(k => k !== keyword));
    if (!ok) return;

    const key = rankKey(post.id, keyword);
    setRankingResults(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    queryClient.setQueryData(
      ['keyword-ranking-state', profile.blogId],
      (old: SyncedState | undefined) => {
        if (!old) return old;
        const nextResults = { ...old.rankingResults };
        delete nextResults[key];
        return { ...old, rankingResults: nextResults };
      },
    );
  }, [profile, persistPostKeywords, queryClient]);

  // 키워드 추가 입력창 열기/닫기 (한 번에 한 포스팅만 열린다)
  const openAddKeyword = (postId: string) => {
    setAddingFor(postId);
    setAddValue('');
    setAddError('');
  };
  const closeAddKeyword = () => {
    setAddingFor('');
    setAddValue('');
    setAddError('');
  };

  const stopChecking = () => {
    abortRef.current = true;
  };

  // 저장된 키워드(postKeywords)는 대표·보조·추가가 섞여 있으므로, 자동추출 메타를 먼저 확정한 뒤
  // 거기에 없는 것만 채운다. 순서를 뒤집으면 대표·보조 키워드에 keywordType='manual' 이 덮여
  // (PATCH가 메타를 갱신하므로) 자동추출분이 '추가'로 변질된다.
  const pairsForPost = useCallback((post: BlogPost): { post: BlogPost; keyword: string; meta?: KeywordMeta }[] => {
    const out: { post: BlogPost; keyword: string; meta?: KeywordMeta }[] = [];
    const seen = new Set<string>();
    for (const p of autoPairsFor(post)) {
      if (seen.has(p.keyword)) continue;
      seen.add(p.keyword);
      out.push(p);
    }
    for (const raw of postKeywordsRef.current[post.id] || []) {
      const kw = raw.trim();
      if (!kw || seen.has(kw)) continue;
      seen.add(kw);
      // DB에 이미 종류가 기록돼 있으면 그대로 유지하고, 없을 때만 수동으로 간주한다.
      const known = keywordMetaRef.current[rankKey(post.id, kw)];
      out.push({ post, keyword: kw, meta: { ...known, keywordType: known?.keywordType || 'manual', postUrl: post.url } });
    }
    return out;
  }, [autoPairsFor]);

  // 화면을 막지 않는 자동 새로고침: 저장된 키워드 중 10분 이상 지났거나 아직 확인 안 된 것만 백그라운드로 조회
  const scanAndRefresh = useCallback(() => {
    if (refreshingRef.current) return;
    const pairs: { post: BlogPost; keyword: string; meta?: KeywordMeta }[] = [];
    for (const post of blogPosts) {
      for (const p of pairsForPost(post)) {
        if (isStale(rankingResultsRef.current[rankKey(post.id, p.keyword)])) pairs.push(p);
      }
    }
    if (pairs.length > 0) runBatch(pairs);
  }, [blogPosts, runBatch, pairsForPost]);

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
    for (const post of blogPosts) pairs.push(...pairsForPost(post));
    return pairs;
  }, [blogPosts, pairsForPost]);

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
      if (gateRes.status === 401) { openGate('/my/keyword-ranking'); return; }
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

  // 포스팅 1개 → 키워드 N개. 각 키워드는 서로 독립된 행/데이터 단위로 취급한다(로직은 helpers 에서 테스트).
  const keywordRowsFor = useCallback((post: BlogPost): KeywordRow[] => buildKeywordRows({
    postId: post.id,
    postUrl: post.url,
    rep: repKeywords[post.id]?.keyword || null,
    autoKeywords: repKeywords[post.id]?.autoKeywords || [],
    savedKeywords: postKeywords[post.id] || [],
    keywordMeta,
  }), [repKeywords, postKeywords, keywordMeta]);

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
  const resultTier = useCallback((result: RankingResult | undefined): 'top10' | 'top30' | 'top100' | 'out' | 'unknown' | 'error' => {
    if (!result) return 'unknown';
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
  }, [basisTab]);

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

  // 순위변동 필터(스펙: 상태 탭 '순위변동') — 대표키워드의 전일 또는 7일 대비 순위가 실제로 움직인 포스팅.
  // 비교 기준은 표의 전일/7일 컬럼과 동일하게 통합검색(viewTab) 순위다. NEW·OUT도 변동으로 본다.
  // 비교할 이전 데이터가 없거나(-) 그대로면(0) 변동 없음.
  const postChanged = useCallback((post: BlogPost): boolean => {
    const { rep, result, delta } = repResultOf(post);
    if (!rep || !result || !delta) return false;
    const moved = (label: string) => label !== '-' && label !== '0';
    const prev = computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta.prevRank, delta.prevCheckedAt);
    const week = computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta.weekRank, delta.weekCheckedAt);
    return moved(prev.label) || moved(week.label);
  }, [repResultOf]);

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
        if (statusFilter === 'changed') return postChanged(p);
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
  }, [periodPosts, statusFilter, searchQuery, sortBy, repKeywords, postTier, postChanged]);

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
    // checked = 순위를 실제로 확인한 글 수. TOP10/TOP30 은 이 부분집합 위에서만 의미가 있다.
    return { total: periodPosts.length, repDone, top10, top30, unknown, checked: periodPosts.length - unknown };
  }, [periodPosts, repKeywords, postTier]);

  const basisLabel = rankBasis === 'blog' ? '블로그' : rankBasis === 'influencer' ? '인플루언서' : '통합검색';

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
    // 빈 값이면 조용히 return 해서 저장 버튼이 고장난 것처럼 보였다.
    if (!kw) { showError('대표 키워드를 입력해 주세요.', 4000); return; }
    setSavingRep(true);
    try {
      const post = blogPosts.find(p => p.id === editRep.postId);
      const res = await fetch('/api/blog/representative-keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, postId: editRep.postId, keyword: kw, title: post?.title }),
      });
      if (res.status === 401) { openGate('/my/keyword-ranking'); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        showError(d.error || '대표 키워드 저장에 실패했습니다.', 4000);
        return;
      }
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
        {/* 전체 포스팅 크롤은 900글 기준 12~25초가 걸린다. 아무 말 없이 스켈레톤만 돌면
            사용자는 몇 초 만에 고장 났다고 판단한다 — 얼마나 기다리면 되는지 알려준다. */}
        <p className="text-xs text-dim">
          블로그 글을 불러오는 중입니다. 글이 많으면 최대 1분까지 걸릴 수 있습니다.
        </p>
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

  // 최상단 알림 배너 (에러/안내)
  const banners = (
    <>
      {errorMessage && (
        // sticky — 표 아래쪽에서 작업하다 에러가 나도 화면 밖으로 밀려나지 않게 한다
        <div className="sticky top-4 z-30 px-4 py-3 rounded-xl bg-down/10 border border-down/30 text-down text-sm flex items-start gap-2 shadow-sm backdrop-blur-sm">
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
    </>
  );

  // 헤더 우측 보조 영역 — 주 버튼('대표키워드 추출')은 primaryAction 이 그리고,
  // 실행 중에는 그 자리를 진행률 pill 이 대신한다(스펙 #2/#22/#23).
  const running = extractingAll || checkingAll;
  const headerActions = (
    <>
      {extractingAll ? (
        <CheckProgress current={extractProgress.current} total={extractProgress.total} label="대표키워드 추출 중" onStop={stopExtractingAll} startedAt={batchStartedAt} />
      ) : checkingAll ? (
        <CheckProgress current={checkProgress.current} total={checkProgress.total} label="순위 확인 중" onStop={stopChecking} startedAt={batchStartedAt} />
      ) : (
        <button
          onClick={openRefreshEstimate}
          disabled={postsLoading || blogPosts.length === 0}
          className={`inline-flex items-center gap-1.5 ${actionButtonSecondaryClass}`}
          title="조회 대상과 예상 요청 수를 먼저 확인한 뒤 순위를 갱신합니다 (30분에 1회)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></svg>
          순위 업데이트
        </button>
      )}
      <MoreMenu>
        {close => (
          <>
            {canDownload && (
              <button onClick={() => { handleDownload(); close(); }} className={menuItemClass}>CSV 다운로드</button>
            )}
            {canDownload && profile && (
              <a href={`/api/downloads/my-keyword-ranking?blogId=${encodeURIComponent(profile.blogId)}`} onClick={close} className={menuLinkClass}>전체 리포트</a>
            )}
            <button onClick={() => { handleResetResults(); close(); }} className={menuItemDangerClass}>초기화</button>
          </>
        )}
      </MoreMenu>
    </>
  );

  // 필터 바 — 기간 / 상태 탭 · 검색 · 정렬 · 순위 기준 (스펙 #6/#7/#10/#11)
  const filters = (
    <FilterControlBar<StatusKey, 'latest' | 'oldest' | 'title'>
      period={{
        period,
        onPeriod: handlePeriodChange,
        customFrom,
        customTo,
        onCustomFrom: setCustomFrom,
        onCustomTo: setCustomTo,
        usingCustomRange,
        onResetCustom: () => { setCustomFrom(''); setCustomTo(''); },
      }}
      status={{ options: STATUS_FILTER_OPTIONS, value: statusFilter, onChange: setStatusFilter }}
      search={{ value: searchQuery, onChange: setSearchQuery, placeholder: '게시글 제목·대표키워드 검색' }}
      sort={{ value: sortBy, onChange: setSortBy, options: POST_SORT_OPTIONS }}
      extra={
        <select value={rankBasis} onChange={e => setRankBasis(e.target.value as Basis)} className={selectControlClass} title="순위 기준" aria-label="순위 기준">
          <option value="integrated">순위 기준: 통합검색</option>
          <option value="blog">순위 기준: 블로그</option>
          <option value="influencer">순위 기준: 인플루언서</option>
        </select>
      }
      meta={overallLastUpdated ? `키워드 순위 최근 업데이트: ${timeAgo(overallLastUpdated)}` : undefined}
    />
  );

  // 표 아래 영역 — 임의 키워드 검색 + 확인 모달 + 상세 드로어
  const extras = (
    <>
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

      {/* '대표키워드 추출' 확인 모달 — 대상 수를 먼저 보여주고 일괄 추출 API를 호출한다 */}
      <ConfirmDialog
        open={!!extractPrompt}
        onClose={() => setExtractPrompt(null)}
        title="대표키워드 추출"
        description="포스팅 제목을 규칙으로 분석해 대표 1개 + 보조 키워드를 뽑습니다. 네이버 순위 조회는 하지 않습니다."
        confirmLabel="추출 시작"
        onConfirm={confirmExtract}
        confirmDisabled={extractPrompt?.missing === 0 && !extractIncludeStored}
      >
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-accent">아직 추출 안 된 포스팅</span><span className="font-bold text-accent">{extractPrompt?.missing ?? 0}개</span></div>
          <div className="flex justify-between"><span className="text-dim">이미 추출된 포스팅</span><span className="font-bold">{extractPrompt?.stored ?? 0}개</span></div>
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-dim cursor-pointer select-none">
          <input type="checkbox" checked={extractIncludeStored} onChange={e => setExtractIncludeStored(e.target.checked)} className="accent-accent w-3.5 h-3.5" />
          이미 추출된 키워드도 현행 규칙으로 다시 추출
        </label>
        <p className="text-[11px] text-dim mt-1.5">직접 지정한 대표키워드(수동)는 어느 경우에도 덮어쓰지 않습니다.</p>
        {extractPrompt?.missing === 0 && !extractIncludeStored && (
          <p className="text-[11px] text-accent mt-2">추출할 포스팅이 없습니다. 다시 뽑으려면 위 옵션을 선택하세요.</p>
        )}
      </ConfirmDialog>

      {/* '지금 업데이트' 예상치 확인 모달 (스펙 #11/#14) */}
      <ConfirmDialog
        open={!!refreshEstimate}
        onClose={() => setRefreshEstimate(null)}
        title="순위 업데이트 확인"
        description="무조건 전체를 조회하지 않고, 아래 대상만 네이버 검색으로 순위를 확인합니다."
        confirmLabel={refreshStarting ? '시작 중…' : '조회 시작'}
        onConfirm={confirmRefresh}
        confirmDisabled={refreshEstimate?.stale === 0 && !refreshForceAll}
        busy={refreshStarting}
      >
        {refreshEstimate && (
          <>
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
          </>
        )}
      </ConfirmDialog>

      {/* 30일 이전(확장 기간) 확인 모달 (스펙 #8) */}
      <ConfirmDialog
        open={extendPrompt !== null}
        onClose={() => setExtendPrompt(null)}
        title="이전 포스팅도 확인하시겠습니까?"
        description={extendPrompt !== null
          ? <>최근 30일 이후({periodLabel(extendPrompt)}) 포스팅까지 함께 표시합니다. 순위 조회는 &lsquo;순위 업데이트&rsquo;에서 별도로 실행됩니다.</>
          : undefined}
        confirmLabel="확인"
        onConfirm={() => { if (extendPrompt !== null) setPeriod(extendPrompt); setExtendPrompt(null); }}
      />

      {/* 대표키워드 직접 수정 모달 (스펙 #15) */}
      <ConfirmDialog
        open={!!editRep}
        onClose={() => setEditRep(null)}
        title="대표 키워드 직접 수정"
        description="직접 입력한 대표키워드는 자동 추출로 덮어쓰지 않습니다."
        confirmLabel={savingRep ? '저장 중…' : '저장'}
        onConfirm={saveManualRep}
        confirmDisabled={!editRep?.value.trim()}
        busy={savingRep}
      >
        {editRep && (
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
        )}
      </ConfirmDialog>

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
    </>
  );

  // 표 컬럼 — 포스팅 1개가 여러 키워드 행으로 펼쳐지므로 본문은 renderRows 가 그리고
  // 여기 정의는 헤더(이름·폭·구분선)로만 쓰인다.
  const columns: DataTableColumn<BlogPost>[] = [
    { key: 'title', header: '포스팅 제목' },
    { key: 'keyword', header: '키워드', width: 'w-60', divider: true },
    { key: 'date', header: '작성일', align: 'right', width: 'w-24', divider: true },
    { key: 'view', header: '통합검색', align: 'center', width: 'w-20', divider: true },
    { key: 'blog', header: '블로그탭', align: 'center', width: 'w-20' },
    { key: 'influencer', header: '인플탭', align: 'center', width: 'w-24' },
    { key: 'volume', header: '검색량', align: 'right', width: 'w-20', divider: true },
    { key: 'prev', header: '전일대비', align: 'center', width: 'w-20' },
    { key: 'week', header: '7일대비', align: 'center', width: 'w-20' },
    { key: 'status', header: '상태', align: 'center', width: 'w-24', divider: true },
    { key: 'checkedAt', header: '마지막 확인', align: 'right', width: 'w-28' },
    { key: 'manage', header: '관리', align: 'center', width: 'w-36', divider: true },
  ];

  /** 보조 키워드 펼치기 토글 — 첫 행의 키워드 칸에 붙는다(대표 아래 서브행을 여닫는다). */
  const secondaryToggle = (postId: string, count: number, expanded: boolean) =>
    count > 0 ? (
      <button
        onClick={() => toggleSecondary(postId)}
        className="text-[10px] text-dim hover:text-accent cursor-pointer shrink-0"
        title={expanded ? '보조 키워드 접기' : '보조 키워드 펼치기'}
      >
        보조 {count} {expanded ? '▲' : '▼'}
      </button>
    ) : null;

  // 포스팅 1개 = 대표 행 1개 + (펼쳤을 때) 보조 서브행 n개 + 직접추가 행 + 키워드 추가 행
  const renderPostRows = (post: BlogPost) => {
    const rows = keywordRowsFor(post);
    const secondaryCount = rows.filter(r => r.kind === 'secondary').length;
    const expanded = expandedSecondary.has(post.id);
    // 보조 키워드는 기본 접힘 — 펼치면 대표 아래 2단(들여쓴 서브행)으로 나열된다.
    const visibleRows = expanded ? rows : rows.filter(r => r.kind !== 'secondary');
    const isExtracting = extractingRepId === post.id;
    const isAdding = addingFor === post.id;
    const savedCount = (postKeywords[post.id] || []).length;
    const atLimit = savedCount >= MAX_KEYWORDS_PER_POST;

    // 포스팅 제목은 모든 행에 동일하게 렌더한다 — 키워드에 딸린 부모가 아니라 독립 컬럼이다.
    const titleCell = (
      <td className="px-3 py-3 align-middle">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-xs truncate block max-w-[280px] hover:text-accent transition"
          title={post.title}
        >
          {post.title}
        </a>
      </td>
    );

    return (
      <>
        {visibleRows.map((row, idx) => {
          const key = rankKey(post.id, row.keyword);
          const res = rankingResults[key];
          const d = rankDeltas[key];
          const checking = checkingKeys.has(key);
          const flashing = flashKeys.has(key);
          const st = STATUS_META[resultTier(res)];
          const kindMeta = KIND_META[row.kind];
          const isSub = row.kind !== 'primary'; // 대표 아래 2단 서브행(보조·추가)
          const prev = res ? computeDeltaDisplay(res.viewTab.exposed, res.viewTab.rank, d?.prevRank ?? null, d?.prevCheckedAt ?? null) : null;
          const week = res ? computeDeltaDisplay(res.viewTab.exposed, res.viewTab.rank, d?.weekRank ?? null, d?.weekCheckedAt ?? null) : null;
          return (
            <tr key={key} className={`hover:bg-surface-hover transition ${idx === 0 ? 'border-t border-border/50' : ''}`}>
              {titleCell}
              <td className={`px-3 py-3 align-middle border-l border-border/40 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>
                <div className={`flex items-center gap-1.5 ${isSub ? 'pl-3 border-l-2 border-border/60' : ''}`}>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${kindMeta.cls}`}>{kindMeta.label}</span>
                  <button
                    onClick={() => setDetail({ post, keyword: row.keyword })}
                    className="text-xs font-semibold truncate hover:text-accent hover:underline cursor-pointer text-left"
                    title={`${row.keyword} — 상세 보기`}
                  >
                    {row.keyword}
                  </button>
                  {row.kind === 'primary' && repKeywords[post.id]?.source === 'manual' && (
                    <span className="text-[9px] text-dim shrink-0" title="직접 지정한 대표키워드">수동</span>
                  )}
                  {idx === 0 && secondaryToggle(post.id, secondaryCount, expanded)}
                </div>
              </td>
              <td className="text-right px-3 py-3 text-xs text-dim whitespace-nowrap border-l border-border/40">{post.date}</td>
              <td className={`text-center px-3 py-3 border-l border-border/40 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>{renderRankTab(res, res?.viewTab)}</td>
              <td className={`text-center px-3 py-3 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>{renderRankTab(res, res?.blogTab)}</td>
              <td className={`text-center px-3 py-3 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>{renderRankTab(res, res?.influencerTab)}</td>
              <td className="text-right px-3 py-3 text-xs text-dim border-l border-border/40">{res?.searchVolume ? res.searchVolume.toLocaleString() : '--'}</td>
              <td className="text-center px-3 py-3">
                {prev ? <span className={`text-xs font-bold ${prev.colorClass}`} title={prev.tooltip}>{prev.label}</span> : <span className="text-[10px] text-dim/50">--</span>}
              </td>
              <td className="text-center px-3 py-3">
                {week ? <span className={`text-xs font-bold ${week.colorClass}`} title={week.tooltip}>{week.label}</span> : <span className="text-[10px] text-dim/50">--</span>}
              </td>
              <td className="text-center px-3 py-3 border-l border-border/40">
                {checking ? <StatusBadge label="분석중" tone="info" /> : <StatusBadge label={st.label} tone={st.tone} />}
              </td>
              <td className="text-right px-3 py-3">
                <span className="text-[10px] text-dim" title={res?.checkedAt ? new Date(res.checkedAt).toLocaleString('ko-KR') : ''}>{res?.checkedAt ? timeAgo(res.checkedAt) : '--'}</span>
              </td>
              <td className="px-3 py-3 border-l border-border/40">
                <div className="flex items-center justify-center gap-2">
                  <button onClick={() => setDetail({ post, keyword: row.keyword })} className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer">보기</button>
                  <button
                    onClick={() => checkSingleKeyword(post, row.keyword, true, row.meta)}
                    disabled={checkingAll || checking}
                    className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer disabled:opacity-40"
                  >
                    {checking ? '검사 중' : '재검사'}
                  </button>
                  {row.kind === 'primary' ? (
                    <button onClick={() => setEditRep({ postId: post.id, value: row.keyword })} className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer">수정</button>
                  ) : (
                    <button onClick={() => removeManualKeyword(post, row.keyword)} className="text-dim/70 hover:text-down hover:underline text-xs font-semibold cursor-pointer">삭제</button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}

        {/* 키워드가 하나도 없는 포스팅 (보조만 있어 접혀 있는 경우는 제외) */}
        {rows.length === 0 && (
          <tr className="border-t border-border/50 hover:bg-surface-hover transition">
            {titleCell}
            <td className="px-3 py-3 border-l border-border/40">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-dim">{isExtracting ? '추출 중…' : '키워드 없음'}</span>
                {!isExtracting && (
                  <>
                    <button onClick={() => handleExtractRepresentative(post)} className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full hover:bg-accent/20 cursor-pointer">자동 추출</button>
                    <button onClick={() => setEditRep({ postId: post.id, value: '' })} className="text-[10px] font-bold text-dim border border-border px-2 py-0.5 rounded-full hover:text-accent hover:border-accent/50 cursor-pointer" title="대표키워드를 직접 입력합니다">직접 설정</button>
                  </>
                )}
              </div>
            </td>
            <td className="text-right px-3 py-3 text-xs text-dim whitespace-nowrap border-l border-border/40">{post.date}</td>
            <td colSpan={9} className="px-3 py-3 text-center text-[11px] text-dim/60 border-l border-border/40">키워드를 등록하면 순위가 표시됩니다</td>
          </tr>
        )}

        {/* 키워드 추가 — 포스팅 제목이 아니라 키워드 컬럼에서 직접 등록한다 */}
        <tr className="hover:bg-surface-hover transition">
          {titleCell}
          <td className="px-3 py-2.5 align-top border-l border-border/40">
            {/* 입력이 열리면 입력창이 칸 전체를 쓰도록 단독으로 둔다(접힘일 때만 토글과 나란히). */}
            <div className={isAdding ? '' : 'flex items-center gap-2 flex-wrap'}>
              <AddKeywordControl
                open={isAdding}
                value={addValue}
                error={addError}
                atLimit={atLimit}
                saving={addSaving}
                onOpen={() => openAddKeyword(post.id)}
                onClose={closeAddKeyword}
                onChange={v => { setAddValue(v); if (addError) setAddError(''); }}
                onSubmit={() => submitAddKeyword(post)}
              />
              {/* 보조 토글은 평소 대표 행에 붙지만, 대표가 없어 보이는 행이 하나도 없으면
                  여기 말고는 펼칠 자리가 없다 — 그때만 이 줄에서 대신 보여준다. */}
              {!isAdding && visibleRows.length === 0 && secondaryToggle(post.id, secondaryCount, expanded)}
            </div>
          </td>
          <td colSpan={9} className="border-l border-border/40" />
          <td className="px-3 py-2.5 border-l border-border/40">
            <div className="flex items-center justify-center">
              <button
                onClick={() => handleExtractRepresentative(post)}
                disabled={isExtracting}
                className="text-[11px] text-dim/70 hover:text-accent hover:underline cursor-pointer disabled:opacity-40"
                title="대표키워드를 다시 추출합니다"
              >
                {isExtracting ? '추출 중…' : '대표 재추출'}
              </button>
            </div>
          </td>
        </tr>
      </>
    );
  };

  // 모바일 카드 (스펙 #29) — 포스팅 아래 대표/보조/추가 키워드를 카드로 쌓는다.
  const renderPostCard = (post: BlogPost) => {
    const rows = keywordRowsFor(post);
    const secondaryCount = rows.filter(r => r.kind === 'secondary').length;
    const expanded = expandedSecondary.has(post.id);
    const visibleRows = expanded ? rows : rows.filter(r => r.kind !== 'secondary');
    const isExtracting = extractingRepId === post.id;
    const isAdding = addingFor === post.id;
    const atLimit = (postKeywords[post.id] || []).length >= MAX_KEYWORDS_PER_POST;
    return (
      <div className="px-4 py-3.5 space-y-2.5">
        {/* 포스팅 (제목 + 작성일) — 키워드와 분리된 별도 영역 */}
        <div className="flex items-start justify-between gap-2">
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-sm hover:text-accent transition line-clamp-2 flex-1">{post.title}</a>
          <span className="text-[10px] text-dim shrink-0 pt-0.5">{post.date}</span>
        </div>

        {rows.length === 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-dim">{isExtracting ? '추출 중…' : '키워드 없음'}</span>
            {!isExtracting && (
              <>
                <button onClick={() => handleExtractRepresentative(post)} className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full hover:bg-accent/20 cursor-pointer">자동 추출</button>
                <button onClick={() => setEditRep({ postId: post.id, value: '' })} className="text-[10px] font-bold text-dim border border-border px-2 py-0.5 rounded-full hover:text-accent hover:border-accent/50 cursor-pointer">직접 설정</button>
              </>
            )}
          </div>
        )}

        {/* 키워드 — 각각 독립된 카드로, 자기 순위 데이터만 표시한다. 보조·추가는 대표 아래 2단으로 들여쓴다. */}
        {visibleRows.map(row => {
          const key = rankKey(post.id, row.keyword);
          const res = rankingResults[key];
          const d = rankDeltas[key];
          const checking = checkingKeys.has(key);
          const st = STATUS_META[resultTier(res)];
          const kindMeta = KIND_META[row.kind];
          const isSub = row.kind !== 'primary';
          const prev = res ? computeDeltaDisplay(res.viewTab.exposed, res.viewTab.rank, d?.prevRank ?? null, d?.prevCheckedAt ?? null) : null;
          const week = res ? computeDeltaDisplay(res.viewTab.exposed, res.viewTab.rank, d?.weekRank ?? null, d?.weekCheckedAt ?? null) : null;
          return (
            <div key={key} className={`rounded-xl border border-border/60 p-2.5 space-y-1.5 ${isSub ? 'ml-3' : ''} ${flashKeys.has(key) ? 'bg-accent/10' : 'bg-bg/30'}`}>
              <div className="flex items-center gap-1.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${kindMeta.cls}`}>{kindMeta.label}</span>
                <button onClick={() => setDetail({ post, keyword: row.keyword })} className="text-xs font-semibold truncate hover:text-accent hover:underline cursor-pointer text-left">{row.keyword}</button>
                <span className="ml-auto shrink-0">
                  {checking ? <StatusBadge label="분석중" tone="info" /> : <StatusBadge label={st.label} tone={st.tone} />}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {renderRankPill('통합', res, res?.viewTab)}
                {renderRankPill('블로그', res, res?.blogTab)}
                {renderRankPill('인플', res, res?.influencerTab)}
                <span className="text-[10px] text-dim">검색량 {res?.searchVolume ? res.searchVolume.toLocaleString() : '--'}</span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-dim flex-wrap">
                <span title={prev?.tooltip}>전일 <b className={prev?.colorClass}>{prev ? prev.label : '--'}</b></span>
                <span title={week?.tooltip}>7일 <b className={week?.colorClass}>{week ? week.label : '--'}</b></span>
                <span className="ml-auto" title={res?.checkedAt ? new Date(res.checkedAt).toLocaleString('ko-KR') : ''}>{res?.checkedAt ? timeAgo(res.checkedAt) : '미확인'}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] pt-0.5">
                <button onClick={() => setDetail({ post, keyword: row.keyword })} className="text-dim hover:text-accent font-semibold cursor-pointer">보기</button>
                <button onClick={() => checkSingleKeyword(post, row.keyword, true, row.meta)} disabled={checkingAll || checking} className="text-dim hover:text-accent font-semibold cursor-pointer disabled:opacity-40">{checking ? '검사 중' : '재검사'}</button>
                {row.kind === 'primary' ? (
                  <button onClick={() => setEditRep({ postId: post.id, value: row.keyword })} className="text-dim hover:text-accent font-semibold cursor-pointer ml-auto">수정</button>
                ) : (
                  <button onClick={() => removeManualKeyword(post, row.keyword)} className="text-dim/70 hover:text-down font-semibold cursor-pointer ml-auto">삭제</button>
                )}
              </div>
            </div>
          );
        })}

        {/* 키워드 추가 — 키워드 영역에서 직접 등록. 열렸을 땐 입력이 카드 폭을 다 쓰도록 감싼다. */}
        {isAdding ? (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-2.5">
            <AddKeywordControl
              open
              value={addValue}
              error={addError}
              atLimit={atLimit}
              saving={addSaving}
              onOpen={() => openAddKeyword(post.id)}
              onClose={closeAddKeyword}
              onChange={v => { setAddValue(v); if (addError) setAddError(''); }}
              onSubmit={() => submitAddKeyword(post)}
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[11px]">
            <AddKeywordControl
              open={false}
              value={addValue}
              error={addError}
              atLimit={atLimit}
              saving={addSaving}
              onOpen={() => openAddKeyword(post.id)}
              onClose={closeAddKeyword}
              onChange={v => { setAddValue(v); if (addError) setAddError(''); }}
              onSubmit={() => submitAddKeyword(post)}
            />
            {secondaryCount > 0 && (
              <button onClick={() => toggleSecondary(post.id)} className="text-dim hover:text-accent cursor-pointer">보조 {secondaryCount}개 {expanded ? '숨기기' : '보기'}</button>
            )}
            <button onClick={() => handleExtractRepresentative(post)} disabled={isExtracting} className="text-dim/70 hover:text-accent cursor-pointer ml-auto disabled:opacity-40">{isExtracting ? '추출 중…' : '대표 재추출'}</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout
      title="키워드 순위"
      description={`내 블로그 전체 포스팅의 대표키워드와 네이버 검색 순위를 확인합니다. · 전체 ${blogPostsTotal.toLocaleString()}개`}
      banners={banners}
      primaryAction={running ? undefined : {
        label: reextracting
          ? '재추출 중…'
          : missingRepCount > 0 ? `대표키워드 추출 ${missingRepCount}개` : '대표키워드 추출',
        onClick: openExtractPrompt,
        disabled: postsLoading || blogPosts.length === 0 || reextracting,
        title: '포스팅 제목을 분석해 대표키워드를 일괄 추출합니다(직접 지정한 키워드는 유지)',
      }}
      actions={headerActions}
      cardsLoading={postsLoading}
      metrics={[
        // ⚠️ summary.total 은 기간 필터가 적용된 수(periodPosts)다. 그런데 라벨이 '전체
        //    포스팅'이라, 기본값 30일이 켜진 첫 화면에서 940글 블로그가 "전체 포스팅 43"으로
        //    보였다 — 바로 위 설명줄의 "전체 940개"와 정면으로 어긋나는 두 개의 '전체'였다.
        //    지금 세고 있는 범위를 라벨에 적는다.
        {
          key: 'total',
          label: usingCustomRange ? '선택 기간 포스팅' : period === 0 ? '전체 포스팅' : `최근 ${period}일 포스팅`,
          value: summary.total,
          tone: 'accent',
        },
        {
          key: 'repDone',
          label: '대표키워드 완료',
          value: summary.repDone,
          tone: summary.total > 0 && summary.repDone === summary.total ? 'success' : 'warning',
          description: summary.total ? `${Math.round((summary.repDone / summary.total) * 100)}%` : undefined,
        },
        // ⚠️ TOP10/TOP30 은 '순위를 확인한 글' 중에서만 셀 수 있는 값이다. 그런데 한 번도
        //    확인하지 않은 글까지 분모에 넣고 0 을 찍고 있었다 — 43개가 전부 미확인인
        //    화면에서 "TOP 10 · 0", "미확인 · 43" 이 나란히 떴다. 앞 두 장은 "당신은 상위
        //    노출된 글이 하나도 없다"로 읽히지만 사실은 아무것도 확인하지 않았다는 뜻이다.
        //    확인한 글이 0개면 숫자를 만들지 않고, 있으면 무엇을 분모로 센 건지 밝힌다.
        {
          key: 'top10',
          label: 'TOP 10',
          value: summary.top10,
          tone: 'success',
          statusText: summary.checked === 0 ? '미확인' : undefined,
          description: summary.checked === 0 ? '순위 확인 전' : `${basisLabel} 기준 · 확인한 ${summary.checked}개 중`,
        },
        {
          key: 'top30',
          label: 'TOP 30',
          value: summary.top30,
          tone: 'success',
          statusText: summary.checked === 0 ? '미확인' : undefined,
          description: summary.checked === 0 ? '순위 확인 전' : `${basisLabel} 기준 · 확인한 ${summary.checked}개 중`,
        },
        { key: 'unknown', label: '미확인', value: summary.unknown, tone: 'neutral' },
      ]}
      filters={filters}
      tableTitle="포스팅 목록"
      tableCount={`${displayList.length}개`}
      tableLoading={postsLoading}
      footer={extras}
    >
      <DataTable<BlogPost>
        columns={columns}
        rows={displayList}
        rowKey={post => post.id}
        loading={postsLoading}
        minWidth="1200px"
        maxHeight="72vh"
        empty={postsFailed
          ? {
            // 조회가 실패한 것과 블로그에 글이 없는 것은 다르다. 예전엔 둘 다
            // "게시물을 수집하지 못했습니다"로 나왔고, 다시 시도할 방법도 없었다.
            title: '게시물을 불러오지 못했습니다.',
            description: '네트워크 상태를 확인한 뒤 다시 시도해주세요. 글이 많은 블로그는 첫 조회가 오래 걸릴 수 있습니다.',
            action: (
              <button
                onClick={() => { if (profile?.blogId) fetchBlogPosts(profile.blogId); }}
                className={actionButtonSecondaryClass}
              >
                다시 시도
              </button>
            ),
          }
          : blogPosts.length === 0
            ? { title: '수집된 게시물이 없습니다.', description: '블로그에 글을 발행하면 여기에 표시됩니다.' }
            : {
            title: '해당 조건의 포스팅이 없습니다.',
            description: '기간 또는 순위 필터를 변경해보세요.',
            action: (
              <button
                onClick={() => { setStatusFilter('all'); setSearchQuery(''); setCustomFrom(''); setCustomTo(''); }}
                className={actionButtonSecondaryClass}
              >
                필터 초기화
              </button>
            ),
          }}
        renderRows={renderPostRows}
        renderMobileCard={renderPostCard}
      />
    </DashboardLayout>
  );
}
