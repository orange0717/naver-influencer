'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import Modal from '@/components/ui/Modal';
import { countIndexingWait, displayVerdict, classifyExposure, countByExposureClass, INDEXING_GRACE_HOURS, type MissingResultsMap, type MissingState, type MissingArea, type ExposureClass, type PostLike } from '@/lib/missing-rate';
import { verdictLabel, confidenceLabel, type ExposureVerdict } from '@/lib/exposure-verdict';
import { parseNaverPostDate } from '@/lib/naver-date';
import type { BloggerProfile, BlogPost } from './BlogAnalysisSection.helpers';
import { fetchWithTimeout, getProfileFromApi, CHECK_FRESH_MS } from './BlogAnalysisSection.helpers';
import { newViewToken, viewHeaders, readQuotaExceeded, type QuotaInfo } from '@/lib/analysis-view';
import AnalysisQuotaNotice from '@/components/AnalysisQuotaNotice';

const PERIOD_OPTIONS = [7, 15, 30, 90, 120, 0] as const; // 0 = 전체(일수 기준 아님)
type Period = typeof PERIOD_OPTIONS[number];
const PER_PAGE = 30;
const MAX_PAGES_ALL = 20; // 안전장치: 최대 600개까지만 조회
const DAY_MS = 24 * 60 * 60 * 1000;
// 페이지 진입 시 최근 발행글을 자동 검사하는 개수 — 최신 상태를 자동 갱신하되 대량 호출은 피한다.
// 이미 최근(CHECK_FRESH_MS 내) 검사된 글은 runBatch가 건너뛰므로 실제 호출은 이보다 적다.
const AUTO_CHECK_LIMIT = 30;

type SortKey = 'latest' | 'oldest' | 'title' | 'missingRate';
type AreaFilter = 'all' | MissingArea;
// §3 빠른 상태 필터 — 전체/노출(정상)/미노출/일부 노출/미확인
type StatusFilter = 'all' | 'normal' | 'partial' | 'missing' | 'unchecked';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'normal', label: '노출' },
  { key: 'missing', label: '미노출' },
  { key: 'partial', label: '일부 노출' },
  { key: 'unchecked', label: '미확인' },
];

type PostMissingEntry = MissingState;

// §7 노출↔미노출 전환 이력 (API /my/post-missing-history 응답)
type HistoryEntry = {
  prevState: 'exposed' | 'missing';
  newState: 'exposed' | 'missing';
  changedReason?: string | null;
  changedAt: string;
};

/** 절대 날짜 + 네이버 상대 시간("22시간 전"·"어제"·"3일 전") + ISO 까지 파싱 (공용 파서 위임, number→Date) */
function parsePostDate(raw?: string | null): Date | null {
  const t = parseNaverPostDate(raw);
  return t == null ? null : new Date(t);
}

function formatCheckedAt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function missingAreaCount(mr?: PostMissingEntry): number {
  if (!mr) return 0;
  let n = 0;
  if (mr.viewTab.exposed === false) n++;
  if (mr.blogTab.exposed === false) n++;
  if (mr.influencerTab?.exposed === false) n++;
  return n;
}

/** 미노출 원인 추정 — 검사 결과를 바탕으로 사용자에게 보여줄 설명 문구 생성(휴리스틱, 확정 진단 아님) */
function buildCauseAnalysis(mr?: PostMissingEntry): string[] {
  const notes: string[] = [];
  if (!mr) {
    notes.push('아직 검사하지 않은 게시글입니다. "검사" 버튼을 눌러 노출 여부를 먼저 확인하세요.');
    return notes;
  }
  if (mr.status === 'unanalyzable') {
    notes.push('이 게시글은 검색 노출 분석 대상이 아닙니다(비공개 글이거나 검색어를 만들 수 없는 제목). 미노출로 집계되지 않습니다.');
    return notes;
  }
  if (mr.status === 'error') {
    notes.push('직전 검사에서 네이버 검색 결과를 불러오지 못했습니다(일시적 오류). 이 경우 미노출로 처리하지 않으며, 잠시 후 재검사하면 정상 확인될 수 있습니다.');
    return notes;
  }
  if (mr.status === 'failed') {
    notes.push('직전 검사가 실패했습니다(네트워크·타임아웃 가능성). 재검사를 시도해보세요.');
  }
  const areas = [
    { label: '통합검색', exposed: mr.viewTab.exposed },
    { label: '블로그탭', exposed: mr.blogTab.exposed },
    { label: '인플루언서탭', exposed: mr.influencerTab?.exposed ?? null },
  ];
  const checkedAreas = areas.filter(a => a.exposed !== null);
  const missingAreas = areas.filter(a => a.exposed === false);
  const exposedAreas = areas.filter(a => a.exposed === true);
  if (missingAreas.length > 0 && missingAreas.length === checkedAreas.length) {
    notes.push(`검사한 모든 영역(${missingAreas.map(a => a.label).join(', ')})에서 노출이 확인되지 않았습니다. 제목 경쟁이 심하거나, 검색 결과 상위 30위 안에 들지 못했을 가능성이 있습니다.`);
  } else if (missingAreas.length > 0 && exposedAreas.length > 0) {
    notes.push(`${exposedAreas.map(a => a.label).join(', ')}에서는 노출되지만 ${missingAreas.map(a => a.label).join(', ')}에서는 확인되지 않았습니다. 탭별 검색 알고리즘 차이로 인한 결과일 수 있습니다.`);
  }
  if (missingAreas.length > 0 && mr.candidates && mr.candidates.length > 0) {
    notes.push(`검사에 사용한 검색어: "${mr.candidates.join('", "')}" (포스팅 제목 기반). 실제 색인 반영이 늦어졌을 수 있으니 아래 "재검사" 버튼으로 다시 확인해보세요.`);
  }
  if (missingAreas.length > 0 && (mr.searchVolume == null || mr.searchVolume === 0)) {
    notes.push('해당 검색어의 월간 검색량 데이터가 없습니다. 검색량이 매우 낮으면 순위 확인이 불안정할 수 있습니다.');
  }
  if (notes.length === 0) notes.push('현재 노출 상태가 양호합니다.');
  return notes;
}

// §4 게시글별 채널 노출 상태 배지 — 노출/미노출 + null 은 종합 상태(class)에 따라 확인중/확인실패/분석불가/미확인으로 구분.
// null 을 무조건 '미노출'로 표기하지 않는다(§4·§5).
function ExposureBadge({ exposed, post, mr, now = 0 }: { exposed: boolean | null | undefined; post?: PostLike; mr?: PostMissingEntry; now?: number }) {
  if (exposed === true) return <span className="text-[11px] font-bold text-up bg-up/10 px-2 py-0.5 rounded-full whitespace-nowrap">🟢 노출</span>;
  if (exposed === false) return <span className="text-[11px] font-bold text-down bg-down/10 px-2 py-0.5 rounded-full whitespace-nowrap">🔴 미노출</span>;
  // exposed == null — 이 게시글의 종합 상태로 null 셀의 의미를 구분(확인중/확인실패/분석불가/미확인).
  // post 가 있을 땐 호출측이 now 도 함께 넘긴다(목록 행). post 없는 상세 모달 셀은 'unchecked'로 처리.
  const c = post ? classifyExposure(post, mr, now) : 'unchecked';
  if (c === 'error') return <span className="text-[11px] font-semibold text-dim bg-border/40 px-2 py-0.5 rounded-full whitespace-nowrap">⚫ 확인실패</span>;
  if (c === 'checking') return <span className="text-[11px] font-semibold text-blue bg-blue/10 px-2 py-0.5 rounded-full whitespace-nowrap">⚪ 확인중</span>;
  if (c === 'unanalyzable') return <span className="text-[11px] font-semibold text-dim bg-border/40 px-2 py-0.5 rounded-full whitespace-nowrap">⚫ 분석불가</span>;
  return <span className="text-[11px] font-semibold text-dim bg-border/30 px-2 py-0.5 rounded-full whitespace-nowrap">미확인</span>;
}

// §5 종합 상태(class) 표기 메타 — 정상/일부 노출/미노출/확인 중/확인 실패/분석 불가/미확인.
// 확인 실패·분석 불가·확인 중·미확인은 절대 미노출로 표기하지 않는다(§5). 'missing' 은 isPostMissing 과 동일 기준(§12).
const CLASS_META: Record<ExposureClass, { emoji: string; text: string; cls: string }> = {
  normal:       { emoji: '🟢', text: '정상',      cls: 'text-up bg-up/10' },
  partial:      { emoji: '🟡', text: '일부 노출', cls: 'text-amber-600 bg-amber-500/15' },
  missing:      { emoji: '🔴', text: '미노출',    cls: 'text-down bg-down/10' },
  checking:     { emoji: '⚪', text: '확인 중',   cls: 'text-blue bg-blue/10' },
  error:        { emoji: '⚫', text: '확인 실패', cls: 'text-dim bg-border/40' },
  unanalyzable: { emoji: '⚫', text: '분석 불가', cls: 'text-dim bg-border/40' },
  unchecked:    { emoji: '⚪', text: '미확인',    cls: 'text-dim bg-border/30' },
};

function StatusBadge({ post, mr, isChecking, now }: { post: PostLike; mr?: PostMissingEntry; isChecking: boolean; now: number }) {
  if (isChecking) return <span className="text-[11px] font-bold text-blue bg-blue/10 px-2 py-0.5 rounded-full whitespace-nowrap">🔵 분석중</span>;
  const meta = CLASS_META[classifyExposure(post, mr, now)];
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}>{meta.emoji} {meta.text}</span>;
}

// 상세 모달 '최종 판정'용 서버 상태머신 판정(§19) 색상 — 종합 상태와 별개로 세부 verdict 를 그대로 보여준다.
const VERDICT_STYLE: Record<ExposureVerdict, string> = {
  exposed:      'text-up bg-up/10',
  missing:      'text-down bg-down/10',
  recheck:      'text-amber-600 bg-amber-500/15',
  checking:     'text-blue bg-blue/10',
  error:        'text-dim bg-border/40',
  unanalyzable: 'text-dim bg-border/40',
};

export default function MissingPostsSection() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  // 이 화면 mount 당 조회 토큰 1개 (미노출 분석 데이터 요청에 공통 사용)
  const [viewToken] = useState(() => newViewToken());
  const [period, setPeriod] = useState<Period>(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [missingResults, setMissingResults] = useState<MissingResultsMap>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  // §12 배치 검사 완료 요약 — "N개 확인 완료 · 노출 X · 미노출 Y". 다음 배치 시작 시 초기화.
  const [batchSummary, setBatchSummary] = useState<{ checked: number; exposed: number; missing: number; other: number } | null>(null);
  const [checkingPostId, setCheckingPostId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 대량 분석 확인 다이얼로그 대상 (§9~13) — 실제 네이버 검색이 발생할 글 수(toCheck)가 임계 이상일 때만 표시
  const [confirmBatch, setConfirmBatch] = useState<{ targets: BlogPost[]; toCheck: number; force: boolean } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all'); // §3 기본값 '전체'
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('latest');
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [detailChecking, setDetailChecking] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailHistory, setDetailHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const abortRef = useRef(false);
  const autoCheckedRef = useRef(false); // 진입 자동검사 1회만 실행

  useEffect(() => () => { abortRef.current = true; }, []);

  useEffect(() => {
    (async () => {
      const p = await getProfileFromApi();
      setProfile(p);
    })();
  }, []);

  const usingCustomRange = Boolean(customFrom || customTo);

  // 선택 기간의 시작일 (직접 선택 우선) — 최근 30일 통계 카드를 위해 최소 30일치는 항상 로드
  const rangeFrom = useMemo(() => {
    if (customFrom) return new Date(`${customFrom}T00:00:00`);
    if (period > 0) return new Date(Date.now() - period * DAY_MS);
    return null;
  }, [customFrom, period]);
  const rangeTo = useMemo(() => (customTo ? new Date(`${customTo}T23:59:59`) : null), [customTo]);
  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * DAY_MS), []);
  const fetchCutoff = useMemo(() => {
    if (usingCustomRange) return rangeFrom; // 직접 선택 시엔 정확히 그 범위만
    if (rangeFrom) return rangeFrom < thirtyDaysAgo ? rangeFrom : thirtyDaysAgo;
    return null; // 전체
  }, [usingCustomRange, rangeFrom, thirtyDaysAgo]);

  const fetchPosts = useCallback(async (blogId: string, cutoff: Date | null) => {
    setPostsLoading(true);
    try {
      const all: BlogPost[] = [];
      for (let page = 1; page <= MAX_PAGES_ALL; page++) {
        const res = await fetchWithTimeout(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${PER_PAGE}`);
        if (!res.ok) break;
        const data = await res.json();
        const pagePosts: BlogPost[] = data.posts || [];
        all.push(...pagePosts);
        if (pagePosts.length < PER_PAGE) break; // 마지막 페이지
        if (cutoff) {
          const lastDate = parsePostDate(pagePosts[pagePosts.length - 1].date);
          if (lastDate && lastDate < cutoff) break;
        }
      }
      setPosts(all);
    } catch {
      setErrorMessage('포스트 목록을 불러오지 못했습니다.');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const fetchMissingState = useCallback(async (blogId: string) => {
    try {
      const res = await fetchWithTimeout(
        `/api/my/post-missing-state?blogId=${encodeURIComponent(blogId)}`,
        { headers: viewHeaders(viewToken) },
      );
      if (!res.ok) {
        const exceeded = await readQuotaExceeded(res);
        if (exceeded) setQuota(exceeded);
        return;
      }
      const data = await res.json();
      setMissingResults(data.results || {});
    } catch { /* ignore */ }
  }, [viewToken]);

  // §7 특정 포스트의 노출↔미노출 전환 이력 로드 (상세 모달용)
  const fetchDetailHistory = useCallback(async (blogId: string, postId: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetchWithTimeout(
        `/api/my/post-missing-history?blogId=${encodeURIComponent(blogId)}&postId=${encodeURIComponent(postId)}`,
        { headers: viewHeaders(viewToken) },
      );
      if (!res.ok) { setDetailHistory([]); return; }
      const data = await res.json();
      setDetailHistory(Array.isArray(data.history) ? data.history : []);
    } catch { setDetailHistory([]); }
    finally { setHistoryLoading(false); }
  }, [viewToken]);

  useEffect(() => {
    if (!profile) return;
    fetchPosts(profile.blogId, fetchCutoff);
    fetchMissingState(profile.blogId);
  }, [profile, fetchCutoff, fetchPosts, fetchMissingState]);

  // 검사 1건 결과 — status(성공/실패) + 서버가 확정한 판정(verdict). 배치 완료 요약(§12)에서 노출/미노출 집계에 쓴다.
  type CheckOutcome = { status: 'ok' | 'failed'; verdict: ExposureVerdict | null };
  const checkOne = useCallback(async (post: BlogPost, opts?: { force?: boolean }): Promise<CheckOutcome> => {
    if (!profile) return { status: 'failed', verdict: null };
    // 비공개 글은 검색 노출 대상이 아니므로 네이버를 치지 않고 '분석불가'로 표시 (호출량·비용 절약)
    if (post.isPublic === false) {
      setMissingResults(prev => ({ ...prev, [post.id]: {
        blogTab: { exposed: null, rank: null },
        viewTab: { exposed: null, rank: null },
        influencerTab: { exposed: null, rank: null },
        status: 'unanalyzable', checkedAt: new Date().toISOString(),
      } }));
      return { status: 'ok', verdict: 'unanalyzable' };
    }
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch('/api/blog/check-missing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogId: profile.blogId, postTitle: post.title, postId: post.id, checkInfluencer: true, force: opts?.force }),
        });
        if (res.ok) {
          const data = await res.json();
          // 서버가 반환한 status(ok/error/unanalyzable)를 그대로 존중한다 — 'error'(일시적 오류)를 미노출로 오판하지 않기 위함
          const status = data.status || 'ok';
          setMissingResults(prev => ({ ...prev, [post.id]: { ...data, status, checkedAt: data.checkedAt || new Date().toISOString() } }));
          // 일시적 오류는 성공 검사로 치지 않는다 → 다음 재검사 때 다시 확인되도록 'failed' 취급(집계엔 영향 없음)
          if (status === 'error') return { status: 'failed', verdict: null };
          return { status: 'ok', verdict: (data.overallStatus as ExposureVerdict | null) ?? null };
        }
      } catch { /* 재시도 */ }
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 800 * attempt));
    }
    return { status: 'failed', verdict: null };
  }, [profile]);

  // 상세 패널에서 포스팅 제목 기반으로 강제 재검사 (캐시 무시, 최신 노출 여부 재확인)
  const recheckDetail = useCallback(async (post: BlogPost) => {
    setDetailChecking(true);
    setDetailError('');
    const { status } = await checkOne(post, { force: true });
    if (status === 'failed') setDetailError('재검사에 실패했습니다. 잠시 후 다시 시도해주세요.');
    else if (profile) fetchDetailHistory(profile.blogId, post.id); // 전환이 기록됐을 수 있으니 이력 갱신
    setDetailChecking(false);
  }, [checkOne, profile, fetchDetailHistory]);

  // §10 개별 게시글 '다시 검사' — 이 글 하나만 강제 재조회(전체 API 재호출 아님). 목록/카드는 checkOne 이 즉시 갱신.
  const recheckSingle = useCallback(async (post: BlogPost) => {
    if (checkingAll) return; // 배치 검사 중엔 개별 재검사 비활성
    setCheckingPostId(post.id);
    setBatchSummary(null);
    await checkOne(post, { force: true });
    setCheckingPostId(null);
  }, [checkingAll, checkOne]);

  // 실제로 네이버 검색이 발생할 글만 센다 — 비공개(분석불가)·최근 성공검사(캐시 신선)는 호출이 없으므로 조회량 추정에서 제외
  const willHitNaver = useCallback((post: BlogPost, now: number): boolean => {
    if (post.isPublic === false) return false;
    const ex = missingResults[post.id];
    const fresh = ex?.status === 'ok' && !!ex.checkedAt && (now - new Date(ex.checkedAt).getTime()) < CHECK_FRESH_MS;
    return !fresh;
  }, [missingResults]);

  const runBatch = useCallback(async (targets: BlogPost[], opts?: { force?: boolean }) => {
    if (!profile || targets.length === 0) return;
    setCheckingAll(true);
    setBatchSummary(null); // 이전 요약 초기화 — 새 배치가 시작됨
    abortRef.current = false;
    setCheckProgress({ current: 0, total: targets.length });
    const now = Date.now();
    // §12 완료 요약용 집계 — 실제로 이번 배치에서 확인(checkOne 호출)된 글만 센다(캐시로 건너뛴 글 제외).
    const tally = { checked: 0, exposed: 0, missing: 0, other: 0 };
    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) break;
      const post = targets[i];
      // force면 신선도 무시하고 공개글은 항상 재검사(사용자가 명시적으로 '다시 확인' 요청한 경우, §8)
      const hits = opts?.force ? post.isPublic !== false : willHitNaver(post, now);
      if (hits || post.isPublic === false) {
        // 비공개 글은 checkOne이 네이버 호출 없이 '분석불가'로 표시하고 즉시 반환
        setCheckingPostId(post.id);
        const { status, verdict } = await checkOne(post, { force: opts?.force });
        // 노출/미노출만 개별 집계, 그 외(재검사·확인중·분석불가·실패)는 '기타'. 미확인을 미노출로 세지 않는다(§10).
        if (status === 'ok') {
          tally.checked++;
          if (verdict === 'exposed') tally.exposed++;
          else if (verdict === 'missing') tally.missing++;
          else tally.other++;
        }
        // 실제 네이버 호출이 있었던 경우에만 요청 간격을 둔다 (캐시/분석불가는 지연 불필요)
        if (hits && i < targets.length - 1) await new Promise(r => setTimeout(r, 2000));
      }
      setCheckProgress({ current: i + 1, total: targets.length });
    }
    setCheckingPostId(null);
    setCheckingAll(false);
    if (tally.checked > 0) setBatchSummary(tally);
  }, [profile, willHitNaver, checkOne]);

  // 대량 분석 게이트 (§9~13): 실제 검색이 발생할 글이 10개 이하면 즉시, 그 이상이면 비용 안내 확인 후 실행
  const requestBatch = useCallback((targets: BlogPost[], opts?: { force?: boolean }) => {
    if (targets.length === 0) return;
    const now = Date.now();
    const toCheck = opts?.force
      ? targets.filter(p => p.isPublic !== false).length
      : targets.filter(p => willHitNaver(p, now)).length;
    if (toCheck <= 10) { runBatch(targets, opts); return; }
    setConfirmBatch({ targets, toCheck, force: !!opts?.force });
  }, [willHitNaver, runBatch]);

  // 진입 시 최근 발행글 자동검사 (오렌지 지정) — 검사 안 됐거나 오래된(신선도 만료) 최근 글만 새 로직으로 갱신.
  // runBatch가 willHitNaver로 이미 최근 검사된 글은 건너뛰므로, 하루 한 번꼴로만 실제 네이버 호출이 발생한다.
  useEffect(() => {
    if (!profile || postsLoading || posts.length === 0 || autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    const recent = [...posts]
      .sort((a, b) => (parsePostDate(b.date)?.getTime() || 0) - (parsePostDate(a.date)?.getTime() || 0))
      .slice(0, AUTO_CHECK_LIMIT);
    const now = Date.now();
    if (recent.some(p => willHitNaver(p, now))) runBatch(recent);
  }, [profile, postsLoading, posts, willHitNaver, runBatch]);

  // 선택한 기간(직접 선택 포함)으로 정확히 트리밍 — fetchPosts는 안전을 위해 30일치를 항상 더 넉넉히 불러오므로 여기서 최종 필터링
  const periodPosts = useMemo(() => posts.filter(p => {
    const d = parsePostDate(p.date);
    if (!d) return true; // 날짜 파싱 불가 시 보수적으로 포함
    if (rangeFrom && d < rangeFrom) return false;
    if (rangeTo && d > rangeTo) return false;
    return true;
  }), [posts, rangeFrom, rangeTo]);

  // 발행 시각(publishedAt)을 붙인 버전 — 색인 지연 유예 판정(missing-rate.ts)에 사용
  const periodPostsDated = useMemo(() => periodPosts.map(p => ({ ...p, publishedAt: parsePostDate(p.date) })), [periodPosts]);

  // §2 종합 상태별 집계 — 전체 포스팅을 정상/일부/미노출/미확인 등으로 분류(상단 카드·빠른 필터 공용).
  // missing 은 countMissing(=대시보드)와 동일 기준이라 내 블로그 대시보드 미노출 수와 일치한다(§12).
  const classCounts = useMemo(() => countByExposureClass(periodPostsDated, missingResults), [periodPostsDated, missingResults]);
  const normalCount = classCounts.normal;
  const partialCount = classCounts.partial;
  const missingCount = classCounts.missing;
  // '미확인' 카드 = 아직 확정 안 된 전부(미검사·확인 중·확인 실패·분석 불가) → 네 상태 카드 합 = 전체 포스팅
  const unknownCount = classCounts.unchecked + classCounts.checking + classCounts.error + classCounts.unanalyzable;
  // 발행 후 유예 기간 내라 미노출 집계에서 제외된 게시글 수(투명성 안내용)
  const indexingWaitCount = useMemo(() => countIndexingWait(periodPostsDated, missingResults), [periodPostsDated, missingResults]);
  // §11 모든 영역 미노출 1회 관측 후 재검증 대기 중인 글 수(아직 미노출 확정 아님)
  const recheckCount = useMemo(() => {
    const now = Date.now();
    return periodPostsDated.filter(p => displayVerdict(p, missingResults[p.id], now) === 'recheck').length;
  }, [periodPostsDated, missingResults]);

  const pct = (n: number) => periodPosts.length === 0 ? 0 : Math.round((n / periodPosts.length) * 100);

  // §1 기본 목록 = 전체 포스팅. 빠른 상태 필터(§3)·영역 필터·제목 검색·정렬을 차례로 적용한다.
  // (이전엔 미노출+재검사 글만 보여줬으나, 이제 전체 포스팅을 보여주고 필터로 좁힌다.)
  const displayList = useMemo(() => {
    const now = Date.now();
    let list = periodPostsDated;
    // §3 종합 상태 빠른 필터
    if (statusFilter !== 'all') {
      list = list.filter(p => {
        const c = classifyExposure(p, missingResults[p.id], now);
        // '미확인' 필터엔 아직 확정 안 된 전부(미검사·확인 중·확인 실패·분석 불가)를 포함 — 상단 '미확인' 카드 숫자와 일치
        if (statusFilter === 'unchecked') return c === 'unchecked' || c === 'checking' || c === 'error' || c === 'unanalyzable';
        return c === statusFilter; // normal/partial/missing
      });
    }
    // 영역 필터(통합검색/블로그/인플루언서 미노출만) — 기존 기능 유지(빠른 필터와 AND 결합)
    if (areaFilter !== 'all') {
      list = list.filter(p => {
        const mr = missingResults[p.id];
        if (!mr) return false;
        const exp = areaFilter === 'view' ? mr.viewTab.exposed : areaFilter === 'blog' ? mr.blogTab.exposed : (mr.influencerTab?.exposed ?? null);
        return exp === false;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q));
    }
    const arr = [...list];
    if (sortBy === 'latest') arr.sort((a, b) => (parsePostDate(b.date)?.getTime() || 0) - (parsePostDate(a.date)?.getTime() || 0));
    else if (sortBy === 'oldest') arr.sort((a, b) => (parsePostDate(a.date)?.getTime() || 0) - (parsePostDate(b.date)?.getTime() || 0));
    else if (sortBy === 'title') arr.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    else if (sortBy === 'missingRate') arr.sort((a, b) => missingAreaCount(missingResults[b.id]) - missingAreaCount(missingResults[a.id]));
    return arr;
  }, [periodPostsDated, missingResults, statusFilter, areaFilter, searchQuery, sortBy]);

  // §9 '미확인 n개 검사' 대상 = 실제 상태가 '미확인'(검사 기록 없음)인 글만.
  const uncheckedPosts = useMemo(() => periodPostsDated.filter(p => classifyExposure(p, missingResults[p.id]) === 'unchecked'), [periodPostsDated, missingResults]);
  const uncheckedCount = uncheckedPosts.length;

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  const allVisibleSelected = displayList.length > 0 && displayList.every(p => selectedIds.has(p.id));
  const toggleAll = useCallback(() => {
    const visibleIds = displayList.map(p => p.id);
    setSelectedIds(prev => {
      const everySelected = visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
      const n = new Set(prev);
      if (everySelected) visibleIds.forEach(id => n.delete(id));
      else visibleIds.forEach(id => n.add(id));
      return n;
    });
  }, [displayList]);

  const detailPost = useMemo(() => posts.find(p => p.id === detailPostId) || null, [posts, detailPostId]);
  const detailMr = detailPostId ? missingResults[detailPostId] : undefined;
  const detailCauses = useMemo(() => buildCauseAnalysis(detailMr), [detailMr]);
  const detailVerdict = useMemo<ExposureVerdict | null>(() => {
    if (!detailPost) return null;
    return displayVerdict({ ...detailPost, publishedAt: parsePostDate(detailPost.date) }, detailMr, Date.now());
  }, [detailPost, detailMr]);

  // 상세 모달이 열릴 때 해당 포스트의 전환 이력을 불러온다
  useEffect(() => {
    if (!profile || !detailPostId) { setDetailHistory([]); return; }
    fetchDetailHistory(profile.blogId, detailPostId);
  }, [profile, detailPostId, fetchDetailHistory]);

  const closeDetail = useCallback(() => {
    setDetailPostId(null);
    setDetailError('');
  }, []);

  // 무료 하루 3회 조회 초과 — 데이터 대신 안내 화면 (서버가 402로 미노출 데이터를 반환하지 않음)
  if (quota) {
    return <AnalysisQuotaNotice quota={quota} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">노출 현황</h2>
          <p className="text-xs text-dim mt-1">내 블로그 전체 포스팅의 네이버 검색(통합검색·블로그·인플루언서) 노출 상태를 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {checkingAll ? (
            <>
              <span className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white font-bold rounded-xl text-xs">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {checkProgress.current}/{checkProgress.total} 분석 중
              </span>
              <button onClick={() => { abortRef.current = true; }}
                className="px-3 py-2 border border-border text-dim font-semibold rounded-xl hover:bg-surface-hover transition cursor-pointer text-xs">
                중단
              </button>
            </>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <button onClick={() => requestBatch(periodPosts.filter(p => selectedIds.has(p.id)), { force: true })}
                  className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer text-xs">
                  선택한 {selectedIds.size}개 재검사
                </button>
              )}
              <button
                onClick={() => uncheckedCount > 0 ? requestBatch(uncheckedPosts) : requestBatch(periodPosts, { force: true })}
                disabled={periodPosts.length === 0}
                className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs">
                {uncheckedCount > 0 ? `미확인 ${uncheckedCount}개 검사` : '전체 재검사'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* §12 배치 검사 완료 요약 — "N개 확인 완료 · 노출 X · 미노출 Y" */}
      {!checkingAll && batchSummary && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-xs">
          <span className="text-text">
            <b className="font-bold">{batchSummary.checked}개 확인 완료</b>
            <span className="text-up font-semibold ml-2">🟢 노출 {batchSummary.exposed}</span>
            <span className="text-down font-semibold ml-2">🔴 미노출 {batchSummary.missing}</span>
            {batchSummary.other > 0 && (
              <span className="text-dim ml-2">그 외 {batchSummary.other}(재검사·확인 중·분석 불가)</span>
            )}
          </span>
          <button onClick={() => setBatchSummary(null)}
            className="text-dim hover:text-text transition cursor-pointer shrink-0" aria-label="요약 닫기">&times;</button>
        </div>
      )}

      {/* 1. 노출 현황 판정 안내 */}
      <GlassCard padding="sm" className="text-xs text-dim leading-relaxed">
        <p className="font-bold text-text mb-1">노출 상태 판정 기준 (교차검증)</p>
        <p><b className="text-text">정상</b>=검사한 영역이 모두 노출 · <b className="text-text">일부 노출</b>=일부만 노출 · <b className="text-text">미노출</b>=<b className="text-text">통합검색 · 블로그 · 인플루언서</b> 모두에서 확인 안 됨(<b className="text-text">2차 재검증</b>까지 통과한 글만 확정). 한 곳이라도 노출되면 미노출이 아닙니다.</p>
        <p className="mt-1">※ 검색 기준은 항상 <b className="text-text">포스팅 제목(또는 등록한 키워드)</b>이며, 검색 결과의 <b className="text-text">포스팅 URL·블로그 ID</b>가 내 것과 일치하는지까지 확인합니다. 검색 오류·요청 실패는 <b className="text-text">&apos;확인 불가&apos;</b>로 처리하며 절대 미노출로 집계하지 않습니다.</p>
        <p className="mt-1">※ 발행 후 {INDEXING_GRACE_HOURS}시간 이내 게시글은 네이버 색인 지연으로 인한 오탐을 막기 위해 &apos;확인 중&apos;으로 두고 미노출 집계에서 제외합니다.
          {indexingWaitCount > 0 && <span className="text-accent font-semibold"> (색인 대기 중 {indexingWaitCount}개)</span>}
          {recheckCount > 0 && <span className="text-amber-600 font-semibold"> · 재검증 대기 {recheckCount}개</span>}
        </p>
      </GlassCard>

      {/* 2. 전체 현황 카드 — 전체 포스팅 / 노출(정상) / 미노출 / 일부 노출 / 미확인.
          네 상태 카드(노출·미노출·일부노출·미확인) 합 = 전체 포스팅. 로딩 전엔 0을 지어내지 않고 '—' 표시(§13). */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <AnimatedStatCard label="전체 포스팅" value={periodPosts.length} color="accent" size="kpi" placeholder="0"
          statusText={postsLoading ? '—' : undefined}
          description={postsLoading ? '불러오는 중...' : '선택 기간 발행 글'} />
        <AnimatedStatCard label="노출" value={normalCount} color="up" size="kpi" placeholder="0"
          statusText={postsLoading ? '—' : undefined}
          description={postsLoading ? '불러오는 중...' : `${pct(normalCount)}% · 전 영역 노출`} />
        <AnimatedStatCard label="미노출" value={missingCount} color="down" size="kpi" placeholder="0"
          statusText={postsLoading ? '—' : undefined}
          description={postsLoading ? '불러오는 중...' : `${pct(missingCount)}% · 전 영역 미노출`} />
        <AnimatedStatCard label="일부 노출" value={partialCount} color="accent" size="kpi" placeholder="0"
          statusText={postsLoading ? '—' : undefined}
          description={postsLoading ? '불러오는 중...' : `${pct(partialCount)}% · 일부 영역만`} />
        <AnimatedStatCard label="미확인" value={unknownCount} color="dim" size="kpi" placeholder="0"
          statusText={postsLoading ? '—' : undefined}
          description={postsLoading ? '불러오는 중...' : '미검사·확인 중·확인 실패'} />
      </div>

      {/* 3. 필터 · 검색 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
            {PERIOD_OPTIONS.map(n => (
              <button key={n} onClick={() => { setPeriod(n); setCustomFrom(''); setCustomTo(''); }}
                className={`px-3 py-1.5 font-semibold transition cursor-pointer ${!usingCustomRange && period === n ? 'bg-accent text-white' : 'text-dim hover:bg-surface-hover'}`}>
                {n === 0 ? '전체' : `${n}일`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-border bg-surface text-dim" />
            <span className="text-dim">~</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-border bg-surface text-dim" />
            {usingCustomRange && (
              <button onClick={() => { setCustomFrom(''); setCustomTo(''); }} className="text-accent hover:underline font-semibold cursor-pointer">초기화</button>
            )}
          </div>
        </div>
        {/* §3 빠른 상태 필터 — 전체/노출/미노출/일부 노출/미확인 (기본값 전체) */}
        <div className="flex rounded-lg border border-border overflow-hidden text-[11px] w-fit">
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 font-semibold transition cursor-pointer ${statusFilter === f.key ? 'bg-accent text-white' : 'text-dim hover:bg-surface-hover'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="게시글 제목 검색"
            className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs w-56" />
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value as AreaFilter)}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-dim cursor-pointer">
            <option value="all">노출 영역: 전체</option>
            <option value="view">통합검색 미노출만</option>
            <option value="blog">블로그 미노출만</option>
            <option value="influencer">인플루언서 미노출만</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}
            className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs text-dim cursor-pointer">
            <option value="latest">최신순</option>
            <option value="oldest">오래된순</option>
            <option value="title">제목순</option>
            <option value="missingRate">미노출률순</option>
          </select>
        </div>
      </div>

      {errorMessage && <p className="text-xs text-down">{errorMessage}</p>}

      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <h3 className="font-bold text-[15px]">포스팅 목록</h3>
          <span className="text-xs text-dim">{postsLoading ? '불러오는 중...' : `${displayList.length}개`}</span>
        </div>

        {postsLoading ? (
          <div className="flex items-center justify-center py-10 text-dim text-sm">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
            포스트를 불러오는 중...
          </div>
        ) : !profile?.blogId ? (
          <div className="text-center py-10 text-dim text-sm">블로그가 연결되지 않았습니다. 프로필에서 블로그를 연결하면 노출 상태 검사가 시작됩니다.</div>
        ) : posts.length === 0 ? (
          // 게시물 원본 수집 자체가 0건 — 기간 문제가 아니라 수집 실패(블로그 ID·네이버 응답 등). "발행 없음"과 명확히 구분한다.
          <div className="text-center py-10 text-dim text-sm">
            게시물을 수집하지 못했습니다.<br />
            <span className="text-xs">블로그 연결 상태를 확인하거나 잠시 후 다시 시도해주세요. (수집된 게시물이 없어 노출 상태를 판정할 수 없습니다)</span>
          </div>
        ) : periodPosts.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">선택한 기간에 발행된 포스트가 없습니다. (전체 {posts.length}개 수집됨 — 기간 필터를 넓혀보세요)</div>
        ) : displayList.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">
            {statusFilter !== 'all'
              ? '선택한 상태 필터에 해당하는 포스팅이 없습니다. 필터를 "전체"로 바꿔보세요.'
              : searchQuery.trim()
                ? '검색어와 일치하는 포스팅이 없습니다.'
                : '표시할 포스팅이 없습니다.'}
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1120px]">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-center px-3 py-3 font-semibold w-10">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll}
                        className="cursor-pointer accent-accent" aria-label="전체 선택" />
                    </th>
                    <th className="text-left px-5 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-20">카테고리</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">발행일</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">통합검색</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">블로그</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">인플루언서</th>
                    <th className="text-right px-2 py-3 font-semibold w-20">검색량</th>
                    <th className="text-left px-3 py-3 font-semibold w-24">상태</th>
                    <th className="text-right px-3 py-3 font-semibold w-28">마지막 확인</th>
                    <th className="text-center px-5 py-3 font-semibold w-28">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {displayList.map(post => {
                    const mr = missingResults[post.id];
                    const isChecking = checkingPostId === post.id;
                    const now = Date.now();
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition">
                        <td className="px-3 py-3.5 text-center">
                          <input type="checkbox" checked={selectedIds.has(post.id)} onChange={() => toggleOne(post.id)}
                            className="cursor-pointer accent-accent" aria-label={`${post.title} 선택`} />
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold truncate block max-w-[280px]" title={post.title}>{post.title}</span>
                        </td>
                        <td className="px-3 py-3.5 text-dim text-xs">{post.category || '—'}</td>
                        <td className="px-3 py-3.5 text-right text-dim text-xs">{post.date}</td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.viewTab.exposed} post={post} mr={mr} now={now} /></td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.blogTab.exposed} post={post} mr={mr} now={now} /></td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.influencerTab?.exposed} post={post} mr={mr} now={now} /></td>
                        <td className="px-2 py-3.5 text-right text-dim text-xs">{mr?.searchVolume != null ? mr.searchVolume.toLocaleString() : '—'}</td>
                        <td className="px-3 py-3.5"><StatusBadge post={post} mr={mr} isChecking={isChecking} now={now} /></td>
                        <td className="px-3 py-3.5 text-right text-[11px] text-dim whitespace-nowrap">{mr?.checkedAt ? formatCheckedAt(mr.checkedAt) : '—'}</td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => { setDetailPostId(post.id); setDetailError(''); }}
                              className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer"
                            >
                              상세
                            </button>
                            <button
                              onClick={() => recheckSingle(post)}
                              disabled={checkingAll || isChecking}
                              className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {isChecking ? '검사 중' : '다시 검사'}
                            </button>
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {displayList.map(post => {
                const mr = missingResults[post.id];
                const isChecking = checkingPostId === post.id;
                const now = Date.now();
                return (
                  <div key={post.id} className="p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={selectedIds.has(post.id)} onChange={() => toggleOne(post.id)}
                        className="cursor-pointer accent-accent mt-1 shrink-0" aria-label={`${post.title} 선택`} />
                      <p className="font-semibold text-sm truncate flex-1" title={post.title}>{post.title}</p>
                      <StatusBadge post={post} mr={mr} isChecking={isChecking} now={now} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-dim">
                      <span>{post.category || '—'}</span>
                      <span>{post.date}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="text-center"><p className="text-[9px] text-dim mb-0.5">통합검색</p><ExposureBadge exposed={mr?.viewTab.exposed} post={post} mr={mr} now={now} /></div>
                      <div className="text-center"><p className="text-[9px] text-dim mb-0.5">블로그</p><ExposureBadge exposed={mr?.blogTab.exposed} post={post} mr={mr} now={now} /></div>
                      <div className="text-center"><p className="text-[9px] text-dim mb-0.5">인플루언서</p><ExposureBadge exposed={mr?.influencerTab?.exposed} post={post} mr={mr} now={now} /></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-dim">{mr?.checkedAt ? `${formatCheckedAt(mr.checkedAt)} 확인` : '미확인'}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setDetailPostId(post.id); setDetailError(''); }}
                          className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer"
                        >
                          상세
                        </button>
                        <button
                          onClick={() => recheckSingle(post)}
                          disabled={checkingAll || isChecking}
                          className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isChecking ? '검사 중' : '다시 검사'}
                        </button>
                        <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </GlassCard>

      {/* 4. 상세뷰(원인분석) 패널 */}
      <Modal open={!!detailPost} onClose={closeDetail} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        {detailPost && (
          <div className="bg-surface rounded-lg border border-border shadow-xl w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="flex items-start justify-between mb-4 gap-3">
              <div>
                <h3 className="font-bold text-base leading-snug">{detailPost.title}</h3>
                <p className="text-[11px] text-dim mt-1">{detailPost.category || '—'} · {detailPost.date}</p>
              </div>
              <button onClick={closeDetail} className="text-dim hover:text-text transition cursor-pointer text-lg shrink-0">&times;</button>
            </div>

            {/* 노출 현황 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { label: '통합검색', exposed: detailMr?.viewTab.exposed, rank: detailMr?.viewTab.rank },
                { label: '블로그탭', exposed: detailMr?.blogTab.exposed, rank: detailMr?.blogTab.rank },
                { label: '인플루언서탭', exposed: detailMr?.influencerTab?.exposed, rank: detailMr?.influencerTab?.rank },
              ] as const).map(a => (
                <div key={a.label} className="bg-bg rounded-lg px-2.5 py-2 text-center">
                  <p className="text-[10px] text-dim mb-1">{a.label}</p>
                  <ExposureBadge exposed={a.exposed} />
                  {a.rank != null && <p className="text-[10px] text-dim mt-1">{a.rank}위</p>}
                </div>
              ))}
            </div>

            {/* §14/§19 최종 판정 + 신뢰도 + 1·2차 검사 시각 */}
            {detailVerdict && (
              <div className="bg-bg rounded-lg px-3 py-2.5 mb-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dim">최종 판정</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${VERDICT_STYLE[detailVerdict]}`}>
                    {verdictLabel(detailVerdict).emoji} {verdictLabel(detailVerdict).text}
                  </span>
                </div>
                {detailVerdict === 'missing' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dim">판정 신뢰도</span>
                    <span className="text-xs font-semibold text-text">{confidenceLabel(detailMr?.confidence ?? null)}</span>
                  </div>
                )}
                {detailVerdict === 'recheck' && (
                  <p className="text-[11px] text-amber-600">모든 영역 미노출이 1회 감지되어 재검증 대기 중입니다. 2차 검사에서도 동일하면 미노출로 확정됩니다.</p>
                )}
                {detailMr?.firstAllMissingAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dim">1차 검사(최초 미노출 감지)</span>
                    <span className="text-[11px] text-dim">{formatCheckedAt(detailMr.firstAllMissingAt)}</span>
                  </div>
                )}
                {detailMr?.checkedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dim">최근 검사</span>
                    <span className="text-[11px] text-dim">{formatCheckedAt(detailMr.checkedAt)}</span>
                  </div>
                )}
                {detailMr?.evidence?.reverified && (
                  <p className="text-[11px] text-dim pt-0.5">
                    ✓ 이번 검사에서 2차 재검증을 수행했습니다{detailMr.evidence.reverifyFlippedToExposed ? ' — 재검증에서 노출로 정정됨.' : '.'}
                  </p>
                )}
              </div>
            )}

            <div className="text-xs text-dim bg-bg rounded-lg px-3 py-2 mb-4 space-y-1">
              <p>검색 기준: <b className="text-text">포스팅 제목</b></p>
              {detailMr?.candidates && detailMr.candidates.length > 0 && (
                <p className="leading-relaxed">
                  검색 후보: {detailMr.candidates.map((c, i) => (
                    <span key={i} className="inline-block bg-surface border border-border rounded px-1.5 py-0.5 mr-1 mt-1 text-text">{c}</span>
                  ))}
                </p>
              )}
              <p>검색량: <b className="text-text">{detailMr?.searchVolume != null ? detailMr.searchVolume.toLocaleString() : '—'}</b></p>
            </div>

            {/* 원인 분석 */}
            <div className="mb-4">
              <p className="font-bold text-xs mb-2">원인 분석 (추정)</p>
              <ul className="space-y-1.5">
                {detailCauses.map((c, i) => (
                  <li key={i} className="text-xs text-dim leading-relaxed flex gap-1.5">
                    <span className="text-accent shrink-0">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 노출/미노출 전환 이력 (§7) */}
            <div className="mb-4">
              <p className="font-bold text-xs mb-2">노출 변화 이력</p>
              {historyLoading ? (
                <p className="text-xs text-dim">이력을 불러오는 중...</p>
              ) : detailHistory.length === 0 ? (
                <p className="text-xs text-dim">아직 기록된 노출↔미노출 전환이 없습니다. 재검사로 상태가 바뀌면 여기에 기록됩니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {detailHistory.map((h, i) => (
                    <li key={i} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-dim w-28 shrink-0">{formatCheckedAt(h.changedAt)}</span>
                        <ExposureBadge exposed={h.prevState === 'exposed'} />
                        <span className="text-dim">→</span>
                        <ExposureBadge exposed={h.newState === 'exposed'} />
                      </div>
                      {h.changedReason && <p className="text-[10px] text-dim mt-0.5 ml-[120px] leading-snug">{h.changedReason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 재검사 */}
            <div className="bg-bg rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-dim">포스팅 제목 기준으로 다시 검사합니다.</p>
                <button
                  onClick={() => detailPost && recheckDetail(detailPost)}
                  disabled={detailChecking}
                  className="px-3 py-2 bg-accent text-white font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0"
                >
                  {detailChecking ? '검사 중...' : '재검사'}
                </button>
              </div>
              {detailError && <p className="text-xs text-down mt-2">{detailError}</p>}
              {detailMr?.checkedAt && <p className="text-[10px] text-dim mt-2">최근 검사 {formatCheckedAt(detailMr.checkedAt)}</p>}
            </div>

            <button
              onClick={closeDetail}
              className="w-full mt-4 px-4 py-2.5 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        )}
      </Modal>

      {/* 5. 대량 분석 비용 안내 확인 (§9~13) */}
      <Modal open={!!confirmBatch} onClose={() => setConfirmBatch(null)} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        {confirmBatch && (
          <div className="bg-surface rounded-lg border border-border shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-bold text-base mb-3">미노출 대량 분석 안내</h3>
            <div className="text-xs text-dim leading-relaxed space-y-2">
              <p>
                이번 분석에서 새로 검색할 포스팅: <b className="text-text">{confirmBatch.toCheck}개</b>
                {' '}(최근 검사된 글·비공개 글은 제외)
              </p>
              <p>
                예상 검색 요청: <b className="text-text">약 {confirmBatch.toCheck}회 이상</b> — 글마다 <b className="text-text">통합검색 · 블로그 · 인플루언서</b>를 각각 조회하므로 실제 외부 요청은 이보다 많을 수 있습니다.
              </p>
              <p className="p-2.5 rounded-lg bg-amber-500/10 text-amber-700">
                포스팅 수가 많을수록 네이버 검색·검색량 API 등 외부 데이터 조회량이 증가하며, 이용 중인 API 정책에 따라 <b>비용이 발생할 수 있습니다.</b>
                {confirmBatch.toCheck > 50 && ' 특히 50개를 초과하는 대량 분석은 소량으로 나눠 진행하는 것을 권장합니다.'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setConfirmBatch(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer">
                취소
              </button>
              <button onClick={() => { const c = confirmBatch; setConfirmBatch(null); runBatch(c.targets, { force: c.force }); }}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition cursor-pointer">
                분석 시작
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
