'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import GlassCard from '@/components/dashboard/GlassCard';
import Modal from '@/components/ui/Modal';
import SectionHeader from '@/components/dashboard/SectionHeader';
// 분석 화면 공용 디자인 시스템 — 키워드순위 화면과 같은 골격·필터 바·표·지표 카드를 쓴다.
import {
  AddKeywordControl,
  DashboardLayout,
  DataTable,
  FilterControlBar,
  Pagination,
  MoreMenu,
  menuItemClass,
  menuItemDangerClass,
  POST_SORT_OPTIONS,
  selectControlClass,
  actionButtonSecondaryClass,
  actionButtonDangerClass,
  KEYWORD_KIND_META,
  type MetricCardItem,
  type DataTableColumn,
  type SegmentOption,
} from '@/components/analytics';
import { useAuth } from '@/hooks/useAuth';
import { rowsToCsv, downloadCsvInBrowser, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';
import type { BloggerProfile, BlogPost, BriefingResult, AnalysisEntry, KeywordMeta, RepKeywordEntry } from './AiBriefingSection.helpers';
import {
  STATE_API,
  STAGE_LABELS,
  timeAgo,
  rankKey,
  fetchBriefingState,
  fetchSharedKeywordState,
  fetchCitationHistory,
  CitationTimeline,
  saveSharedKeywords,
  saveBriefingResultToDb,
  saveBriefingErrorToDb,
  EMPTY_BRIEFING,
  BriefingLabelBadge,
  AiTabBadge,
  ResultStatCard,
  CitationStatusBadge,
  CitationDetailPanel,
  briefingSurfaceStatus,
  tabSurfaceStatus,
  fromEngineResult,
  markCheckingInDb,
  clearCheckingInDb,
} from './AiBriefingSection.helpers';
import CheckProgress from '@/components/analytics/CheckProgress';
import { extractRepresentativeKeyword } from '@/lib/representative-keyword-client';
import {
  computeCitationStatus,
  CITATION_STATUS_LABELS,
  SURFACE_STATUS_LABELS,
  type CitationState,
  type SurfaceStatusValue,
} from '@/lib/ai-citation-status';
import { BULK_RUN_CAP, BATCH_DELAY_MS, CITATION_FRESH_TTL_MS } from '@/lib/ai-citation-batch';
import { MAX_KEYWORDS_PER_POST, normalizeForCompare } from './KeywordRankingSection.helpers';

/** ai-citation-estimate API 응답(스펙 #9~#12) */
interface BulkEstimate {
  totalPosts: number;
  repMissing: number;
  unchecked: number;
  staleChecked: number;
  cacheSkipped: number;
  newChecks: number;
  estRepExtractions: number;
  estApiCalls: number;
  perRunCap: number;
  runsNeeded: number;
  betweenMs: number;
  quota: {
    aiCitation: { officialApi: boolean; note: string; limiterLimit: number; limiterWindowSec: number; perRunCap: number };
    naverSearchOpenApi: { officialApi: boolean; dailyQuota: number; note: string };
  };
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * 상태 탭(스펙 #17) — 이 화면은 브리핑·탭을 "독립" 채널로 보므로 종합 상태(CitationFilter)가 아니라
 * 채널별 필터를 쓴다. 브리핑 노출과 탭 노출은 서로 배타가 아니라 둘 다 걸리는 포스팅도 있다.
 */
type BriefingFilter = 'all' | 'briefing' | 'tab' | 'missing' | 'unchecked' | 'unresolved';

const BRIEFING_FILTER_OPTIONS: { key: BriefingFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'briefing', label: '브리핑 인용' },
  { key: 'tab', label: '탭 인용' },
  { key: 'missing', label: '미인용' },
  { key: 'unchecked', label: '확인전' },
  { key: 'unresolved', label: '미확인·확인불가·오류' },
];

/**
 * 대표 키워드 확인 결과 → 상태 탭 매칭.
 * 요약 카드(channelCounts)와 "같은" 분기 순서를 쓴다 — 카드 숫자와 탭 필터 결과가 어긋나면 안 된다.
 *
 * ⚠️ '미인용'은 두 표면 모두 NOT_CITED(화면에서 없음을 확인)일 때만이다.
 *    미확인·확인불가·오류는 별도 탭('unresolved')으로 빠진다.
 */
function matchesBriefingFilter(f: BriefingFilter, r?: BriefingResult): boolean {
  if (f === 'all') return true;
  const b = briefingSurfaceStatus(r);
  const t = tabSurfaceStatus(r);
  if (!b && !t) return f === 'unchecked';
  if (f === 'briefing') return b === 'CITED';
  if (f === 'tab') return t === 'CITED';
  if (f === 'missing') return b === 'NOT_CITED' && t === 'NOT_CITED';
  if (f === 'unresolved') {
    return b !== 'CITED' && t !== 'CITED' && !(b === 'NOT_CITED' && t === 'NOT_CITED');
  }
  return false;
}

/** CSV 라벨 — 화면 배지와 같은 문구를 쓴다. 확인 실패는 절대 미인용으로 적지 않는다. */
function surfaceCsvLabel(status: SurfaceStatusValue | null, present: boolean | null | undefined, absentLabel: string): string {
  if (!status) return '확인 전';
  if (status === 'NOT_CITED' && present === false) return absentLabel;
  return SURFACE_STATUS_LABELS[status];
}

function briefingCsvLabel(r?: BriefingResult): string {
  return surfaceCsvLabel(briefingSurfaceStatus(r), r?.hasAiBriefing, '브리핑 없음');
}

function tabCsvLabel(r?: BriefingResult): string {
  return surfaceCsvLabel(tabSurfaceStatus(r), r?.hasAiTab, 'AI 탭 없음');
}

export default function AiBriefingSection() {
  const { user, isLoading: authLoading } = useAuth();
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(30);
  const [postsLoading, setPostsLoading] = useState(false);
  // 첫 페이지는 그렸지만 전체 목록(all=true)은 아직 받는 중 — KPI는 이때 집계하면 부분 수치가 나온다.
  const [fullListLoading, setFullListLoading] = useState(false);
  const queryClient = useQueryClient();

  // postId → 키워드 목록. 키워드순위(keyword_rank_lookups)와 "같은" 저장소에서 읽어온다(스펙 #10).
  // 이 화면은 키워드를 새로 만들지 않고, 이 목록의 각 키워드에 대한 브리핑·탭 결과만 덧붙인다.
  const [postKeywords, setPostKeywords] = useState<Record<string, string[]>>({});
  // 키워드 컬럼에서 직접 추가 중인 포스팅(postId) + 입력값 — 키워드순위와 같은 방식/같은 저장소
  const [addingFor, setAddingFor] = useState('');
  const [addValue, setAddValue] = useState('');
  const [addError, setAddError] = useState('');
  const [keywordMeta, setKeywordMeta] = useState<Record<string, KeywordMeta>>({});
  // "postId::keyword" → BriefingResult
  const [briefingResults, setBriefingResults] = useState<Record<string, BriefingResult>>({});
  const [checkingKey, setCheckingKey] = useState('');
  const [checkingStage, setCheckingStage] = useState('');
  const [extractingPostId, setExtractingPostId] = useState('');
  // 보조·변형 키워드는 기본으로 접어두고 '보조 N ▼' 로만 펼친다(키워드순위와 동일).
  const [expandedSecondary, setExpandedSecondary] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState('');
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 상태 필터: 전체/브리핑 노출/탭 노출/미노출/확인전/확인실패 (채널별 독립 판정)
  const [filter, setFilter] = useState<BriefingFilter>('all');
  // 기간·검색·정렬 필터 — 키워드순위 화면과 동일 UX로 통일(스펙 #1)
  const [period, setPeriod] = useState(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'title'>('latest');
  const usingCustomRange = !!(customFrom || customTo);

  // 대표키워드 공용 소스(post_representative_keywords) — 키워드순위 화면과 동일 데이터(스펙 #2/#3)
  const [repKeywords, setRepKeywords] = useState<Record<string, RepKeywordEntry>>({});
  // 대표키워드 인라인 수동 편집(스펙 #3)
  const [editingRepPost, setEditingRepPost] = useState('');
  const [repDraft, setRepDraft] = useState('');
  // 제목 → 키워드 자동 추출 진행 상태(키워드순위 화면과 동일 UX)
  const [extractingAll, setExtractingAll] = useState(false);
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0 });
  const extractAbortRef = useRef(false);
  const autoExtractDoneRef = useRef<Set<string>>(new Set());
  const autoExtractRunningRef = useRef(false);
  const repKeywordsRef = useRef<Record<string, RepKeywordEntry>>({});
  // 상세 패널(스펙 #7) — 열려있는 행의 키(postId::keyword)
  const [detailKey, setDetailKey] = useState('');

  // 안전 배치 큐(스펙 #9~#15)
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkEstimate, setBulkEstimate] = useState<BulkEstimate | null>(null);
  const [bulkLoadingEstimate, setBulkLoadingEstimate] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: '' });
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const bulkAbortRef = useRef(false);
  /**
   * 배치 재진입 차단. state(bulkRunning)만으로 막으면 리렌더 이전에 들어온 두 번째 호출이
   * 그대로 통과해 같은 포스팅을 두 번 조회하고 진행률이 서로를 덮어쓴다.
   * ref 는 즉시 반영되므로 미노출 화면의 runBatch 와 같은 방식으로 맞춘다.
   */
  const bulkRunningRef = useRef(false);
  // 단건 AI 확인('다시 검사' / '분석') 중복 실행 방지 — 헤드리스 브라우저로 네이버를 실제 조회하므로
  // 이중 실행은 비용도 두 배지만 네이버 차단 위험이 더 크다(요청 간격 제한을 스스로 깨는 셈).
  // disabled 는 state 라 같은 프레임의 빠른 연속 클릭을 못 막으므로 동기적으로 읽히는 ref 로 막는다.
  const aiCheckRef = useRef(false);

  // 대표키워드 점검·재추출(스펙 #18~21) — 규칙 기반(네이버 무호출).
  type KeywordAudit = {
    total: number;
    counts: { normal: number; suspicious: number; missing: number; manual: number };
    reextractTarget: number;
    samples: { postId: string; title: string | null; stored: string | null; suggested: string | null; reason: string | null }[];
  };
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditData, setAuditData] = useState<KeywordAudit | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [reextracting, setReextracting] = useState(false);

  // 상단 키워드 검색 + 자동 분석
  const [analyzeKeyword, setAnalyzeKeyword] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisEntry | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisEntry[]>([]);
  const [pendingPostPick, setPendingPostPick] = useState<string | null>(null);
  const [postPickSearch, setPostPickSearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 10;

  const showError = useCallback((msg: string, ms = 5000) => {
    setErrorMessage(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMessage(''), ms);
  }, []);

  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  }, []);

  const isLoggedIn = !!(user.id || user.authId);
  const canDownload = user.isAdmin || user.subscriptionPlan === 'INFLUENCER';

  // useAuth()가 이미 불러온 사용자 정보에서 도출 — 별도로 /api/auth/me를 다시 fetch하지 않는다.
  // (페이지 마운트 시 여러 컴포넌트가 각자 인증 확인을 중복 호출하면 미들웨어에서 동시에
  // 세션 갱신을 시도해 충돌하는 문제가 있었음 — 2026-07-17)
  const profile = useMemo<BloggerProfile | null>(() => {
    if (user.type === 'unified' && (user.blogId || user.id)) {
      return { blogId: (user.blogId || user.id)!, displayName: user.name || user.blogId || user.id || '', isInfluencer: true };
    }
    if (user.type === 'blogger' && user.id) {
      return { blogId: user.id, displayName: user.name || user.id, isInfluencer: false };
    }
    if (user.type === 'influencer' && user.id) {
      return { blogId: (user.blogId || user.id)!, displayName: user.name || user.id, isInfluencer: true };
    }
    return null;
  }, [user]);

  const handleDownload = () => {
    if (!canDownload) return;
    const headers = [
      '포스팅 제목', '포스팅 URL', '발행일', '추출 키워드', '키워드', '대표여부',
      'AI 브리핑', '브리핑 출처 순번', 'AI 탭', '탭 출처 순번', '마지막 확인', '상태',
    ];
    const rows: unknown[][] = [];
    for (const post of blogPosts) {
      for (const row of keywordRowsFor(post)) {
        if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
        const result = resultFor(post.id, row.keyword, row.isPrimary);
        rows.push([
          post.title,
          post.url,
          post.date,
          (repKeywords[post.id]?.candidates || []).join(', '),
          row.keyword,
          row.isPrimary ? '대표' : '',
          briefingCsvLabel(result),
          result?.sourceIndex ?? '',
          tabCsvLabel(result),
          result?.tabSourceIndex ?? '',
          result?.checkedAt ? new Date(result.checkedAt).toLocaleString('ko-KR') : '',
          CITATION_STATUS_LABELS[keywordStatus(post.id, row.keyword, row.isPrimary)],
        ]);
      }
      if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
    }
    if (rows.length === 0) {
      alert('다운로드할 키워드가 없습니다. 먼저 대표 키워드를 지정해주세요.');
      return;
    }
    const csv = rowsToCsv(headers, rows);
    downloadCsvInBrowser(`my_naver_mate_${todayStamp()}.csv`, csv);
  };

  const handleResetResults = useCallback(async () => {
    if (!profile) return;
    // 키워드는 키워드순위와 공유하는 데이터라 지우지 않는다(스펙 #11) — 브리핑·탭 확인 결과만 초기화.
    if (!confirm('AI 브리핑·AI 탭 확인 결과를 모두 초기화하시겠습니까?\n키워드 자체는 유지됩니다. 이 작업은 되돌릴 수 없습니다.')) return;

    try {
      setBriefingResults({});

      await fetch(`${STATE_API}?all=true`, { method: 'DELETE' }).catch(() => null);

      showError('AI 브리핑·AI 탭 확인 결과가 초기화되었습니다.', 3000);
    } catch (err) {
      showError('초기화 중 오류가 발생했습니다.', 3000);
      console.error('Reset error:', err);
    }
  }, [profile, showError]);

  // 전체 포스팅을 로드(스펙 #1) — 네이버 PostList가 최신 발행순으로 반환하므로 그 순서를 유지한다.
  // 이후 페이지네이션·필터·KPI는 이 전체 목록을 클라이언트에서 처리한다(전체 블로그 기준).
  //
  // 2단계로 받는다. all=true는 30개씩 수십 페이지를 순차 크롤링해 900여 개 기준 12~25초가 걸려서,
  // 한 번에 기다리면 그동안 화면이 "전체 0개" + 스켈레톤으로만 남는다. 첫 페이지(30개)에는 이미
  // 전체 개수(totalCount)가 들어 있으므로 그것으로 먼저 화면을 열고 전체 목록으로 교체한다.
  const fetchBlogPosts = useCallback(async (blogId: string) => {
    setPostsLoading(true);
    setFullListLoading(true);
    let opened = false;
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=1&count=30`);
      if (res.ok) {
        const data = await res.json();
        const posts: BlogPost[] = data.posts || [];
        if (posts.length > 0) {
          setBlogPosts(posts);
          setBlogPostsTotal(data.totalCount || posts.length);
          setCurrentPage(1);
          opened = true;
          setPostsLoading(false);
        }
      }
    } catch { /* 전체 목록 조회로 이어간다 */ }

    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&all=true`);
      if (res.ok) {
        const data = await res.json();
        const posts: BlogPost[] = data.posts || [];
        setBlogPosts(posts);
        setBlogPostsTotal(data.totalCount || posts.length);
        setCurrentPage(1);
      }
    } catch { /* ignore */ }
    finally {
      setFullListLoading(false);
      if (!opened) setPostsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.blogId) {
      fetchBlogPosts(profile.blogId);
    }
  }, [profile?.blogId, fetchBlogPosts]);

  const { data: syncedState } = useQuery({
    queryKey: ['ai-briefing-state', profile?.blogId],
    queryFn: () => fetchBriefingState(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: citationHistory } = useQuery({
    queryKey: ['ai-briefing-history', profile?.blogId],
    queryFn: () => fetchCitationHistory(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  // 대표키워드 공용 소스(post_representative_keywords) — 키워드순위/미노출 화면과 "동일한" 대표키워드(스펙 #2/#3/#24).
  const { data: repState } = useQuery({
    queryKey: ['rep-keywords-state', profile?.blogId],
    queryFn: async () => {
      const res = await fetch(`/api/my/representative-keywords-state?blogId=${encodeURIComponent(profile!.blogId)}`);
      if (!res.ok) throw new Error('대표키워드 로드 실패');
      return res.json() as Promise<{ results: Record<string, RepKeywordEntry> }>;
    },
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!repState?.results) return;
    // 서버 값이 기준이되, 방금 이 화면에서 추출해 아직 서버 응답에 안 들어온 항목은 남긴다.
    setRepKeywords(prev => {
      const map = { ...prev };
      for (const [pid, v] of Object.entries(repState.results)) {
        map[pid] = {
          keyword: v.keyword,
          source: v.source,
          confidence: v.confidence ?? null,
          candidates: v.candidates || [],
          keywordChangedAt: v.keywordChangedAt ?? null,
        };
      }
      return map;
    });
  }, [repState]);

  // 콜백이 최신 대표키워드 맵을 참조하되 의존성으로 재생성되지 않도록 ref로 미러링(키워드순위와 동일 패턴).
  useEffect(() => { repKeywordsRef.current = repKeywords; }, [repKeywords]);

  /**
   * 포스팅 제목을 분석해 검색 가능한 키워드 후보를 뽑고 그중 가장 적합한 하나를 대표로 확정한다(스펙 #1/#2).
   * 키워드순위 화면이 쓰는 것과 "같은" 공용 추출 경로(post_representative_keywords)라 양쪽 값이 어긋나지 않는다.
   * 네이버 호출이 없는 규칙기반이므로 배경 실행이 안전하다.
   */
  const extractRepFor = useCallback(async (
    post: BlogPost,
    opts: { refine?: boolean; ai?: boolean } = {},
  ): Promise<string | null> => {
    if (!profile?.blogId) return null;
    const data = await extractRepresentativeKeyword(profile.blogId, post, opts);
    if (!data) return null;
    setRepKeywords(prev => ({
      ...prev,
      [post.id]: {
        keyword: data.keyword,
        source: data.source,
        confidence: data.confidence,
        candidates: data.candidates,
        keywordChangedAt: prev[post.id]?.keywordChangedAt ?? null,
      },
    }));
    return data.keyword;
  }, [profile?.blogId]);

  // 아직 키워드를 추출하지 않은 포스팅만 순차 추출(0.4초 간격). 확인(네이버 조회)은 트리거하지 않는다(스펙 #3).
  const extractAllRepresentative = useCallback(async () => {
    const targets = blogPosts.filter(p => !repKeywordsRef.current[p.id]?.keyword);
    if (targets.length === 0 || extractingAll) return;
    setExtractingAll(true);
    extractAbortRef.current = false;
    setExtractProgress({ current: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      if (extractAbortRef.current) break;
      await extractRepFor(targets[i]);
      setExtractProgress({ current: i + 1, total: targets.length });
      if (i < targets.length - 1) await sleep(400);
    }
    setExtractingAll(false);
  }, [blogPosts, extractingAll, extractRepFor]);

  const stopExtractingAll = () => { extractAbortRef.current = true; };

  // 화면 진입 시 키워드가 비어있는 포스팅을 백그라운드로 자동 추출한다(스펙 #1 — "키워드 자동 추출은 필수").
  // 규칙기반이라 저비용이고 네이버 확인은 하지 않는다. 이미 시도한 포스팅은 재시도하지 않고 언마운트 시 중단.
  useEffect(() => {
    if (!profile?.blogId || !repState || blogPosts.length === 0) return;
    const known = repState.results || {};
    const targets = blogPosts.filter(
      p => !known[p.id]?.keyword && !repKeywordsRef.current[p.id]?.keyword && !autoExtractDoneRef.current.has(p.id),
    );
    if (targets.length === 0 || autoExtractRunningRef.current || extractingAll) return;

    autoExtractRunningRef.current = true;
    extractAbortRef.current = false;
    (async () => {
      for (const post of targets) {
        if (extractAbortRef.current) break;
        autoExtractDoneRef.current.add(post.id);
        await extractRepFor(post);
        if (extractAbortRef.current) break;
        await sleep(400);
      }
      autoExtractRunningRef.current = false;
    })();

    return () => { extractAbortRef.current = true; autoExtractRunningRef.current = false; };
  }, [profile?.blogId, repState, blogPosts, extractingAll, extractRepFor]);

  // 키워드 SoT — 키워드순위가 쓰는 keyword_rank_lookups를 그대로 읽는다(스펙 #10).
  // 이 화면은 여기에 자기만의 키워드를 만들어 넣지 않으므로 키워드 수정이 양쪽에서 어긋날 수 없다.
  const { data: sharedKeywordState } = useQuery({
    queryKey: ['keyword-ranking-state', profile?.blogId],
    queryFn: () => fetchSharedKeywordState(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (sharedKeywordState) {
      setPostKeywords(sharedKeywordState.postKeywords || {});
      setKeywordMeta(sharedKeywordState.keywordMeta || {});
    }
  }, [sharedKeywordState]);

  useEffect(() => {
    // syncedState는 외부 fetch 응답이라 필드가 비어있어도 briefingResults가 undefined가 되지 않도록 방어한다.
    if (syncedState) setBriefingResults(syncedState.briefingResults || {});
  }, [syncedState]);

  // 2026-07-04(6차) 오렌지 지시: 진행 단계를 실시간으로 보여주기 위해 NDJSON 스트리밍 응답을 소비.
  // 캐시 적중/검증 실패/접근 거부 등은 서버가 여전히 일반 JSON으로 즉시 응답하므로
  // content-type으로 분기해서 두 경로 모두 처리한다.
  const checkSingleKeyword = async (post: BlogPost, keyword: string): Promise<{ ok: boolean; status: number; cached: boolean; result: BriefingResult | null; errorMsg?: string | null }> => {
    if (!profile || !keyword.trim()) return { ok: false, status: 0, cached: false, result: null };
    const kw = keyword.trim();
    const key = rankKey(post.id, kw);
    // 확인 실패를 "미확인"과 구분해 DB에 남긴다(정확도 원칙 #8) — UI엔 즉시 "일시적 오류"로 반영.
    const persistTransient = (msg?: string) => {
      saveBriefingErrorToDb(profile.blogId, post.id, kw, 'transient_error', msg);
      setBriefingResults(prev => {
        const prevRes = prev[key];
        return {
          ...prev,
          [key]: {
            ...(prevRes ?? EMPTY_BRIEFING),
            checkStatus: 'transient_error',
            lastError: msg ?? null,
            // 확인 실패는 두 표면 모두 "미확인"이다 — 직전 exposed 값을 그대로 두면 실패가 결과로 오독된다.
            briefingStatus: 'UNVERIFIED', briefingError: msg ?? null,
            tabStatus: 'UNVERIFIED', tabError: msg ?? null,
            checkingStartedAt: null,
          },
        };
      });
    };
    // 성공 저장(fire-and-forget) + 서버측 이력 스냅샷 insert가 커밋될 시간을 주고 타임라인을 갱신한다.
    const refreshHistorySoon = () => {
      setTimeout(() => { queryClient.invalidateQueries({ queryKey: ['ai-briefing-history', profile.blogId] }); }, 1200);
    };
    setCheckingKey(key);
    setCheckingStage('searching');
    // 확인 시작을 DB에도 남긴다. 브라우저를 닫거나 배치가 중단돼도 이 행은 "확인중"으로 남았다가
    // 5분 뒤 조회 시 "미확인"으로 회수된다 — 절대 미인용으로 굳지 않는다.
    markCheckingInDb(profile.blogId, post.id, kw);
    try {
      const res = await fetch('/api/blog/check-ai-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId: profile.blogId,
          postId: post.id,
          keyword: keyword.trim(),
        }),
      });

      if (!res.ok) {
        let errMsg = `AI 브리핑 확인 실패 (오류 ${res.status}).`;
        if (res.status === 429) {
          // 클라이언트 레이트리밋 — 네이버 확인 자체를 시도하지 않았으므로 상태를 남기지 않는다.
          // 다만 직전에 찍은 '확인중' 표시는 지운다. 그대로 두면 돌고 있지도 않은 확인이 5분간 확인중으로 보인다.
          errMsg = '요청이 너무 많습니다. 5분 후 다시 시도해주세요.';
          clearCheckingInDb(profile.blogId, post.id, kw);
          showError(errMsg);
        } else {
          const body = await res.json().catch(() => null);
          const msg = body?.error || `${errMsg} 잠시 후 다시 시도해주세요.`;
          errMsg = msg;
          showError(msg, 8000);
          persistTransient(typeof body?.error === 'string' ? body.error : undefined);
        }
        return { ok: false, status: res.status, cached: false, result: null, errorMsg: errMsg };
      }

      const isStream = res.headers.get('content-type')?.includes('application/x-ndjson') && res.body;
      if (!isStream) {
        // 캐시 적중 등 — 일반 JSON 즉시 응답
        const data = await res.json();
        const parsed = fromEngineResult(data);
        setBriefingResults(prev => ({ ...prev, [key]: parsed }));
        saveBriefingResultToDb(profile.blogId, post.id, kw, data, post.url);
        refreshHistorySoon();
        return { ok: true, status: res.status, cached: data?.cached === true, result: parsed };
      }

      // NDJSON 스트림: 줄 단위로 진행 단계({stage}) 및 최종 결과({stage:'done'|'error', ...})를 수신
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData: (Record<string, unknown> & { error?: string }) | null = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let msg: { stage?: string; error?: string; result?: Record<string, unknown> };
          try { msg = JSON.parse(line); } catch { continue; }
          if (msg.stage === 'error') {
            streamError = msg.error || 'AI 브리핑 확인 중 오류';
          } else if (msg.stage === 'done') {
            finalData = msg.result || null;
            setCheckingStage('done');
          } else if (msg.stage) {
            setCheckingStage(msg.stage);
          }
        }
      }

      if (streamError) {
        showError(streamError, 8000);
        persistTransient(streamError);
        return { ok: false, status: res.status, cached: false, result: null, errorMsg: streamError };
      }
      if (finalData) {
        const parsed = fromEngineResult(finalData);
        setBriefingResults(prev => ({ ...prev, [key]: parsed }));
        // DB에는 표면 객체가 들어있는 원본을 그대로 보낸다 — 서버가 표면별 상태를 직접 읽는다.
        saveBriefingResultToDb(profile.blogId, post.id, kw, finalData, post.url);
        refreshHistorySoon();
        return { ok: true, status: res.status, cached: false, result: parsed };
      }
      showError('AI 브리핑 확인 결과를 받지 못했습니다. 잠시 후 다시 시도해주세요.', 8000);
      persistTransient('확인 결과를 받지 못했습니다.');
      return { ok: false, status: res.status, cached: false, result: null };
    } catch {
      showError('네트워크 오류로 AI 브리핑을 확인하지 못했습니다.');
      persistTransient('네트워크 오류');
      return { ok: false, status: 0, cached: false, result: null };
    } finally {
      setCheckingKey('');
      setCheckingStage('');
    }
  };

  // 입력한 키워드가 이미 어떤 게시물의 타겟 키워드로 등록돼 있으면 그 게시물로 자동 매칭
  function matchPostForKeyword(kw: string): BlogPost | null {
    const norm = kw.trim().toLowerCase();
    if (!norm) return null;
    const matches = blogPosts.filter(p =>
      (postKeywords[p.id] || []).some(k => k.trim().toLowerCase() === norm),
    );
    if (matches.length === 0) return null;
    return matches.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))[0];
  }

  const runFullAnalysis = async (post: BlogPost, kw: string) => {
    if (!profile || aiCheckRef.current) return; // 중복 클릭 차단(이중 조회·차단 위험 방지)
    aiCheckRef.current = true;
    setAnalyzing(true);
    try {
      const [briefingRes, volumeRes, relatedRes] = await Promise.all([
        checkSingleKeyword(post, kw),
        fetch(`/api/search-volume?keyword=${encodeURIComponent(kw)}`)
          .then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/related-keywords', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keyword: kw, limit: 50 }),
        }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!briefingRes.ok || !briefingRes.result) return;

      const volMatch = volumeRes?.keywords?.find((k: { keyword: string }) => k.keyword === kw) ?? volumeRes?.keywords?.[0];
      const entry: AnalysisEntry = {
        keyword: kw,
        post,
        briefing: briefingRes.result,
        searchVolume: volMatch ? { total: volMatch.monthlyTotal, competition: volMatch.competition } : null,
        relatedCount: typeof relatedRes?.total === 'number' ? relatedRes.total : null,
        checkedAt: new Date().toISOString(),
      };
      setActiveAnalysis(entry);
      setAnalysisHistory(prev => [entry, ...prev.filter(h => !(h.post.id === post.id && h.keyword === kw))]);

      fetch(STATE_API, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId: profile.blogId, postId: post.id, keyword: kw, result: briefingRes.result,
          searchVolume: entry.searchVolume, relatedKeywordCount: entry.relatedCount,
        }),
      }).catch(() => {});
    } finally {
      setAnalyzing(false);
      aiCheckRef.current = false;
    }
  };

  const handleAnalyze = async () => {
    const kw = analyzeKeyword.trim();
    if (!kw || analyzing) return;
    setPendingPostPick(null);
    const post = matchPostForKeyword(kw);
    if (!post) { setPendingPostPick(kw); setPostPickSearch(''); return; }
    await runFullAnalysis(post, kw);
  };

  const handlePickPost = async (post: BlogPost) => {
    if (!profile || !pendingPostPick) return;
    const kw = pendingPostPick;
    // 키워드순위와 같은 저장소에 등록한다 — 이 화면 전용 키워드를 따로 만들지 않는다(스펙 #10).
    const kws = [...new Set([...(postKeywords[post.id] || []), kw])];
    setPostKeywords(prev => ({ ...prev, [post.id]: kws }));
    saveSharedKeywords(profile.blogId, post.id, kws, post.url);
    setPendingPostPick(null);
    await runFullAnalysis(post, kw);
  };

  // 30분 경과 시 SWR 방식으로 딱 1번만 백그라운드 재확인 (연속 polling 아님 — 크롤링 비용/네이버 차단 위험 때문)
  useEffect(() => {
    if (!activeAnalysis) return;
    const CHECK_INTERVAL_MS = 60_000;
    const STALE_MS = 30 * 60 * 1000;
    const id = setInterval(() => {
      if (analyzing) return;
      const age = Date.now() - new Date(activeAnalysis.checkedAt).getTime();
      if (age > STALE_MS) runFullAnalysis(activeAnalysis.post, activeAnalysis.keyword);
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnalysis, analyzing]);

  // 결과 히스토리를 서버(DB) 상태에서 하이드레이션
  useEffect(() => {
    if (!syncedState) return;
    const results = syncedState.briefingResults || {};
    const entries: AnalysisEntry[] = Object.entries(results).map(([k, r]) => {
      const sep = k.indexOf('::');
      const postId = k.slice(0, sep);
      const keyword = k.slice(sep + 2);
      const post = blogPosts.find(p => p.id === postId) || {
        id: postId, title: postId, url: '', commentCount: 0, date: '', isPublic: true,
      };
      return {
        keyword,
        post,
        briefing: r,
        searchVolume: typeof r.searchVolumeMonthly === 'number'
          ? { total: r.searchVolumeMonthly, competition: r.competition || '' } : null,
        relatedCount: r.relatedKeywordCount ?? null,
        checkedAt: r.checkedAt || new Date().toISOString(),
      };
    }).sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime());
    setAnalysisHistory(entries);
  }, [syncedState, blogPosts]);

  if (authLoading) {
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

  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <h1 className="type-page-title">AI 브리핑 · AI 탭</h1>
        <p className="text-sm text-dim leading-relaxed">
          로그인하시면 본인의 작업 데이터를 저장하고 다른 기기에서도 이어서 작업할 수 있습니다.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/auth/login?redirect=/my/naver-mate"
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

  if (!profile || !profile.blogId) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <h1 className="type-page-title">AI 브리핑 · AI 탭</h1>
        <p className="text-sm text-dim">블로그 주소가 필요합니다.</p>
        <Link href="/profile" className="inline-block px-6 py-3 bg-accent text-white font-bold rounded-xl">
          마이페이지에서 블로그 연결
        </Link>
      </div>
    );
  }

  // 대표 키워드 — post_representative_keywords(키워드순위와 공유하는 공용 소스)의 값 그대로(스펙 #1).
  const getPrimaryKeyword = (post: BlogPost): string | null =>
    (repKeywords[post.id]?.keyword || '').trim() || null;

  /**
   * 이 포스팅의 조회 대상 키워드 행(스펙 #2 — 조회 단위는 포스팅이 아니라 키워드).
   * 대표 키워드를 맨 앞에 두고, 키워드순위에 등록된 나머지 키워드를 뒤에 붙인다.
   * 두 소스 모두 키워드순위가 쓰는 것과 동일한 저장소라 새 키워드를 만들지 않는다.
   */
  const keywordRowsFor = (post: BlogPost): { keyword: string; isPrimary: boolean }[] => {
    const rep = getPrimaryKeyword(post);
    const rows: { keyword: string; isPrimary: boolean }[] = [];
    const seen = new Set<string>();
    if (rep) { rows.push({ keyword: rep, isPrimary: true }); seen.add(rep); }
    for (const kw of (postKeywords || {})[post.id] || []) {
      const k = (kw || '').trim();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      rows.push({ keyword: k, isPrimary: keywordMeta[rankKey(post.id, k)]?.isPrimary === true });
    }
    return rows;
  };

  /**
   * 표시·집계에 쓸 확인 결과. 대표 키워드가 바뀐 뒤의 행은 이전 키워드로 확인한 결과이므로 무효로 본다(스펙 #9).
   * 저장된 결과 자체는 지우지 않고(스펙 #13) 화면에서만 "확인 전"으로 되돌려 새·옛 키워드 결과가 섞이지 않게 한다.
   * keyword_changed_at 컬럼이 아직 없는 환경에서는 changedAt이 비어 자연히 무효화가 일어나지 않는다.
   */
  const resultFor = (postId: string, keyword: string, isPrimary: boolean): BriefingResult | undefined => {
    const r = (briefingResults || {})[rankKey(postId, keyword)];
    if (!r || !isPrimary) return r;
    const changedAt = repKeywords[postId]?.keywordChangedAt;
    if (!changedAt || !r.checkedAt) return r;
    return new Date(r.checkedAt).getTime() < new Date(changedAt).getTime() ? undefined : r;
  };

  // 대표 키워드가 바뀌어 재검사가 필요한 상태인지(스펙 #9)
  const repNeedsRecheck = (postId: string, keyword: string): boolean => {
    const raw = (briefingResults || {})[rankKey(postId, keyword)];
    return !!raw?.checkedAt && !resultFor(postId, keyword, true);
  };

  // 단일 (포스팅, 키워드) 행의 상태 — "상태" 컬럼(스펙 #7/#8)
  const keywordStatus = (postId: string, keyword: string, isPrimary = false): CitationState => {
    const key = rankKey(postId, keyword);
    if (checkingKey === key) return 'checking';
    const r = resultFor(postId, keyword, isPrimary);
    return computeCitationStatus({
      briefingStatus: r?.briefingStatus, tabStatus: r?.tabStatus,
      exposed: r?.exposed, tabExposed: r?.tabExposed, checkStatus: r?.checkStatus, checkedAt: r?.checkedAt,
      checkingStartedAt: r?.checkingStartedAt,
    });
  };

  // 포스팅 단위 판정은 대표 키워드 결과 하나로만 한다(스펙 #10/#11) —
  // 보조 키워드 결과까지 합치면 같은 포스팅이 여러 상태로 중복 집계된다.
  const postRepResult = (postId: string): BriefingResult | undefined => {
    const rep = (repKeywords[postId]?.keyword || '').trim();
    return rep ? resultFor(postId, rep, true) : undefined;
  };

  /**
   * 두 표면 모두 인용/미인용까지 확정됐고, 그 확인이 아직 신선한지.
   * 한쪽이라도 미확정이면 "다시 확인해야 할 대상"이다 — 실패를 확정처럼 굳히지 않기 위함(스펙 §7).
   */
  const isResultFresh = (r?: BriefingResult): boolean => {
    if (!r?.checkedAt) return false;
    const b = briefingSurfaceStatus(r);
    const t = tabSurfaceStatus(r);
    const settled = (s: SurfaceStatusValue | null) => s === 'CITED' || s === 'NOT_CITED';
    if (!settled(b) || !settled(t)) return false;
    return Date.now() - new Date(r.checkedAt).getTime() < CITATION_FRESH_TTL_MS;
  };

  /**
   * 상단 통계 카드 — AI 브리핑·AI 탭 인용 여부를 채널별로 "독립" 집계한다.
   * 포스팅당 대표 키워드 결과 1건만 세므로 중복 집계가 없고, 확인하지 않은 건 임의 추정하지 않는다.
   * 미확인·확인불가·오류는 어느 쪽 '미인용'에도 넣지 않고 unresolved 로만 센다.
   * 분기 순서는 matchesBriefingFilter 와 동일해야 한다(카드 숫자 = 탭 필터 결과 수).
   */
  const channelCounts = blogPosts.reduce((acc, post) => {
    const r = postRepResult(post.id);
    const b = briefingSurfaceStatus(r);
    const t = tabSurfaceStatus(r);
    if (!b && !t) { acc.unchecked += 1; return acc; }
    if (b === 'CITED') acc.briefingExposed += 1;
    if (t === 'CITED') acc.tabExposed += 1;
    if (b === 'NOT_CITED' && t === 'NOT_CITED') acc.bothMissing += 1;
    else if (b !== 'CITED' && t !== 'CITED') acc.unresolved += 1;
    return acc;
  }, { briefingExposed: 0, tabExposed: 0, bothMissing: 0, unchecked: 0, unresolved: 0 });

  // 아직 제목 분석이 끝나지 않은 포스팅 수 — 헤더의 "키워드 추출" CTA에 표시(스펙 #1)
  const missingKeywordCount = blogPosts.filter(p => !(repKeywords[p.id]?.keyword || '').trim()).length;

  // 기간 → 검색 → 상태 → 정렬 순으로 필터(키워드순위 화면과 동일 로직, 스펙 #1/#17).
  // 초기 return 이후에도 안전하도록 훅이 아닌 일반 계산으로 둔다(rules-of-hooks).
  const filteredPosts = ((): BlogPost[] => {
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
    let list = blogPosts.filter(p => {
      const t = new Date((p.date || '').replace(/\./g, '-')).getTime();
      if (isNaN(t)) return true; // 날짜 파싱 실패 시 포함(누락 방지)
      return t >= from && t <= to;
    });

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(p => {
        if ((p.title || '').toLowerCase().includes(q)) return true;
        const entry = repKeywords[p.id];
        if (entry?.keyword?.toLowerCase().includes(q)) return true;
        return (entry?.candidates || []).some(c => c.toLowerCase().includes(q));
      });
    }

    if (filter !== 'all') {
      list = list.filter(post => matchesBriefingFilter(filter, postRepResult(post.id)));
    }

    const arr = [...list];
    arr.sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      const ta = new Date((a.date || '').replace(/\./g, '-')).getTime() || 0;
      const tb = new Date((b.date || '').replace(/\./g, '-')).getTime() || 0;
      return sortBy === 'oldest' ? ta - tb : tb - ta;
    });
    return arr;
  })();

  // 클라이언트 페이지네이션(전체 목록 로드 후 화면만 분할)
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pagePosts = filteredPosts.slice((safePage - 1) * postsPerPage, safePage * postsPerPage);

  // ── 안전 배치 큐(스펙 #9~#15) ──────────────────────────────────────────────
  // 대표키워드가 없으면 신규 추출 대상, 있으면 최근 확인(fresh)이 아니면 재조회 대상.
  const needsBulkCheck = (post: BlogPost): boolean => {
    const kw = getPrimaryKeyword(post);
    if (!kw) return true;
    // 키워드가 바뀐 뒤라면 이전 결과는 무효라 다시 확인 대상이다(스펙 #9).
    return !isResultFresh(resultFor(post.id, kw, true));
  };


  // 예상 작업량/쿼터를 서버에서 계산해 확인 모달을 연다(즉시 900개 호출 금지, 스펙 #9).
  const openBulkModal = async () => {
    if (!profile || bulkRunning) return;
    setBulkModalOpen(true);
    setBulkEstimate(null);
    setBulkLoadingEstimate(true);
    try {
      const res = await fetch(`/api/blog/ai-citation-estimate?blogId=${encodeURIComponent(profile.blogId)}`);
      if (res.ok) setBulkEstimate(await res.json());
      else { showError('예상 작업량을 불러오지 못했습니다.'); setBulkModalOpen(false); }
    } catch {
      showError('예상 작업량을 불러오지 못했습니다.'); setBulkModalOpen(false);
    } finally {
      setBulkLoadingEstimate(false);
    }
  };

  // 실제 배치 실행: 신규 확인 대상 중 최신순 최대 BULK_RUN_CAP건을, 건당 지연을 두고 순차 확인(재개형).
  const runBulk = async () => {
    if (!profile || bulkRunning || bulkRunningRef.current) return;
    setBulkModalOpen(false);
    setBulkNotice(null);
    bulkAbortRef.current = false;
    // 예상 모달은 전체 블로그 기준이므로, 배치도 현재 필터가 아니라 전체 목록(최신순)에서 대상을 고른다.
    const targets = blogPosts.filter(needsBulkCheck).slice(0, BULK_RUN_CAP);
    if (targets.length === 0) {
      showError('새로 확인할 포스팅이 없습니다. (모두 최근 확인됨)', 4000);
      return;
    }
    bulkRunningRef.current = true;
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: targets.length, current: '' });
    let halted = false;
    // 중단 사유를 구분한다 — 'blocked'(네이버 제한)와 'auth'(로그인 끊김·권한 없음)는
    // 사용자가 해야 할 일이 완전히 다르다.
    let haltReason: 'blocked' | 'auth' = 'blocked';
    for (let i = 0; i < targets.length; i++) {
      if (bulkAbortRef.current) break;
      const post = targets[i];
      setBulkProgress(p => ({ ...p, current: post.title }));
      let kw = getPrimaryKeyword(post);
      if (!kw) kw = await extractRepFor(post);
      if (!kw) { setBulkProgress(p => ({ ...p, done: p.done + 1 })); continue; } // 대표키워드 없음 → 확인 전 유지, 건너뜀
      const res = await checkSingleKeyword(post, kw);
      setBulkProgress(p => ({ ...p, done: p.done + 1 }));
      if (!res.ok) {
        // 로그인이 끊겼거나(401) 권한·플랜이 없으면(403) 남은 포스팅도 전부 같은 이유로 실패한다.
        // 예전에는 이 두 경우를 멈춤 조건에서 빠뜨려서, 배치가 끝까지 돌며 포스팅마다 오류를
        // 띄우고 마지막에 "이번 배치 확인을 완료했습니다"라고 알렸다 — 한 건도 확인하지 못했는데도.
        // 상태 코드로 판정한다. 오류 문구를 정규식으로 읽는 방식은 문구가 바뀌면 조용히 깨진다.
        if (res.status === 401 || res.status === 403) { halted = true; haltReason = 'auth'; break; }
        const blocked = res.status === 429 || (!!res.errorMsg && /(접근|제한|너무 많)/.test(res.errorMsg));
        if (blocked) { halted = true; break; }
      }
      if (i < targets.length - 1 && !bulkAbortRef.current) await sleep(BATCH_DELAY_MS);
    }
    bulkRunningRef.current = false;
    setBulkRunning(false);
    if (halted && haltReason === 'auth') {
      setBulkNotice('로그인이 만료되었거나 이 블로그를 확인할 권한이 없어 중단했습니다. 다시 로그인한 뒤 "전체 업데이트"를 눌러 주세요. 확인하지 못한 포스팅은 미확인 상태로 그대로 남습니다.');
    } else if (halted) {
      setBulkNotice('네이버 접근이 일시적으로 제한되어 중단했습니다. 잠시 후 다시 "전체 업데이트"를 눌러 이어서 확인하세요. 미확인 포스팅은 그대로 유지됩니다.');
    } else if (!bulkAbortRef.current) {
      setBulkNotice('이번 배치 확인을 완료했습니다. 남은 포스팅이 있으면 다시 실행해 이어서 확인할 수 있습니다.');
    }
    queryClient.invalidateQueries({ queryKey: ['ai-briefing-state', profile.blogId] });
  };

  /**
   * 대표 키워드를 사용자가 고른 값으로 확정한다(스펙 #2 — 직접 수정, 추출 후보 클릭 승격 공용).
   * keyword_source='manual'로 공용 테이블에 저장되어 키워드순위 화면에도 같은 값이 즉시 반영된다.
   * 키워드가 실제로 바뀌면 그 시점 이전 확인 결과는 무효가 된다(스펙 #9).
   */
  const applyRepKeyword = async (post: BlogPost, keyword: string) => {
    const kw = keyword.trim();
    if (!kw || !profile) return;
    const prevEntry = repKeywords[post.id];
    if (prevEntry?.keyword === kw) return;
    const nowIso = new Date().toISOString();
    setRepKeywords(prev => ({
      ...prev,
      [post.id]: {
        keyword: kw,
        source: 'manual',
        confidence: 1,
        candidates: [kw, ...(prev[post.id]?.candidates || []).filter(c => c !== kw)],
        keywordChangedAt: nowIso,
      },
    }));
    try {
      await fetch('/api/blog/representative-keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, postId: post.id, keyword: kw, title: post.title }),
      });
      queryClient.invalidateQueries({ queryKey: ['rep-keywords-state', profile.blogId] });
    } catch { /* 낙관적 UI */ }
  };

  const saveRepKeyword = async (post: BlogPost) => {
    const kw = repDraft.trim();
    setEditingRepPost('');
    await applyRepKeyword(post, kw);
  };

  // 대표키워드 점검 결과를 불러와 모달을 연다(재추출 전 카운트 확인, 스펙 #20/#21).
  const openAuditModal = async () => {
    if (!profile || auditLoading) return;
    setAuditOpen(true);
    setAuditData(null);
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/my/representative-keywords/audit?blogId=${encodeURIComponent(profile.blogId)}`);
      if (res.ok) setAuditData(await res.json());
      else { showError('대표키워드 점검에 실패했습니다.'); setAuditOpen(false); }
    } catch {
      showError('대표키워드 점검에 실패했습니다.'); setAuditOpen(false);
    } finally {
      setAuditLoading(false);
    }
  };

  // 사용자 확인 후에만 자동 추출분을 재추출한다(manual 제외, 네이버 무호출, 스펙 #19/#21).
  const runReextract = async () => {
    if (!profile || reextracting) return;
    setReextracting(true);
    try {
      const res = await fetch('/api/my/representative-keywords/reextract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, confirm: true }),
      });
      if (!res.ok) {
        // 서버는 사유를 한국어로 돌려준다(로그인 필요·권한 없음 등). 그걸 버리고
        // "오류가 발생했습니다"로 뭉개면 사용자는 다음에 뭘 해야 할지 알 수 없다.
        const d = await res.json().catch(() => ({}));
        showError(d.error || '재추출 중 오류가 발생했습니다.');
        return;
      }
      const data: { reextracted: number; changed: number; skippedManual: number } = await res.json();
      setAuditOpen(false);
      setAuditData(null);
      // 공용 소스가 바뀌었으니 대표키워드 상태를 새로고침해 키워드순위 화면과 즉시 동일 값이 되게 한다(스펙 #22).
      queryClient.invalidateQueries({ queryKey: ['rep-keywords-state', profile.blogId] });
      setBulkNotice(`대표키워드 ${data.reextracted}건 재추출 완료(${data.changed}건 변경). 변경된 포스팅은 순위·AI 인용을 다시 확인하면 새 키워드 기준으로 갱신됩니다.`);
    } catch {
      showError('재추출 중 오류가 발생했습니다.');
    } finally {
      setReextracting(false);
    }
  };

  // "다시 검사"(스펙 #5/#7) — 한 (포스팅, 키워드) 행만 재조회한다.
  const recheckKeyword = (post: BlogPost, keyword: string) => {
    if (!keyword || !!checkingKey || aiCheckRef.current) return; // 중복 클릭 차단(이중 조회·차단 위험 방지)
    aiCheckRef.current = true;
    checkSingleKeyword(post, keyword).finally(() => { aiCheckRef.current = false; });
  };

  const openAddKeyword = (postId: string) => { setAddingFor(postId); setAddValue(''); setAddError(''); };
  const closeAddKeyword = () => { setAddingFor(''); setAddValue(''); setAddError(''); };

  /**
   * 키워드 컬럼의 '＋ 키워드 추가' — 키워드순위와 같은 저장소(keyword_rank_lookups)에 넣는다(스펙 #10).
   * ⚠️ PUT은 "목록에 없는 키워드는 삭제" 시맨틱이라 반드시 기존 전체 목록에 이어붙여 보낸다.
   * 등록만 하고 자동 확인은 하지 않는다 — 브리핑 확인은 건당 30~50초라 사용자가 '검사'로 직접 시작한다.
   */
  const submitAddKeyword = (post: BlogPost) => {
    const kw = addValue.trim();
    if (!kw || !profile) return;
    setAddError('');

    const existing = postKeywords[post.id] || [];
    const norm = normalizeForCompare(kw);
    const rep = repKeywords[post.id]?.keyword;
    const known = new Set([...existing, ...(rep ? [rep] : [])].map(normalizeForCompare));
    if (known.has(norm)) {
      setAddError(
        rep && normalizeForCompare(rep) === norm
          ? `'${kw}'는 이미 대표 키워드입니다.`
          : `'${kw}'는 이미 이 포스팅에 등록된 키워드입니다.`,
      );
      return;
    }
    if (existing.length >= MAX_KEYWORDS_PER_POST) {
      setAddError(`이 포스팅은 키워드 ${MAX_KEYWORDS_PER_POST}개를 모두 사용했습니다. 기존 키워드를 삭제한 뒤 추가해주세요.`);
      return;
    }

    const next = [...existing, kw];
    setPostKeywords(prev => ({ ...prev, [post.id]: next }));
    saveSharedKeywords(profile.blogId, post.id, next, post.url);
    setAddValue(''); // 입력창은 열어둔 채 비워 연속 등록
  };

  // 제목을 다시 분석해 키워드 후보를 채운다(본문 보정 허용 — 개별 버튼이라 1회성, 스펙 #1/#2).
  const autoExtractRep = async (post: BlogPost, opts: { refine?: boolean } = {}) => {
    setExtractingPostId(post.id);
    try {
      autoExtractDoneRef.current.add(post.id);
      const kw = await extractRepFor(post, opts);
      if (!kw) showError('이 포스팅에서 키워드를 찾지 못했습니다. 직접 입력해주세요.', 5000);
    } finally {
      setExtractingPostId('');
    }
  };

  // 대표키워드 신뢰도가 낮으면(규칙 기반 추출이 애매) '확인 필요'로 표시(스펙 #13) — manual/충분히 확실하면 숨김.
  const repNeedsReview = (post: BlogPost): boolean => {
    const rk = repKeywords[post.id];
    if (!rk || rk.source === 'manual' || !rk.keyword) return false;
    return typeof rk.confidence === 'number' && rk.confidence < 0.6;
  };

  // ── 화면 조립 ────────────────────────────────────────────────────────────
  // 골격(헤더 → 지표카드 → 필터 → 표 → 부가영역)은 공용 DashboardLayout이 갖고,
  // 이 화면은 각 슬롯에 넣을 내용만 만든다 — 키워드순위 화면과 같은 구성.

  // 최상단 알림 — 오류·단건 확인 진행 상태
  const alertBanners = (
    <>
      {errorMessage && (
        <div className="px-4 py-3 rounded-xl bg-down/10 border border-down/30 text-down text-sm flex items-start gap-2">
          <span className="font-bold shrink-0">!</span>
          <span className="flex-1">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage('')}
            className="text-down/70 hover:text-down cursor-pointer text-xs shrink-0"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      )}
      {checkingKey && (
        <div className="px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-accent text-sm flex items-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block shrink-0" />
          <span className="flex-1">{STAGE_LABELS[checkingStage] || '확인 중...'}</span>
        </div>
      )}
    </>
  );

  // 주 CTA(전체 업데이트)는 DashboardLayout 의 primaryAction 슬롯이 그린다 — 키워드순위 헤더와 같은 치수·위치.
  // 여기에는 보조 버튼(키워드 추출·중단)과 더보기 메뉴만 남긴다.
  const headerActions = (
    <>
      {extractingAll ? (
            <CheckProgress current={extractProgress.current} total={extractProgress.total} label="키워드 추출 중" onStop={stopExtractingAll} />
          ) : missingKeywordCount > 0 && (
            <button
              onClick={extractAllRepresentative}
              className={actionButtonSecondaryClass}
              title="포스팅 제목을 분석해 검색 가능한 키워드를 추출합니다(네이버 호출 없음)."
            >
              키워드 추출 {missingKeywordCount.toLocaleString()}개
            </button>
          )}
          {bulkRunning && (
            <button
              onClick={() => { bulkAbortRef.current = true; }}
              className={actionButtonDangerClass}
              title="진행 중인 배치 확인을 중단합니다(이미 확인된 결과는 저장됩니다)."
            >
              중단
            </button>
          )}
          <MoreMenu menuWidth="w-44">
            {close => (
              <>
                <button
                  onClick={() => { openAuditModal(); close(); }}
                  disabled={blogPosts.length === 0 || auditLoading}
                  className={menuItemClass}
                  title="저장된 대표키워드를 점검해 잘못 추출된 것만 다시 추출합니다(네이버 무호출, 애매한 건만 AI 보정)."
                >
                  {auditLoading ? '점검 중...' : '대표키워드 점검'}
                </button>
                {canDownload && (
                  <button
                    onClick={() => { handleDownload(); close(); }}
                    disabled={blogPosts.length === 0}
                    className={menuItemClass}
                    title="포스팅의 AI 브리핑·AI 탭 확인 결과를 CSV 다운로드 (최대 500건)"
                  >
                    CSV 다운로드
                  </button>
                )}
                <button
                  onClick={() => { handleResetResults(); close(); }}
                  className={menuItemDangerClass}
                  title="모든 타겟 키워드와 AI 브리핑 데이터 초기화"
                >
                  초기화
                </button>
              </>
        )}
      </MoreMenu>
    </>
  );

  // 배치 진행률·결과 안내(스펙 #15)
  const bulkBanners = (
    <>
      {bulkRunning && (
        <div className="px-4 py-3 rounded-xl bg-accent/5 border border-accent/30 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-accent">
              {blogPostsTotal.toLocaleString()}개 중 {bulkProgress.done}개 확인 완료
              {bulkProgress.total > 0 && ` · ${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%`}
            </span>
            <span className="text-dim truncate max-w-[50%]" title={bulkProgress.current}>{bulkProgress.current}</span>
          </div>
          <div className="h-1.5 rounded-full bg-border/50 overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
      {bulkNotice && !bulkRunning && (
        <div className="px-4 py-3 rounded-xl bg-gold/10 border border-gold/30 text-xs text-text flex items-start gap-2">
          <span className="flex-1">{bulkNotice}</span>
          <button onClick={() => setBulkNotice(null)} className="text-dim hover:text-text cursor-pointer shrink-0" aria-label="닫기">✕</button>
        </div>
      )}
    </>
  );

  // 표 아래 부가 영역 — 확인 모달 2종 + 단건 즉시 확인 도구 + 분석 히스토리
  const footer = (
    <>
      {/* 대표키워드 점검·재추출 확인 모달(스펙 #18~21) */}
      <Modal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        closeOnEscape
        trapFocus
        role="dialog"
        ariaModal
        ariaLabel="대표키워드 점검 결과"
      >
        <div className="bg-surface rounded-2xl border border-border shadow-lg max-w-md w-full p-6 space-y-4">
          <h3 className="font-title text-lg font-extrabold">대표키워드 점검 결과</h3>
          {auditLoading || !auditData ? (
            <div className="py-8 text-center text-dim text-sm">저장된 대표키워드를 점검 중...</div>
          ) : (
            <>
              <div className="space-y-1.5 text-sm">
                {[
                  ['전체 포스팅', auditData.total],
                  ['정상', auditData.counts.normal],
                  ['재추출 권장', auditData.counts.suspicious],
                  ['미추출', auditData.counts.missing],
                  ['직접 지정(보호)', auditData.counts.manual],
                ].map(([label, v]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-dim">{label}</span>
                    <span className="font-rank font-bold">{v}</span>
                  </div>
                ))}
              </div>
              {auditData.samples.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
                  {auditData.samples.slice(0, 12).map(s => (
                    <div key={s.postId} className="px-2.5 py-1.5 text-[11px]">
                      <div className="truncate text-dim" title={s.title || ''}>{s.title || '(제목 없음)'}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-down line-through">{s.stored || '없음'}</span>
                        <span className="text-dim">→</span>
                        <span className="text-up font-medium">{s.suggested || '미확인'}</span>
                        {s.reason && <span className="text-[9px] text-dim">({s.reason})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-dim leading-relaxed">
                총 <b className="text-text">{auditData.reextractTarget}</b>개의 대표키워드를 제목 기준으로 다시 추출합니다.
                직접 지정한 키워드는 건드리지 않습니다. 네이버 호출이 없어 <b className="text-text">비용이 발생하지 않습니다</b>.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setAuditOpen(false)}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-bold border border-border hover:bg-surface-hover transition cursor-pointer">
                  취소
                </button>
                <button onClick={runReextract}
                  disabled={reextracting || auditData.reextractTarget === 0}
                  className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-accent text-white hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">
                  {reextracting ? '재추출 중...' : '대표키워드 다시 추출'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* 예상 작업량 확인 모달(스펙 #9~#12) */}
      <Modal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        closeOnEscape
        trapFocus
        role="dialog"
        ariaModal
        ariaLabel="전체 업데이트 예상 작업량"
      >
        <div className="bg-surface rounded-2xl border border-border shadow-lg max-w-md w-full p-6 space-y-4">
          <h3 className="font-title text-lg font-extrabold">전체 업데이트 — 예상 작업량</h3>
          {bulkLoadingEstimate || !bulkEstimate ? (
            <div className="py-8 text-center text-dim text-sm">예상 작업량을 계산 중...</div>
          ) : (
            <>
              <div className="space-y-1.5 text-sm">
                {[
                  ['전체 포스팅', bulkEstimate.totalPosts],
                  ['대표키워드 미추출', bulkEstimate.repMissing],
                  ['인용 미확인', bulkEstimate.unchecked],
                  ['최근 조회 캐시 제외', bulkEstimate.cacheSkipped],
                ].map(([label, v]) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-dim">{label}</span>
                    <span className="font-rank font-semibold">{Number(v).toLocaleString()}개</span>
                  </div>
                ))}
                <div className="h-px bg-border my-1" />
                <div className="flex items-center justify-between">
                  <span className="text-dim">예상 대표키워드 추출</span>
                  <span className="font-rank font-semibold">{bulkEstimate.estRepExtractions.toLocaleString()}건</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-dim">예상 확인 호출</span>
                  <span className="font-rank font-semibold">약 {bulkEstimate.estApiCalls.toLocaleString()}회</span>
                </div>
                <div className="flex items-center justify-between text-accent font-bold">
                  <span>실제 신규 조회</span>
                  <span className="font-rank">{bulkEstimate.newChecks.toLocaleString()}개</span>
                </div>
              </div>
              <div className="rounded-xl bg-bg border border-border p-3 text-[11px] text-dim leading-relaxed space-y-1">
                <p>· 이번 실행은 최신 발행순 <b className="text-text">최대 {bulkEstimate.perRunCap}개</b>만 확인합니다(안전 캡). 전체를 채우려면 약 <b className="text-text">{bulkEstimate.runsNeeded}회</b> 나눠 실행하세요.</p>
                <p>· AI 인용 확인은 공식 API가 없어 헤드리스 브라우저로 실측합니다 — 공식 쿼터는 없고, 네이버 차단을 피하려 {Math.round(bulkEstimate.betweenMs / 1000)}초 간격·{bulkEstimate.quota.aiCitation.limiterLimit}회/{Math.round(bulkEstimate.quota.aiCitation.limiterWindowSec / 60)}분으로 제한합니다.</p>
                <p>· 대표키워드 추출·검색량 보조에 쓰는 네이버 검색 OpenAPI 일일 무료 쿼터는 {bulkEstimate.quota.naverSearchOpenApi.dailyQuota.toLocaleString()}회입니다.</p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button onClick={() => setBulkModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border border-border hover:bg-bg cursor-pointer">취소</button>
                <button onClick={runBulk} disabled={bulkEstimate.newChecks === 0} className="px-4 py-2 rounded-xl text-sm font-bold bg-accent text-white hover:bg-accent-hover cursor-pointer disabled:opacity-50">조회 시작</button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* 단건 즉시 확인(보조 도구) — 전체 목록 아래에 둔다. 특정 키워드 하나를 바로 분석할 때 사용. */}
      <GlassCard padding="none">
        <div className="px-5 pt-5">
          <SectionHeader title="단건 즉시 확인" subtitle="특정 키워드 하나를 바로 분석 — 노출 여부·순위·검색량·경쟁도·관련 키워드까지 확인합니다" />
        </div>
        <form
          onSubmit={e => { e.preventDefault(); handleAnalyze(); }}
          className="px-5 pb-5 flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={analyzeKeyword}
            onChange={e => setAnalyzeKeyword(e.target.value)}
            placeholder="예: 천안맛집"
            className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition text-sm"
          />
          <button
            type="submit"
            disabled={!analyzeKeyword.trim() || analyzing}
            className="px-6 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            {analyzing ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                {STAGE_LABELS[checkingStage] || '분석 중...'}
              </span>
            ) : '분석하기'}
          </button>
        </form>

        {pendingPostPick && (
          <div className="mx-5 mb-5 p-4 rounded-xl border border-accent/30 bg-accent/5 space-y-2.5">
            <p className="text-xs text-dim">
              &ldquo;<b className="text-text">{pendingPostPick}</b>&rdquo;가 아직 어떤 게시물에도 타겟 키워드로 등록되어 있지 않습니다.
              분석할 게시물을 선택하면 이 키워드가 해당 게시물에 자동 등록됩니다.
            </p>
            <input
              type="text"
              value={postPickSearch}
              onChange={e => setPostPickSearch(e.target.value)}
              placeholder="게시물 제목 검색"
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-lg focus:border-accent outline-none transition"
            />
            <div className="max-h-52 overflow-y-auto space-y-1">
              {blogPosts
                .filter(p => !postPickSearch.trim() || p.title.toLowerCase().includes(postPickSearch.trim().toLowerCase()))
                .slice(0, 30)
                .map(post => (
                  <button
                    key={post.id}
                    onClick={() => handlePickPost(post)}
                    disabled={analyzing}
                    className="w-full text-left px-3 py-2 text-xs bg-surface hover:bg-accent/10 border border-border rounded-lg cursor-pointer transition disabled:opacity-50 truncate"
                    title={post.title}
                  >
                    {post.title}
                  </button>
                ))}
            </div>
            <button
              onClick={() => setPendingPostPick(null)}
              className="text-[11px] text-dim hover:text-text cursor-pointer"
            >
              취소
            </button>
          </div>
        )}

        {(activeAnalysis || analyzing) && (
          <div className="px-5 pb-5">
            {!activeAnalysis && analyzing ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-28 bg-border/20 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : activeAnalysis && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <ResultStatCard label="AI브리핑 노출" value={activeAnalysis.briefing.exposed ? '○' : 'X'} color={activeAnalysis.briefing.exposed ? 'up' : 'down'} spinning={analyzing} />
                  <ResultStatCard label="AI탭 노출" value={activeAnalysis.briefing.tabExposed ? '○' : 'X'} color={activeAnalysis.briefing.tabExposed ? 'up' : 'down'} spinning={analyzing} />
                  <ResultStatCard
                    label="노출 순위"
                    value={
                      activeAnalysis.briefing.sourceIndex ?? activeAnalysis.briefing.tabSourceIndex
                        ? `${activeAnalysis.briefing.sourceIndex ?? activeAnalysis.briefing.tabSourceIndex}위`
                        : '—'
                    }
                    spinning={analyzing}
                  />
                  <ResultStatCard
                    label="검색량"
                    value={activeAnalysis.searchVolume ? `${typeof activeAnalysis.searchVolume.total === 'number' ? activeAnalysis.searchVolume.total.toLocaleString() : activeAnalysis.searchVolume.total}회` : '—'}
                    spinning={analyzing}
                  />
                  <ResultStatCard
                    label="경쟁도"
                    value={activeAnalysis.searchVolume?.competition || '—'}
                    color={activeAnalysis.searchVolume?.competition === '낮음' ? 'up' : activeAnalysis.searchVolume?.competition === '높음' ? 'down' : 'gold'}
                    spinning={analyzing}
                  />
                  <ResultStatCard
                    label="관련 키워드"
                    value={activeAnalysis.relatedCount != null ? `${activeAnalysis.relatedCount}개` : '—'}
                    spinning={analyzing}
                  />
                </div>
                <p className="text-[11px] text-dim mt-2">
                  마지막 업데이트: {timeAgo(activeAnalysis.checkedAt)} · {activeAnalysis.post.title}
                </p>
              </>
            )}
          </div>
        )}
      </GlassCard>

      {/* 결과 히스토리 (단건 확인 이력) */}
      {analysisHistory.length > 0 && (
        <GlassCard padding="none">
          <div className="px-5 py-4 border-b border-border bg-bg/30">
            <h3 className="font-bold text-[15px]">분석 히스토리</h3>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-[11px] text-dim uppercase">
                  <th className="text-left px-4 py-3 font-semibold">키워드</th>
                  <th className="text-center px-3 py-3 font-semibold">AI브리핑</th>
                  <th className="text-center px-3 py-3 font-semibold">AI탭</th>
                  <th className="text-center px-3 py-3 font-semibold">노출순위</th>
                  <th className="text-center px-3 py-3 font-semibold">변경 이력</th>
                  <th className="text-center px-3 py-3 font-semibold">검색량</th>
                  <th className="text-center px-3 py-3 font-semibold">경쟁도</th>
                  <th className="text-center px-3 py-3 font-semibold">관련키워드</th>
                  <th className="text-right px-4 py-3 font-semibold">조회시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {analysisHistory.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE).map((h, idx) => (
                  <tr key={`${h.post.id}-${h.keyword}-${idx}`} className="hover:bg-surface-hover transition">
                    <td className="px-4 py-3 font-semibold">{h.keyword}</td>
                    <td className="text-center px-3 py-3"><BriefingLabelBadge result={h.briefing} /></td>
                    <td className="text-center px-3 py-3"><AiTabBadge result={h.briefing} /></td>
                    <td className="text-center px-3 py-3 text-xs text-dim">
                      {h.briefing.sourceIndex ?? h.briefing.tabSourceIndex ? `${h.briefing.sourceIndex ?? h.briefing.tabSourceIndex}위` : '—'}
                    </td>
                    <td className="text-center px-3 py-3">
                      <CitationTimeline entries={citationHistory?.[rankKey(h.post.id, h.keyword)]} />
                    </td>
                    <td className="text-center px-3 py-3 text-xs text-dim">
                      {h.searchVolume ? `${typeof h.searchVolume.total === 'number' ? h.searchVolume.total.toLocaleString() : h.searchVolume.total}` : '—'}
                    </td>
                    <td className="text-center px-3 py-3 text-xs text-dim">{h.searchVolume?.competition || '—'}</td>
                    <td className="text-center px-3 py-3 text-xs text-dim">{h.relatedCount != null ? `${h.relatedCount}개` : '—'}</td>
                    <td className="text-right px-4 py-3 text-[10px] text-dim">{timeAgo(h.checkedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-border/20">
            {analysisHistory.slice((historyPage - 1) * HISTORY_PER_PAGE, historyPage * HISTORY_PER_PAGE).map((h, idx) => (
              <div key={`${h.post.id}-${h.keyword}-${idx}`} className="px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{h.keyword}</span>
                  <span className="text-[10px] text-dim">{timeAgo(h.checkedAt)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-dim">
                  <span>브리핑</span><BriefingLabelBadge result={h.briefing} />
                  <span>탭</span><AiTabBadge result={h.briefing} />
                </div>
                {citationHistory?.[rankKey(h.post.id, h.keyword)] && citationHistory[rankKey(h.post.id, h.keyword)].length >= 2 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[11px] text-dim">이력</span>
                    <CitationTimeline entries={citationHistory[rankKey(h.post.id, h.keyword)]} />
                  </div>
                )}
                <div className="flex items-center gap-3 text-[11px] text-dim">
                  <span>검색량 {h.searchVolume ? (typeof h.searchVolume.total === 'number' ? h.searchVolume.total.toLocaleString() : h.searchVolume.total) : '—'}</span>
                  <span>경쟁도 {h.searchVolume?.competition || '—'}</span>
                  <span>관련 {h.relatedCount != null ? `${h.relatedCount}개` : '—'}</span>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            page={historyPage}
            totalPages={Math.ceil(analysisHistory.length / HISTORY_PER_PAGE)}
            onChange={setHistoryPage}
          />
        </GlassCard>
      )}

    </>
  );

  // 키워드 배지 종류 — 배지 모양은 analytics/constants.ts 가 단일 소스(키워드순위 표와 동일).
  const kindOf = (postId: string, row: { keyword: string; isPrimary: boolean }): keyof typeof KEYWORD_KIND_META => {
    if (row.isPrimary) return 'primary';
    const t = keywordMeta[rankKey(postId, row.keyword)]?.keywordType;
    return t === 'variant' ? 'variant' : t === 'secondary' ? 'secondary' : 'manual';
  };

  // 표 본문 — 포스팅 1개가 키워드 n행으로 펼쳐지므로 DataTable 의 renderRows 로 직접 그린다.
  // (헤더·Sticky·Loading·Empty·껍데기는 DataTable 이 소유한다)
  const renderPostRows = (post: BlogPost) => {
    const allRows = keywordRowsFor(post);
    const editing = editingRepPost === post.id;
    const needsReview = repNeedsReview(post);
    const entry = repKeywords[post.id];
    const expanded = !!expandedSecondary[post.id];
    // 자동 추출된 보조·변형만 접는다. 직접 추가한 키워드는 항상 보인다.
    const isFolded = (row: { keyword: string; isPrimary: boolean }) =>
      !row.isPrimary && kindOf(post.id, row) !== 'manual';
    const secondaryCount = allRows.filter(isFolded).length;
    const rows = expanded ? allRows : allRows.filter(r => !isFolded(r));

    const titleCell = (
      <td className="px-3 py-3 align-middle">
        <a href={post.url} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-xs hover:text-accent transition truncate block max-w-full" title={post.title}>
          {post.title}
        </a>
      </td>
    );

    // 대표 키워드 직접 입력 — 추출 후보를 눌러 바로 승격할 수도 있다(스펙 #2).
    const repEditor = (
      <div className="space-y-1">
        <input
          autoFocus
          value={repDraft}
          onChange={e => setRepDraft(e.target.value)}
          onBlur={() => saveRepKeyword(post)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); saveRepKeyword(post); }
            if (e.key === 'Escape') setEditingRepPost('');
          }}
          className="w-full px-2 py-1 text-xs bg-bg border border-accent rounded-lg outline-none"
          placeholder="대표 키워드"
        />
        {(entry?.candidates || []).length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {/* onMouseDown preventDefault: input 의 onBlur 저장이 먼저 터져 클릭이 씹히는 걸 막는다 */}
            {entry!.candidates!.map(c => (
              <button key={c} type="button" onMouseDown={e => e.preventDefault()}
                onClick={() => { setEditingRepPost(''); applyRepKeyword(post, c); }}
                className="max-w-full truncate px-1.5 py-0.5 rounded-full text-[10px] border text-dim bg-bg border-border/60 cursor-pointer hover:text-accent hover:border-accent/40">
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    );

    // 두 번째 Row — '＋ 키워드 추가'(키워드 열) + '대표 재추출'(관리 열)
    const addKeywordRow = (
      <tr className="hover:bg-surface-hover transition">
        {titleCell}
        <td className="px-3 py-2.5 align-top border-l border-border/40">
          <AddKeywordControl
            open={addingFor === post.id}
            value={addValue}
            error={addError}
            atLimit={(postKeywords[post.id] || []).length >= MAX_KEYWORDS_PER_POST}
            onOpen={() => openAddKeyword(post.id)}
            onClose={closeAddKeyword}
            onChange={v => { setAddValue(v); if (addError) setAddError(''); }}
            onSubmit={() => submitAddKeyword(post)}
          />
        </td>
        <td colSpan={5} className="border-l border-border/40" />
        <td className="px-3 py-2.5 text-center border-l border-border/40">
          <button type="button"
            onClick={() => autoExtractRep(post, { refine: true })}
            disabled={extractingPostId === post.id || extractingAll}
            className="text-[11px] text-dim/70 hover:text-accent hover:underline cursor-pointer disabled:opacity-40"
            title="제목을 다시 분석해 대표 키워드를 새로 뽑습니다">
            {extractingPostId === post.id ? '재추출 중…' : '대표 재추출'}
          </button>
        </td>
      </tr>
    );

    // 키워드가 없으면 확인할 대상이 없다 — 조회하지 않고 지정 안내만 보여준다(스펙 #9).
    if (allRows.length === 0) {
      return (
        <Fragment key={post.id}>
          <tr className="hover:bg-surface-hover transition">
            {titleCell}
            <td className="px-3 py-3 align-middle border-l border-border/40">
              {editing ? repEditor : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-dim">키워드 없음</span>
                  <button type="button" onClick={() => autoExtractRep(post, { refine: true })}
                    disabled={extractingPostId === post.id || extractingAll}
                    className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 bg-bg text-dim hover:text-accent hover:border-accent/40 cursor-pointer disabled:opacity-40">
                    {extractingPostId === post.id ? '추출 중…' : '자동 추출'}
                  </button>
                  <button type="button" onClick={() => { setEditingRepPost(post.id); setRepDraft(''); }}
                    className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 bg-bg text-dim hover:text-accent hover:border-accent/40 cursor-pointer">
                    직접 설정
                  </button>
                </div>
              )}
            </td>
            <td className="px-3 py-3 text-right text-[11px] text-dim border-l border-border/40">{post.date}</td>
            <td colSpan={5} className="px-3 py-3 text-center text-[11px] text-dim border-l border-border/40">
              키워드를 지정하면 AI 브리핑·AI 탭을 확인할 수 있습니다.
            </td>
          </tr>
          {addKeywordRow}
        </Fragment>
      );
    }

    return (
      <Fragment key={post.id}>
        {rows.map((row, j) => {
          const key = rankKey(post.id, row.keyword);
          const result = resultFor(post.id, row.keyword, row.isPrimary);
          const state = keywordStatus(post.id, row.keyword, row.isPrimary);
          const staleByKeywordChange = row.isPrimary && repNeedsRecheck(post.id, row.keyword);
          const kindMeta = KEYWORD_KIND_META[kindOf(post.id, row)];
          return (
            <Fragment key={key}>
              <tr className="group hover:bg-surface-hover transition">
                {titleCell}
                <td className="px-3 py-3 align-middle border-l border-border/40">
                  {row.isPrimary && editing ? repEditor : (
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${kindMeta.cls}`}>
                        {kindMeta.label}
                      </span>
                      <span
                        className={`text-xs font-semibold truncate ${row.isPrimary && needsReview ? 'text-down' : ''}`}
                        title={row.isPrimary && needsReview ? `${row.keyword} — 대표 키워드 확인 필요` : row.keyword}>
                        {row.keyword}
                      </span>
                      {j === 0 && secondaryCount > 0 && (
                        <button type="button" onClick={() => setExpandedSecondary(p => ({ ...p, [post.id]: !p[post.id] }))}
                          className="text-[10px] text-dim hover:text-accent cursor-pointer shrink-0"
                          title={expanded ? '보조 키워드 접기' : '보조 키워드 펼치기'}>
                          보조 {secondaryCount} {expanded ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right text-[11px] text-dim border-l border-border/40">
                  {j === 0 ? post.date : ''}
                </td>
                <td className="text-center px-3 py-3 border-l border-border/40"><BriefingLabelBadge result={result} /></td>
                <td className="text-center px-3 py-3"><AiTabBadge result={result} /></td>
                <td className="text-center px-3 py-3 border-l border-border/40">
                  <CitationStatusBadge state={state} />
                  {staleByKeywordChange && (
                    <div className="text-[9px] text-down mt-0.5" title="대표 키워드가 바뀌어 이전 확인 결과는 무효화되었습니다. 다시 검사해주세요.">
                      재검사 필요
                    </div>
                  )}
                </td>
                <td className="text-right px-3 py-3 text-[10px] text-dim"
                  title={result?.checkedAt ? new Date(result.checkedAt).toLocaleString('ko-KR') : undefined}>
                  {result?.checkedAt ? timeAgo(result.checkedAt) : '—'}
                </td>
                {/* 관리 — 보기 / 재검사 / 수정 (키워드순위 '관리' 열과 동일 배치) */}
                <td className="px-3 py-3 border-l border-border/40">
                  <div className="flex items-center justify-center gap-2">
                    <button onClick={() => setDetailKey(prev => prev === key ? '' : key)}
                      className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer">
                      {detailKey === key ? '닫기' : '보기'}
                    </button>
                    <button
                      onClick={() => recheckKeyword(post, row.keyword)}
                      disabled={!!checkingKey}
                      className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {checkingKey === key ? (
                        <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                      ) : '재검사'}
                    </button>
                    {row.isPrimary && (
                      <button type="button" onClick={() => { setEditingRepPost(post.id); setRepDraft(row.keyword); }}
                        className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer"
                        title="대표 키워드 직접 수정 — 키워드순위와 같은 값이 바뀝니다">수정</button>
                    )}
                  </div>
                </td>
              </tr>
              {detailKey === key && (
                <tr>
                  <td colSpan={8} className="px-4 pb-4 pt-1 bg-bg/30">
                    <CitationDetailPanel post={post} keyword={row.keyword} result={result} isPrimary={row.isPrimary} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        {addKeywordRow}
      </Fragment>
    );
  };

  // 모바일 카드 — 같은 데이터를 세로 카드로. 데스크톱 행과 같은 상태·동작을 유지한다.
  const renderPostCard = (post: BlogPost) => {
    const rows = keywordRowsFor(post);
    const needsReview = repNeedsReview(post);
    const entry = repKeywords[post.id];
    return (
      <div key={post.id} className="px-4 py-3.5 space-y-2">
        <div className="min-w-0">
          <a href={post.url} target="_blank" rel="noopener noreferrer"
            className="font-semibold text-sm hover:text-accent transition line-clamp-2">
            {post.title}
          </a>
          <span className="text-[10px] text-dim ml-1">{post.date}</span>
        </div>

        {editingRepPost === post.id && (
          <div>
            <input
              autoFocus
              value={repDraft}
              onChange={e => setRepDraft(e.target.value)}
              onBlur={() => saveRepKeyword(post)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); saveRepKeyword(post); }
                if (e.key === 'Escape') setEditingRepPost('');
              }}
              className="w-full px-2 py-1 text-xs bg-bg border border-accent rounded-lg outline-none"
              placeholder="대표 키워드"
            />
          </div>
        )}

        {/* 추출 후보(스펙 #2) — 편집 중일 때만 노출해 표와 같은 '대표 배지 + 키워드' 형태를 유지한다 */}
        {editingRepPost === post.id && (entry?.candidates || []).length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {entry!.candidates!.map(c => (
              <button key={c} type="button" onMouseDown={e => e.preventDefault()}
                onClick={() => { setEditingRepPost(''); applyRepKeyword(post, c); }}
                className="max-w-full truncate px-1.5 py-0.5 rounded-full text-[10px] border text-dim bg-bg border-border/60 cursor-pointer hover:text-accent">
                {c}
              </button>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-dim">
            <span>키워드 없음</span>
            <button type="button" onClick={() => autoExtractRep(post, { refine: true })}
              disabled={extractingPostId === post.id || extractingAll}
              className="hover:text-accent hover:underline disabled:opacity-40">
              {extractingPostId === post.id ? '추출 중…' : '자동 추출'}
            </button>
            <button type="button" onClick={() => { setEditingRepPost(post.id); setRepDraft(''); }}
              className="hover:text-accent hover:underline">직접 설정</button>
          </div>
        ) : rows.map(row => {
          const key = rankKey(post.id, row.keyword);
          const result = resultFor(post.id, row.keyword, row.isPrimary);
          const state = keywordStatus(post.id, row.keyword, row.isPrimary);
          const staleByKeywordChange = row.isPrimary && repNeedsRecheck(post.id, row.keyword);
          return (
            <div key={key} className="rounded-lg border border-border/60 bg-bg/40 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${KEYWORD_KIND_META[kindOf(post.id, row)].cls}`}>
                  {KEYWORD_KIND_META[kindOf(post.id, row)].label}
                </span>
                <span className="text-xs font-semibold">{row.keyword}</span>
                {row.isPrimary && (
                  <>
                    <button type="button" onClick={() => { setEditingRepPost(post.id); setRepDraft(row.keyword); }}
                      className="text-[10px] text-dim hover:text-accent hover:underline">수정</button>
                    {needsReview && repKeywords[post.id]?.source !== 'manual' && <span className="text-[9px] text-down">확인 필요</span>}
                  </>
                )}
                <span className="ml-auto"><CitationStatusBadge state={state} /></span>
                {staleByKeywordChange && (
                  <span className="text-[9px] text-down w-full">대표 키워드가 바뀌어 다시 검사가 필요합니다</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-[10px] text-dim">
                <span>브리핑</span><BriefingLabelBadge result={result} />
                <span>탭</span><AiTabBadge result={result} />
              </div>
              <div className="flex items-center gap-3 flex-wrap text-[11px]">
                <span className="text-dim text-[10px]">
                  마지막 확인 {result?.checkedAt ? timeAgo(result.checkedAt) : '—'}
                </span>
                <button
                  onClick={() => recheckKeyword(post, row.keyword)}
                  disabled={!!checkingKey}
                  className="ml-auto px-2.5 py-1 text-[11px] text-accent border border-accent/30 rounded-lg cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {checkingKey === key ? (
                    <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                  ) : result?.checkedAt ? '다시 검사' : '검사'}
                </button>
                <button
                  onClick={() => setDetailKey(prev => prev === key ? '' : key)}
                  className="text-[11px] text-dim hover:text-accent hover:underline cursor-pointer"
                >
                  {detailKey === key ? '닫기' : '상세'}
                </button>
              </div>
              {detailKey === key && (
                <CitationDetailPanel post={post} keyword={row.keyword} result={result} isPrimary={row.isPrimary} />
              )}
            </div>
          );
        })}

        <div className="flex items-center gap-3 flex-wrap">
          <AddKeywordControl
            open={addingFor === post.id}
            value={addValue}
            error={addError}
            atLimit={(postKeywords[post.id] || []).length >= MAX_KEYWORDS_PER_POST}
            onOpen={() => openAddKeyword(post.id)}
            onClose={closeAddKeyword}
            onChange={v => { setAddValue(v); if (addError) setAddError(''); }}
            onSubmit={() => submitAddKeyword(post)}
          />
          {rows.length > 0 && (
            <button type="button" onClick={() => autoExtractRep(post, { refine: true })}
              disabled={extractingPostId === post.id || extractingAll}
              className="ml-auto text-[11px] text-dim/70 hover:text-accent hover:underline cursor-pointer disabled:opacity-40">
              {extractingPostId === post.id ? '재추출 중…' : '대표 재추출'}
            </button>
          )}
        </div>
      </div>
    );
  };

  // 요약 지표(스펙 #11) — 키워드순위 화면과 동일한 MetricCardGrid 5장. 브리핑·탭은 각각 독립 집계.
  // tone 은 공용 상태 토큰이라 같은 성격의 지표가 두 화면에서 같은 색·아이콘으로 보인다.
  const metrics: MetricCardItem[] = [
    { key: 'total', label: '전체 포스팅', value: blogPostsTotal, tone: 'accent' },
    { key: 'briefing-exposed', label: 'AI 브리핑 인용', value: channelCounts.briefingExposed, tone: 'success' },
    { key: 'tab-exposed', label: 'AI 탭 인용', value: channelCounts.tabExposed, tone: 'success' },
    {
      key: 'missing',
      label: '미인용',
      value: channelCounts.bothMissing,
      tone: 'neutral',
      description: '두 영역 출처를 끝까지 확인했고 없었던 포스팅',
    },
    {
      key: 'unresolved',
      label: '미확인 · 확인불가 · 오류',
      value: channelCounts.unresolved + channelCounts.unchecked,
      tone: 'warning',
      // 미인용과 성격이 완전히 다른 값이라 내역을 함께 적는다.
      description: `확인 실패 ${channelCounts.unresolved.toLocaleString()} · 확인 전 ${channelCounts.unchecked.toLocaleString()}`,
    },
  ];

  // 표 컬럼 — 본문은 renderPostRows 가 그리므로 여기서는 헤더와 열 폭만 정의한다.
  const columns: DataTableColumn<BlogPost>[] = [
    { key: 'title', header: '포스팅 제목', width: 'w-[24%]' },
    { key: 'keyword', header: '키워드', width: 'w-[21%]', divider: true },
    { key: 'date', header: '작성일', align: 'right', width: 'w-[8%]', divider: true },
    { key: 'briefing', header: 'AI 브리핑', align: 'center', width: 'w-[10%]', divider: true },
    { key: 'aitab', header: 'AI 탭', align: 'center', width: 'w-[9%]' },
    { key: 'status', header: '상태', align: 'center', width: 'w-[9%]', divider: true },
    { key: 'checked', header: '마지막 확인', align: 'right', width: 'w-[7%]' },
    { key: 'manage', header: '관리', align: 'center', width: 'w-[12%]', divider: true },
  ];

  // 필터 영역 — 키워드순위 화면과 같은 FilterControlBar(기간 / 상태·검색·정렬) (스펙 #1/#17)
  const filters = (
    <FilterControlBar
      period={{
        period,
        onPeriod: p => { setPeriod(p); setCurrentPage(1); },
        customFrom,
        customTo,
        onCustomFrom: v => { setCustomFrom(v); setCurrentPage(1); },
        onCustomTo: v => { setCustomTo(v); setCurrentPage(1); },
        usingCustomRange,
        onResetCustom: () => { setCustomFrom(''); setCustomTo(''); setCurrentPage(1); },
      }}
      status={{
        options: BRIEFING_FILTER_OPTIONS.map((o): SegmentOption<BriefingFilter> => ({ value: o.key, label: o.label })),
        value: filter,
        onChange: v => { setFilter(v); setCurrentPage(1); },
      }}
      search={{
        value: searchQuery,
        onChange: v => { setSearchQuery(v); setCurrentPage(1); },
      }}
      sort={{ value: sortBy, onChange: setSortBy, options: POST_SORT_OPTIONS }}
      extra={
        <select
          value={postsPerPage}
          onChange={e => { setPostsPerPage(Number(e.target.value)); setCurrentPage(1); }}
          className={selectControlClass}
          title="페이지당 포스팅 수"
        >
          <option value={30}>30개씩</option>
          <option value={60}>60개씩</option>
          <option value={90}>90개씩</option>
        </select>
      }
    />
  );

  return (
    <DashboardLayout
      title="AI 브리핑 · AI 탭"
      description={`내 블로그 전체 포스팅의 대표키워드로 네이버 AI 브리핑·AI 탭 인용 여부를 확인·관리합니다. · 전체 ${postsLoading && blogPostsTotal === 0 ? '집계 중' : `${blogPostsTotal.toLocaleString()}개`}`}
      banners={<>{alertBanners}{bulkBanners}</>}
      primaryAction={bulkRunning ? undefined : {
        label: bulkLoadingEstimate ? '계산 중...' : '전체 업데이트',
        onClick: openBulkModal,
        disabled: blogPosts.length === 0 || bulkLoadingEstimate,
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></svg>,
        title: '전체 포스팅을 안전 배치(1회 소수·순차)로 확인합니다. 예상 작업량을 먼저 보여드립니다.',
      }}
      actions={headerActions}
      metrics={metrics}
      cardsLoading={postsLoading || fullListLoading}
      filters={filters}
      tableCount={fullListLoading
        ? `${filteredPosts.length.toLocaleString()}개 · 전체 목록 불러오는 중`
        : `${filteredPosts.length.toLocaleString()}개`}
      tableLoading={postsLoading}
      footer={footer}
    >
      {/* 표 본문 — 헤더 고정·로딩·빈 상태는 DataTable 이 담당한다 */}
      <DataTable<BlogPost>
        columns={columns}
        rows={pagePosts}
        rowKey={post => post.id}
        loading={postsLoading}
        minWidth="1200px"
        maxHeight="72vh"
        // 열 폭은 비율 배분 — 고정 px면 넓은 모니터에서 제목 열이 남는 폭을 전부 흡수해 키워드가 오른쪽으로 밀린다.
        tableClassName="table-fixed"
        empty={blogPosts.length === 0
          ? { title: '게시물을 수집하지 못했습니다.', description: '블로그 연결 상태를 확인한 뒤 다시 시도해주세요.' }
          : {
            title: '해당 조건의 포스팅이 없습니다.',
            description: '기간 또는 상태 필터를 변경해보세요.',
            action: (
              <button
                onClick={() => { setFilter('all'); setSearchQuery(''); setCustomFrom(''); setCustomTo(''); setCurrentPage(1); }}
                className={actionButtonSecondaryClass}
              >
                필터 초기화
              </button>
            ),
          }}
        renderRows={renderPostRows}
        renderMobileCard={renderPostCard}
        footer={<Pagination page={safePage} totalPages={totalPages} onChange={setCurrentPage} />}
      />
    </DashboardLayout>
  );
}
