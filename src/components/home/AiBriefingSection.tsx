'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import GlassCard from '@/components/dashboard/GlassCard';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import SectionHeader from '@/components/dashboard/SectionHeader';
import { useAuth } from '@/hooks/useAuth';
import { rowsToCsv, downloadCsvInBrowser, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';
import type { BloggerProfile, BlogPost, PostScore, SubScores, BriefingResult, AnalysisEntry } from './AiBriefingSection.helpers';
import {
  SCORE_API,
  STATE_API,
  STAGE_LABELS,
  scoreColor,
  timeAgo,
  rankKey,
  fetchBriefingState,
  fetchCitationHistory,
  CitationTimeline,
  saveKeywordsToDb,
  saveBriefingResultToDb,
  saveBriefingErrorToDb,
  EMPTY_BRIEFING,
  ScoreCell,
  ImprovePanel,
  BriefingLabelBadge,
  AiTabBadge,
  ResultStatCard,
  CitationStatusBadge,
  CitationDetailPanel,
} from './AiBriefingSection.helpers';
import {
  rollupPostCitationStatus,
  CITATION_FILTER_OPTIONS,
  type CitationFilter,
  type CitationState,
} from '@/lib/ai-citation-status';
import { BULK_RUN_CAP, BATCH_DELAY_MS, CITATION_FRESH_TTL_MS } from '@/lib/ai-citation-batch';

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

export default function AiBriefingSection() {
  const { user, isLoading: authLoading } = useAuth();
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(30);
  const [postsLoading, setPostsLoading] = useState(false);
  const queryClient = useQueryClient();

  // postId → 확인 대상 키워드(대표키워드 1개) — 인용 확인 결과의 연결 키. 대표키워드가 바뀌면 갱신된다.
  const [postKeywords, setPostKeywords] = useState<Record<string, string[]>>({});
  // "postId::keyword" → BriefingResult
  const [briefingResults, setBriefingResults] = useState<Record<string, BriefingResult>>({});
  const [checkingKey, setCheckingKey] = useState('');
  const [checkingStage, setCheckingStage] = useState('');
  const [extractingPostId, setExtractingPostId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // postId → 점수 결과 (규칙 기반 AI/SEO/GEO/AEO 점수, Phase 1)
  const [postScores, setPostScores] = useState<Record<string, PostScore>>({});
  const [scoringPostId, setScoringPostId] = useState('');
  const [improvePanelPostId, setImprovePanelPostId] = useState('');
  // 상태 필터(스펙 #17): 전체/인용/일부 인용/미인용/미확인/확인실패
  const [filter, setFilter] = useState<CitationFilter>('all');

  // 대표키워드 공용 소스(post_representative_keywords) — 키워드순위 화면과 동일 데이터(스펙 #2/#3)
  const [repKeywords, setRepKeywords] = useState<Record<string, { keyword: string | null; source: string | null; confidence?: number | null }>>({});
  // 대표키워드 인라인 수동 편집(스펙 #3)
  const [editingRepPost, setEditingRepPost] = useState('');
  const [repDraft, setRepDraft] = useState('');
  // 개별 상세 패널(스펙 #16) — 인용 근거 URL·출처순번·확인시각 표시
  const [detailPostId, setDetailPostId] = useState('');

  // 안전 배치 큐(스펙 #9~#15)
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkEstimate, setBulkEstimate] = useState<BulkEstimate | null>(null);
  const [bulkLoadingEstimate, setBulkLoadingEstimate] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current: string }>({ done: 0, total: 0, current: '' });
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const bulkAbortRef = useRef(false);

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
      '포스팅 제목', '포스팅 URL', '작성일', '타겟 키워드',
      'AI 브리핑', '브리핑 출처 순번', '브리핑 출처 총계',
      'AI 탭', '탭 출처 순번', '탭 출처 총계',
    ];
    const rows: unknown[][] = [];
    for (const post of blogPosts) {
      const kws = postKeywords[post.id] || [];
      if (kws.length === 0) continue;
      for (const kw of kws) {
        if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
        const result = briefingResults[rankKey(post.id, kw)];
        // AI 브리핑/AI 탭은 서로 완전히 독립된 서비스 결과 — 각자의 필드만으로 판정한다
        // 2026-07-04(6차): 상태 문구 통일 — "없음" 문구 제거, 미확인/인용/미인용 3가지만 사용
        const briefingStatus = !result ? '미확인' : result.exposed ? '인용' : '미인용';
        const tabStatus = !result ? '미확인' : result.tabExposed ? '인용' : '미인용';
        rows.push([
          post.title,
          post.url,
          post.date,
          kw,
          briefingStatus,
          result?.sourceIndex ?? '',
          result?.sourceTotal ?? '',
          tabStatus,
          result?.tabSourceIndex ?? '',
          result?.tabSourceTotal ?? '',
        ]);
      }
      if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
    }
    if (rows.length === 0) {
      alert('다운로드할 키워드 데이터가 없습니다. 먼저 타겟 키워드를 등록하고 확인해주세요.');
      return;
    }
    const csv = rowsToCsv(headers, rows);
    downloadCsvInBrowser(`my_naver_mate_${todayStamp()}.csv`, csv);
  };

  const handleResetResults = useCallback(async () => {
    if (!profile) return;
    if (!confirm('모든 포스팅의 타겟 키워드와 AI 브리핑 확인 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

    try {
      setPostKeywords({});
      setBriefingResults({});

      await fetch(`${STATE_API}?all=true`, { method: 'DELETE' }).catch(() => null);

      showError('모든 타겟 키워드와 AI 브리핑 데이터가 초기화되었습니다.', 3000);
    } catch (err) {
      showError('초기화 중 오류가 발생했습니다.', 3000);
      console.error('Reset error:', err);
    }
  }, [profile, showError]);

  // 전체 포스팅을 한 번에 로드(스펙 #1) — 네이버 PostList가 최신 발행순으로 반환하므로 그 순서를 유지한다.
  // 이후 페이지네이션·필터·KPI는 이 전체 목록을 클라이언트에서 처리한다(전체 블로그 기준).
  const fetchBlogPosts = useCallback(async (blogId: string) => {
    setPostsLoading(true);
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
    finally { setPostsLoading(false); }
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
      return res.json() as Promise<{ results: Record<string, { keyword: string | null; source: string | null; confidence?: number | null }> }>;
    },
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (repState?.results) {
      const map: Record<string, { keyword: string | null; source: string | null; confidence?: number | null }> = {};
      for (const [pid, v] of Object.entries(repState.results)) map[pid] = { keyword: v.keyword, source: v.source, confidence: v.confidence ?? null };
      setRepKeywords(map);
    }
  }, [repState]);

  const { data: syncedScores } = useQuery({
    queryKey: ['post-ai-scores', profile?.blogId],
    queryFn: async () => {
      const res = await fetch(`${SCORE_API}?blogId=${encodeURIComponent(profile!.blogId)}`);
      if (!res.ok) throw new Error('점수 로드 실패');
      const data: { scores: Array<{
        post_id: string; title: string | null; view_count: number | null; published_at: string | null;
        representative_keyword: string | null;
        ai_score: number; seo_score: number; geo_score: number; aeo_score: number;
        sub_scores: SubScores; cause_tags: string[]; computed_at: string;
      }> } = await res.json();
      return data.scores;
    },
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (syncedScores) {
      const map: Record<string, PostScore> = {};
      for (const s of syncedScores) {
        map[s.post_id] = {
          postId: s.post_id,
          title: s.title,
          viewCount: s.view_count,
          publishedAt: s.published_at,
          representativeKeyword: s.representative_keyword,
          aiScore: s.ai_score,
          seoScore: s.seo_score,
          geoScore: s.geo_score,
          aeoScore: s.aeo_score,
          subScores: s.sub_scores,
          causeTags: s.cause_tags,
          computedAt: s.computed_at,
        };
      }
      setPostScores(map);
    }
  }, [syncedScores]);

  const handleAnalyzeScore = useCallback(async (post: BlogPost) => {
    if (!profile) return;
    setScoringPostId(post.id);
    try {
      const res = await fetch(SCORE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId: profile.blogId,
          postId: post.id,
          title: post.title,
          date: post.date,
          viewCount: post.viewCount ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        showError(body?.error || 'AI 점수 분석에 실패했습니다.', 6000);
        return;
      }
      const data: {
        postId: string; representativeKeyword: string | null;
        aiScore: number; seoScore: number; geoScore: number; aeoScore: number;
        subScores: SubScores; causeTags: string[];
      } = await res.json();
      setPostScores(prev => ({
        ...prev,
        [post.id]: {
          postId: post.id,
          title: post.title,
          viewCount: post.viewCount ?? null,
          publishedAt: post.date,
          representativeKeyword: data.representativeKeyword,
          aiScore: data.aiScore,
          seoScore: data.seoScore,
          geoScore: data.geoScore,
          aeoScore: data.aeoScore,
          subScores: data.subScores,
          causeTags: data.causeTags,
          computedAt: new Date().toISOString(),
        },
      }));
    } catch {
      showError('네트워크 오류로 AI 점수를 분석하지 못했습니다.', 6000);
    } finally {
      setScoringPostId('');
    }
  }, [profile, showError]);

  useEffect(() => {
    if (syncedState) {
      // syncedState는 외부 fetch 응답(API 응답 캐시/확장프로그램 등 외부 요인에 영향받을 수 있음)이라
      // 필드가 비어있어도 postKeywords/briefingResults가 undefined가 되지 않도록 방어한다.
      // (2026-07-17: postKeywords가 undefined가 되면서 "미노출 게시글" 파생 계산이
      // postKeywords[post.id]에서 TypeError를 던져 /my 전체가 에러 화면으로 죽는 버그 확인)
      setPostKeywords(syncedState.postKeywords || {});
      setBriefingResults(syncedState.briefingResults || {});
    }
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
        return { ...prev, [key]: { ...(prevRes ?? EMPTY_BRIEFING), checkStatus: 'transient_error', lastError: msg ?? null } };
      });
    };
    // 성공 저장(fire-and-forget) + 서버측 이력 스냅샷 insert가 커밋될 시간을 주고 타임라인을 갱신한다.
    const refreshHistorySoon = () => {
      setTimeout(() => { queryClient.invalidateQueries({ queryKey: ['ai-briefing-history', profile.blogId] }); }, 1200);
    };
    setCheckingKey(key);
    setCheckingStage('searching');
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
          errMsg = '요청이 너무 많습니다. 5분 후 다시 시도해주세요.';
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
        setBriefingResults(prev => ({ ...prev, [key]: data }));
        saveBriefingResultToDb(profile.blogId, post.id, kw, data, post.url);
        refreshHistorySoon();
        return { ok: true, status: res.status, cached: data?.cached === true, result: data };
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
        const parsed = finalData as unknown as BriefingResult;
        setBriefingResults(prev => ({ ...prev, [key]: parsed }));
        saveBriefingResultToDb(profile.blogId, post.id, kw, parsed, post.url);
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
    if (!profile) return;
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
    const kws = [...new Set([...(postKeywords[post.id] || []), kw])];
    setPostKeywords(prev => ({ ...prev, [post.id]: kws }));
    saveKeywordsToDb(profile.blogId, post.id, kws);
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
      <div className="max-w-6xl mx-auto space-y-6">
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
        <h1 className="font-title text-2xl font-extrabold">AI 브리핑 · AI 탭</h1>
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
        <h1 className="text-xl font-bold">AI 브리핑 · AI 탭</h1>
        <p className="text-sm text-dim">블로그 주소가 필요합니다.</p>
        <Link href="/profile" className="inline-block px-6 py-3 bg-accent text-white font-bold rounded-xl">
          마이페이지에서 블로그 연결
        </Link>
      </div>
    );
  }

  // 대표키워드(공용 소스 우선) — 키워드순위 화면과 동일 값(스펙 #2). 없으면 점수 결과의 대표키워드로 폴백.
  const getPrimaryKeyword = (post: BlogPost): string | null =>
    (repKeywords[post.id]?.keyword || postScores[post.id]?.representativeKeyword || '').trim() || null;

  // 포스트에 할당된 타겟 키워드들의 확인 결과 → 종합 인용 상태 입력값(스펙 #18)
  const postStatusInputs = (postId: string) =>
    ((postKeywords || {})[postId] || [])
      .map(kw => (briefingResults || {})[rankKey(postId, kw)])
      .filter(Boolean)
      .map(r => ({ exposed: r!.exposed, tabExposed: r!.tabExposed, checkStatus: r!.checkStatus, checkedAt: r!.checkedAt }));

  // 표시용 종합 상태(확인 진행 중이면 checking 우선)
  const postCitationStatus = (postId: string): CitationState => {
    if (checkingKey && checkingKey.startsWith(`${postId}::`)) return 'checking';
    return rollupPostCitationStatus(postStatusInputs(postId));
  };

  // 최근 확인(캐시 신선) 여부 — 배치 큐가 재조회 대상을 고를 때 사용(스펙 #14)
  const isResultFresh = (r?: BriefingResult): boolean =>
    !!r?.checkedAt && r.checkStatus === 'ok' && (Date.now() - new Date(r.checkedAt).getTime() < CITATION_FRESH_TTL_MS);

  // 전체 블로그 기준 종합상태 카운트(스펙 #17/#21) — 확인 진행 중 상태는 제외하고 안정적으로 집계
  const statusCounts = blogPosts.reduce((acc, post) => {
    const s = rollupPostCitationStatus(postStatusInputs(post.id));
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<CitationState, number>);
  const countOf = (s: CitationState) => statusCounts[s] || 0;
  const citedTotal = countOf('cited') + countOf('partial');

  // 상태 필터(스펙 #17) — 전체 블로그 목록에 적용
  const filteredPosts = filter === 'all'
    ? blogPosts
    : blogPosts.filter(post => rollupPostCitationStatus(postStatusInputs(post.id)) === filter);

  // 클라이언트 페이지네이션(전체 목록 로드 후 화면만 분할)
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / postsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pagePosts = filteredPosts.slice((safePage - 1) * postsPerPage, safePage * postsPerPage);

  // ── 안전 배치 큐(스펙 #9~#15) ──────────────────────────────────────────────
  // 대표키워드가 없으면 신규 추출 대상, 있으면 최근 확인(fresh)이 아니면 재조회 대상.
  const needsBulkCheck = (post: BlogPost): boolean => {
    const kw = getPrimaryKeyword(post);
    if (!kw) return true;
    return !isResultFresh(briefingResults[rankKey(post.id, kw)]);
  };

  // 대표키워드가 없는 포스트는 공용 추출 API로 확정(post_representative_keywords에 저장, 스펙 #2/#3).
  const ensureRepKeyword = async (post: BlogPost): Promise<string | null> => {
    try {
      const res = await fetch(
        `/api/blog/representative-keywords?blogId=${encodeURIComponent(profile!.blogId)}&postId=${encodeURIComponent(post.id)}&title=${encodeURIComponent(post.title)}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const kw = (data.representativeKeyword || data.keywords?.[0] || '').trim();
      if (kw) setRepKeywords(prev => ({ ...prev, [post.id]: { keyword: kw, source: data.source || null, confidence: data.confidence ?? null } }));
      return kw || null;
    } catch { return null; }
  };

  // 대표키워드를 확인 대상 키워드로 등록(확인 결과가 이 키워드에 연결되고 목록/집계에 반영되도록).
  // 대표키워드가 바뀌면 이전 키워드에 매인 확인 결과 대신 현재 대표키워드로 재확인하도록 갱신한다(스펙 #23).
  const registerTargetKeyword = (post: BlogPost, kw: string) => {
    const existing = postKeywords[post.id] || [];
    if (existing.length !== 1 || existing[0].trim() !== kw) {
      setPostKeywords(prev => ({ ...prev, [post.id]: [kw] }));
      saveKeywordsToDb(profile!.blogId, post.id, [kw]);
    }
  };

  // 예상 작업량/쿼터를 서버에서 계산해 확인 모달을 연다(즉시 900개 호출 금지, 스펙 #11).
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
    if (!profile || bulkRunning) return;
    setBulkModalOpen(false);
    setBulkNotice(null);
    bulkAbortRef.current = false;
    // 예상 모달은 전체 블로그 기준이므로, 배치도 현재 필터가 아니라 전체 목록(최신순)에서 대상을 고른다.
    const targets = blogPosts.filter(needsBulkCheck).slice(0, BULK_RUN_CAP);
    if (targets.length === 0) {
      showError('새로 확인할 포스팅이 없습니다. (모두 최근 확인됨)', 4000);
      return;
    }
    setBulkRunning(true);
    setBulkProgress({ done: 0, total: targets.length, current: '' });
    let halted = false;
    for (let i = 0; i < targets.length; i++) {
      if (bulkAbortRef.current) break;
      const post = targets[i];
      setBulkProgress(p => ({ ...p, current: post.title }));
      let kw = getPrimaryKeyword(post);
      if (!kw) kw = await ensureRepKeyword(post);
      if (!kw) { setBulkProgress(p => ({ ...p, done: p.done + 1 })); continue; } // 대표키워드 없음 → 미확인 유지, 건너뜀
      registerTargetKeyword(post, kw);
      const res = await checkSingleKeyword(post, kw);
      setBulkProgress(p => ({ ...p, done: p.done + 1 }));
      if (!res.ok) {
        const blocked = res.status === 429 || (!!res.errorMsg && /(접근|제한|너무 많)/.test(res.errorMsg));
        if (blocked) { halted = true; break; }
      }
      if (i < targets.length - 1 && !bulkAbortRef.current) await sleep(BATCH_DELAY_MS);
    }
    setBulkRunning(false);
    if (halted) {
      setBulkNotice('네이버 접근이 일시적으로 제한되어 중단했습니다. 잠시 후 다시 "전체 업데이트"를 눌러 이어서 확인하세요. 미확인 포스팅은 그대로 유지됩니다.');
    } else if (!bulkAbortRef.current) {
      setBulkNotice('이번 배치 확인을 완료했습니다. 남은 포스팅이 있으면 다시 실행해 이어서 확인할 수 있습니다.');
    }
    queryClient.invalidateQueries({ queryKey: ['ai-briefing-state', profile.blogId] });
  };

  // 대표키워드 인라인 수동 저장(스펙 #3) — keyword_source='manual'로 공용 테이블에 저장.
  const saveRepKeyword = async (post: BlogPost) => {
    const kw = repDraft.trim();
    setEditingRepPost('');
    if (!kw || !profile) return;
    setRepKeywords(prev => ({ ...prev, [post.id]: { keyword: kw, source: 'manual', confidence: 1 } }));
    try {
      await fetch('/api/blog/representative-keywords', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, postId: post.id, keyword: kw, title: post.title }),
      });
      queryClient.invalidateQueries({ queryKey: ['rep-keywords-state', profile.blogId] });
    } catch { /* 낙관적 UI */ }
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
      if (!res.ok) { showError('재추출 중 오류가 발생했습니다.'); return; }
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

  // 대표키워드 1개로 AI 브리핑·AI 탭 인용을 확인(스펙 #16/#26) — 여러 타겟 입력 대신 단일 대표키워드만 사용.
  const checkRepKeyword = (post: BlogPost) => {
    const kw = getPrimaryKeyword(post);
    if (!kw || !!checkingKey) return;
    registerTargetKeyword(post, kw);
    checkSingleKeyword(post, kw);
  };

  // 대표키워드가 없을 때 제목 기반 자동 추출로 채운다(공용 소스에 저장, 스펙 #2/#3).
  const autoExtractRep = async (post: BlogPost) => {
    setExtractingPostId(post.id);
    try {
      const kw = await ensureRepKeyword(post);
      if (!kw) showError('이 포스팅에서 대표 키워드를 찾지 못했습니다. 직접 입력해주세요.', 5000);
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

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
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
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-title text-2xl font-extrabold">AI 브리핑 · AI 탭</h1>
          <p className="text-sm text-dim mt-1">
            내 블로그 전체 포스팅의 대표키워드로 네이버 AI 브리핑·AI 탭 인용 여부를 확인·관리합니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!bulkRunning ? (
            <button
              onClick={openBulkModal}
              disabled={blogPosts.length === 0 || bulkLoadingEstimate}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-accent text-white hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
              title="전체 포스팅을 안전 배치(1회 소수·순차)로 확인합니다. 예상 작업량을 먼저 보여드립니다."
            >
              {bulkLoadingEstimate ? '계산 중...' : '전체 업데이트'}
            </button>
          ) : (
            <button
              onClick={() => { bulkAbortRef.current = true; }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-down/10 text-down border border-down/30 hover:bg-down/20 transition cursor-pointer"
              title="진행 중인 배치 확인을 중단합니다(이미 확인된 결과는 저장됩니다)."
            >
              중단
            </button>
          )}
          <button
            onClick={openAuditModal}
            disabled={blogPosts.length === 0 || auditLoading}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
            title="저장된 대표키워드를 점검해 잘못 추출된 것만 다시 추출합니다(무료·네이버 무호출)."
          >
            {auditLoading ? '점검 중...' : '대표키워드 점검'}
          </button>
          {canDownload && (
            <button
              onClick={handleDownload}
              disabled={blogPosts.length === 0}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
              title="포스팅의 AI 브리핑·AI 탭 확인 결과를 CSV 다운로드 (최대 500건)"
            >
              CSV 다운로드
            </button>
          )}
          <button
            onClick={handleResetResults}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
            title="모든 타겟 키워드와 AI 브리핑 데이터 초기화"
          >
            초기화
          </button>
        </div>
      </div>

      <p className="text-xs text-dim/80 -mt-3">
        AI 브리핑·AI 탭 인용 여부는 공식 API가 없어 실제 브라우저로 두 화면을 순차 방문해 확인하므로 건당 30~50초가 걸립니다.
        네이버가 짧은 시간의 반복 자동화를 제한하기 때문에, &ldquo;전체 업데이트&rdquo;는 1회에 소수만 안전하게 확인하고 나머지는 미확인으로 두었다가
        다시 눌러 이어서 채웁니다(재개형). 확인 불가·오류는 절대 &lsquo;미인용&rsquo;으로 처리하지 않습니다.
      </p>

      {/* 배치 진행률(스펙 #15) */}
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

      {/* 대표키워드 점검·재추출 확인 모달(스펙 #18~21) */}
      {auditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAuditOpen(false)}>
          <div className="bg-surface rounded-2xl border border-border shadow-xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
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
        </div>
      )}

      {/* 예상 작업량 확인 모달(스펙 #9~#12) */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBulkModalOpen(false)}>
          <div className="bg-surface rounded-2xl border border-border shadow-xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
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
        </div>
      )}

      {/* 단건 즉시 확인(보조 도구) — 전체 목록 아래로 배치(order-2). 특정 키워드 하나를 바로 분석할 때 사용. */}
      <GlassCard padding="none" className="order-2">
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
            className="flex-1 px-4 py-3 bg-surface border border-border rounded-xl focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition text-sm"
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
        <GlassCard padding="none" className="order-3">
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
          {analysisHistory.length > HISTORY_PER_PAGE && (
            <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-2">
              <button
                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                disabled={historyPage === 1}
                className="px-3 py-1.5 text-xs border border-border rounded-lg disabled:opacity-30 cursor-pointer"
              >
                이전
              </button>
              <span className="text-xs text-dim">{historyPage} / {Math.ceil(analysisHistory.length / HISTORY_PER_PAGE)}</span>
              <button
                onClick={() => setHistoryPage(p => Math.min(Math.ceil(analysisHistory.length / HISTORY_PER_PAGE), p + 1))}
                disabled={historyPage === Math.ceil(analysisHistory.length / HISTORY_PER_PAGE)}
                className="px-3 py-1.5 text-xs border border-border rounded-lg disabled:opacity-30 cursor-pointer"
              >
                다음
              </button>
            </div>
          )}
        </GlassCard>
      )}

      {/* 전체 포스팅 목록 — 기본(항상 표시) 관리 화면(스펙 #1). order-1로 단건 도구보다 위에 배치. */}
      <div className="order-1 space-y-4">

      {/* KPI 바 — 전체 블로그 기준 종합 인용 상태(스펙 #17/#21) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <AnimatedStatCard label="전체 포스팅" value={blogPostsTotal} color="dim" />
        <AnimatedStatCard label="AI 인용" value={citedTotal} description="브리핑·탭 중 1곳 이상" color="up" />
        <AnimatedStatCard label="일부 인용" value={countOf('partial')} color="gold" />
        <AnimatedStatCard label="미인용" value={countOf('not_cited')} color="down" />
        <AnimatedStatCard label="미확인" value={countOf('unchecked')} color="dim" />
        <AnimatedStatCard label="확인실패" value={countOf('failed')} color="gold" />
      </div>

      {/* 포스팅 수(페이지당) 선택 + 총계 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-surface rounded-lg border border-border p-0.5">
          {[30, 60, 90].map(n => (
            <button key={n} onClick={() => { setPostsPerPage(n); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                postsPerPage === n ? 'bg-accent text-white' : 'text-dim hover:text-text'
              }`}
            >
              {n}개씩
            </button>
          ))}
        </div>
        <span className="text-xs text-dim">
          전체 {blogPostsTotal.toLocaleString()}개 · 필터 {filteredPosts.length.toLocaleString()}개
        </span>
      </div>

      {/* 상태 필터(스펙 #17) — 전체 블로그 기준 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CITATION_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => { setFilter(opt.key); setCurrentPage(1); }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
              filter === opt.key
                ? 'bg-accent text-white border-accent'
                : 'bg-surface text-dim border-border hover:border-accent/50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      <GlassCard padding="none">
        {postsLoading ? (
          <div className="p-12 text-center text-dim text-sm">포스팅을 불러오는 중...</div>
        ) : filteredPosts.length === 0 ? (
          <div className="p-12 text-center text-dim text-sm">포스팅이 없습니다.</div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim uppercase">
                    <th className="text-left px-4 py-3 font-semibold w-10">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-44">대표키워드</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">AI브리핑</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">AI탭</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">종합상태</th>
                    <th className="text-center px-2 py-3 font-semibold w-12">AI</th>
                    <th className="text-center px-2 py-3 font-semibold w-12">SEO</th>
                    <th className="text-center px-2 py-3 font-semibold w-12">GEO</th>
                    <th className="text-center px-2 py-3 font-semibold w-12">AEO</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">조회수</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">발행일</th>
                    <th className="text-center px-3 py-3 font-semibold w-14">확인</th>
                    <th className="text-center px-3 py-3 font-semibold w-24">개선하기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {pagePosts.map((post, i) => {
                    const score = postScores[post.id];
                    const citation = postCitationStatus(post.id);
                    const repKw = getPrimaryKeyword(post);
                    const key = repKw ? rankKey(post.id, repKw) : '';
                    const result = key ? briefingResults[key] : undefined;
                    const needsReview = repNeedsReview(post);
                    return (
                      <Fragment key={post.id}>
                        <tr className="hover:bg-surface-hover transition">
                          <td className="px-4 py-3 text-dim text-xs align-top">
                            {(safePage - 1) * postsPerPage + i + 1}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <a href={post.url} target="_blank" rel="noopener noreferrer"
                              className="font-semibold hover:text-accent transition truncate block max-w-[300px]" title={post.title}>
                              {post.title}
                            </a>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {post.commentCount > 0 && (
                                <span className="text-[10px] text-accent">댓글 {post.commentCount}</span>
                              )}
                              <button onClick={() => setDetailPostId(prev => prev === post.id ? '' : post.id)}
                                className="text-xs text-dim hover:text-accent cursor-pointer hover:underline">
                                {detailPostId === post.id ? '상세 닫기' : '상세'}
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            {editingRepPost === post.id ? (
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
                                placeholder="대표키워드"
                              />
                            ) : repKw ? (
                              <div className="flex flex-col gap-0.5 items-start">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium text-text">{repKw}</span>
                                  <button type="button" onClick={() => { setEditingRepPost(post.id); setRepDraft(repKw); }}
                                    className="text-[10px] text-dim hover:text-accent cursor-pointer hover:underline shrink-0"
                                    title="대표키워드 직접 수정(수정 시 항상 우선)">수정</button>
                                </div>
                                {repKeywords[post.id]?.source === 'manual' ? (
                                  <span className="text-[9px] text-accent">직접 지정</span>
                                ) : needsReview ? (
                                  <span className="text-[9px] text-down">확인 필요</span>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={() => autoExtractRep(post)}
                                  disabled={extractingPostId === post.id}
                                  className="text-xs text-accent cursor-pointer hover:underline disabled:opacity-50">
                                  {extractingPostId === post.id ? '추출 중...' : '자동 추출'}
                                </button>
                                <button type="button" onClick={() => { setEditingRepPost(post.id); setRepDraft(''); }}
                                  className="text-xs text-dim hover:text-accent cursor-pointer hover:underline">직접 입력</button>
                              </div>
                            )}
                          </td>
                          <td className="text-center px-3 py-1.5"><BriefingLabelBadge result={result} /></td>
                          <td className="text-center px-3 py-1.5"><AiTabBadge result={result} /></td>
                          <td className="text-center px-3 py-1.5"><CitationStatusBadge state={citation} /></td>
                          <td className="text-center px-2 py-1.5"><ScoreCell score={score?.aiScore} /></td>
                          <td className="text-center px-2 py-1.5"><ScoreCell score={score?.seoScore} /></td>
                          <td className="text-center px-2 py-1.5"><ScoreCell score={score?.geoScore} /></td>
                          <td className="text-center px-2 py-1.5"><ScoreCell score={score?.aeoScore} /></td>
                          <td className="text-center px-3 py-1.5 text-xs text-dim">
                            {typeof post.viewCount === 'number' ? post.viewCount.toLocaleString() : '—'}
                          </td>
                          <td className="text-center px-3 py-1.5 text-[10px] text-dim">{post.date}</td>
                          <td className="text-center px-3 py-1.5">
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                onClick={() => checkRepKeyword(post)}
                                disabled={!!checkingKey || !repKw}
                                className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                                title={repKw ? undefined : '대표키워드를 먼저 지정하세요'}
                              >
                                {checkingKey === key && key ? (
                                  <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                                ) : result ? '재확인' : '확인'}
                              </button>
                              {result?.checkedAt && (
                                <span className="text-[9px] text-dim" title={new Date(result.checkedAt).toLocaleString('ko-KR')}>
                                  {timeAgo(result.checkedAt)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-center px-3 py-1.5">
                            <div className="flex flex-col gap-1 items-center">
                              {!score ? (
                                <button
                                  onClick={() => handleAnalyzeScore(post)}
                                  disabled={scoringPostId === post.id}
                                  className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                                >
                                  {scoringPostId === post.id ? '분석 중...' : '분석하기'}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setImprovePanelPostId(prev => prev === post.id ? '' : post.id)}
                                  className="text-[11px] text-accent hover:underline cursor-pointer"
                                >
                                  개선하기<br /><span className="text-[9px] text-dim">(기초 진단)</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {score && score.causeTags.length > 0 && (
                          <tr>
                            <td colSpan={2} />
                            <td colSpan={12} className="px-3 pb-2 pt-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                {score.causeTags.map(tag => (
                                  <span key={tag} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-down/10 text-down">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                        {detailPostId === post.id && (
                          <tr>
                            <td colSpan={14} className="px-4 pb-4 pt-1 bg-bg/30">
                              <CitationDetailPanel
                                post={post}
                                keywords={(postKeywords[post.id] || [])}
                                results={briefingResults}
                                repKeyword={repKw}
                              />
                            </td>
                          </tr>
                        )}
                        {improvePanelPostId === post.id && score && (
                          <tr>
                            <td colSpan={14} className="px-4 pb-4 pt-1 bg-bg/30">
                              <ImprovePanel score={score} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {pagePosts.map((post, i) => {
                const score = postScores[post.id];
                const citation = postCitationStatus(post.id);
                const repKw = getPrimaryKeyword(post);
                const mKey = repKw ? rankKey(post.id, repKw) : '';
                const mResult = mKey ? briefingResults[mKey] : undefined;
                const needsReview = repNeedsReview(post);
                return (
                  <div key={post.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">
                        {(safePage - 1) * postsPerPage + i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition line-clamp-2">
                          {post.title}
                        </a>
                        <span className="text-[10px] text-dim ml-1">{post.date}</span>
                      </div>
                      <CitationStatusBadge state={citation} />
                    </div>

                    <div className="pl-7 flex items-center gap-2 flex-wrap text-[10px] text-dim">
                      <button
                        type="button"
                        onClick={() => { setEditingRepPost(post.id); setRepDraft(repKw || ''); }}
                        className="px-1.5 py-0.5 rounded-full bg-bg border border-border hover:border-accent transition"
                      >
                        대표키워드: {repKw || '지정'}{repKeywords[post.id]?.source === 'manual' ? ' ·직접' : ''}
                      </button>
                      {editingRepPost === post.id && (
                        <input
                          autoFocus
                          value={repDraft}
                          onChange={e => setRepDraft(e.target.value)}
                          onBlur={() => saveRepKeyword(post)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); saveRepKeyword(post); }
                            if (e.key === 'Escape') setEditingRepPost('');
                          }}
                          className="px-2 py-1 text-xs bg-bg border border-accent rounded-lg outline-none"
                          placeholder="대표키워드"
                        />
                      )}
                      {!repKw && editingRepPost !== post.id && (
                        <button onClick={() => autoExtractRep(post)} disabled={extractingPostId === post.id}
                          className="text-accent hover:underline disabled:opacity-50">
                          {extractingPostId === post.id ? '추출 중...' : '자동 추출'}
                        </button>
                      )}
                      {needsReview && <span className="text-down">확인 필요</span>}
                      {typeof post.viewCount === 'number' && <span>조회수 {post.viewCount.toLocaleString()}</span>}
                    </div>

                    {score && (
                      <div className="pl-7 flex items-center gap-3 text-[11px]">
                        <span>AI <b className={scoreColor(score.aiScore)}>{score.aiScore}</b></span>
                        <span>SEO <b className={scoreColor(score.seoScore)}>{score.seoScore}</b></span>
                        <span>GEO <b className={scoreColor(score.geoScore)}>{score.geoScore}</b></span>
                        <span>AEO <b className={scoreColor(score.aeoScore)}>{score.aeoScore}</b></span>
                      </div>
                    )}

                    {score && score.causeTags.length > 0 && (
                      <div className="pl-7 flex items-center gap-1 flex-wrap">
                        {score.causeTags.map(tag => (
                          <span key={tag} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-down/10 text-down">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="pl-7 flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => checkRepKeyword(post)}
                        disabled={!!checkingKey || !repKw}
                        className="px-2.5 py-1.5 text-[11px] text-accent border border-accent/30 rounded-lg cursor-pointer disabled:opacity-50 shrink-0"
                        title={repKw ? undefined : '대표키워드를 먼저 지정하세요'}
                      >
                        {checkingKey === mKey && mKey ? (
                          <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                        ) : mResult ? 'AI 인용 재확인' : 'AI 인용 확인'}
                      </button>
                      {mResult && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-dim">브리핑</span>
                          <BriefingLabelBadge result={mResult} />
                          <span className="text-[10px] text-dim">탭</span>
                          <AiTabBadge result={mResult} />
                        </div>
                      )}
                    </div>

                    <div className="pl-7 pt-0.5 flex items-center gap-3 flex-wrap">
                      <button
                        onClick={() => setDetailPostId(prev => prev === post.id ? '' : post.id)}
                        className="text-[11px] text-dim hover:text-accent hover:underline cursor-pointer"
                      >
                        {detailPostId === post.id ? '상세 닫기' : '상세'}
                      </button>
                      {!score ? (
                        <button
                          onClick={() => handleAnalyzeScore(post)}
                          disabled={scoringPostId === post.id}
                          className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                        >
                          {scoringPostId === post.id ? 'AI 점수 분석 중...' : 'AI 점수 분석하기'}
                        </button>
                      ) : (
                        <button
                          onClick={() => setImprovePanelPostId(prev => prev === post.id ? '' : post.id)}
                          className="text-[11px] text-accent hover:underline cursor-pointer"
                        >
                          개선하기 <span className="text-dim">(기초 진단)</span>
                        </button>
                      )}
                    </div>
                    {detailPostId === post.id && (
                      <div className="mt-2 pl-7">
                        <CitationDetailPanel
                          post={post}
                          keywords={(postKeywords[post.id] || [])}
                          results={briefingResults}
                          repKeyword={repKw}
                        />
                      </div>
                    )}
                    {improvePanelPostId === post.id && score && (
                      <div className="mt-2">
                        <ImprovePanel score={score} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 (클라이언트 사이드) */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-2">
                <button
                  onClick={() => setCurrentPage(() => Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg disabled:opacity-30 cursor-pointer"
                >
                  이전
                </button>
                <span className="text-xs text-dim">{safePage} / {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(() => Math.min(totalPages, safePage + 1))}
                  disabled={safePage === totalPages}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg disabled:opacity-30 cursor-pointer"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </GlassCard>

      </div>
    </div>
  );
}
