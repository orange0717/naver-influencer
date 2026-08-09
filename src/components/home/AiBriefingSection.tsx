'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  saveKeywordsToDb,
  saveBriefingResultToDb,
  ScoreCell,
  ImprovePanel,
  BriefingLabelBadge,
  AiTabBadge,
  ResultStatCard,
} from './AiBriefingSection.helpers';

export default function AiBriefingSection() {
  const { user, isLoading: authLoading } = useAuth();
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(30);
  const [postsLoading, setPostsLoading] = useState(false);

  // postId → 타겟 키워드 배열
  const [postKeywords, setPostKeywords] = useState<Record<string, string[]>>({});
  // postId → 타겟 키워드 배열 (편집 중)
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string[]>>({});
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
  const [filter, setFilter] = useState<
    'all' | 'briefingExposed' | 'briefingUnexposed' | 'tabExposed' | 'tabUnexposed' | 'needsImprovement' | 'highScore' | 'lowScore'
  >('all');

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
      setEditingKeywords(prev => {
        const updated = { ...prev };
        if (blogPosts && blogPosts.length > 0) {
          blogPosts.forEach(post => { updated[post.id] = ['']; });
        }
        return updated;
      });
      setPostKeywords({});
      setBriefingResults({});

      await fetch(`${STATE_API}?all=true`, { method: 'DELETE' }).catch(() => null);

      showError('모든 타겟 키워드와 AI 브리핑 데이터가 초기화되었습니다.', 3000);
    } catch (err) {
      showError('초기화 중 오류가 발생했습니다.', 3000);
      console.error('Reset error:', err);
    }
  }, [profile, blogPosts, showError]);

  const handleClearPostKeywords = (postId: string) => {
    if (!profile) return;
    if (!confirm('이 포스팅의 모든 타겟 키워드를 삭제하시겠습니까?')) return;

    setEditingKeywords(prev => ({ ...prev, [postId]: [''] }));
    const updated = { ...postKeywords };
    delete updated[postId];
    setPostKeywords(updated);

    const newResults = { ...briefingResults };
    for (const key of Object.keys(newResults)) {
      if (key.startsWith(`${postId}::`)) delete newResults[key];
    }
    setBriefingResults(newResults);

    saveKeywordsToDb(profile.blogId, postId, []);
    showError('포스팅의 타겟 키워드가 초기화되었습니다.', 3000);
  };

  const fetchBlogPosts = useCallback(async (blogId: string, page: number = 1) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${postsPerPage}`);
      if (res.ok) {
        const data = await res.json();
        setBlogPosts(data.posts || []);
        setBlogPostsTotal(data.totalCount || 0);
        setCurrentPage(page);
      }
    } catch { /* ignore */ }
    finally { setPostsLoading(false); }
  }, [postsPerPage]);

  useEffect(() => {
    if (profile?.blogId) {
      fetchBlogPosts(profile.blogId, 1);
    }
  }, [profile?.blogId, fetchBlogPosts]);

  const { data: syncedState } = useQuery({
    queryKey: ['ai-briefing-state', profile?.blogId],
    queryFn: () => fetchBriefingState(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

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

  // 포스트 로드 시 타겟 키워드 초기화 (저장된 값 있으면 사용, 없으면 빈 입력 1개)
  useEffect(() => {
    if (!profile || blogPosts.length === 0) return;
    const initial: Record<string, string[]> = {};
    for (const post of blogPosts) {
      if (postKeywords[post.id] && postKeywords[post.id].length > 0) {
        initial[post.id] = [...postKeywords[post.id]];
      } else {
        initial[post.id] = [''];
      }
    }
    setEditingKeywords(prev => ({ ...prev, ...initial }));
  }, [profile, blogPosts, postKeywords]);

  const handleKeywordChange = (postId: string, kwIndex: number, value: string) => {
    setEditingKeywords(prev => {
      const kws = [...(prev[postId] || [])];
      kws[kwIndex] = value;
      return { ...prev, [postId]: kws };
    });
  };

  const handleKeywordSave = (postId: string) => {
    if (!profile) return;
    const kws = (editingKeywords[postId] || []).map(k => k.trim()).filter(Boolean);
    if (kws.length > 0) {
      setPostKeywords(prev => ({ ...prev, [postId]: kws }));
      saveKeywordsToDb(profile.blogId, postId, kws);
    }
  };

  // 포스팅 제목/본문을 분석해 대표 키워드를 자동 추출 — 입력칸만 채우고 저장은 사용자가 blur/Enter로 확정
  const handleAutoExtract = async (post: BlogPost) => {
    setExtractingPostId(post.id);
    try {
      const res = await fetch(
        `/api/blog/representative-keywords?blogId=${encodeURIComponent(profile!.blogId)}&postId=${encodeURIComponent(post.id)}&title=${encodeURIComponent(post.title)}`,
      );
      if (!res.ok) {
        showError('대표 키워드 자동 추출에 실패했습니다.', 5000);
        return;
      }
      const data: { keywords?: string[] } = await res.json();
      if (!data.keywords || data.keywords.length === 0) {
        showError('이 포스팅에서 대표 키워드를 찾지 못했습니다. 직접 입력해주세요.', 5000);
        return;
      }
      setEditingKeywords(prev => ({ ...prev, [post.id]: data.keywords!.slice(0, 5) }));
    } catch {
      showError('네트워크 오류로 대표 키워드를 추출하지 못했습니다.', 5000);
    } finally {
      setExtractingPostId('');
    }
  };

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
    setTimeout(() => handleKeywordSave(postId), 0);
  };

  // 2026-07-04(6차) 오렌지 지시: 진행 단계를 실시간으로 보여주기 위해 NDJSON 스트리밍 응답을 소비.
  // 캐시 적중/검증 실패/접근 거부 등은 서버가 여전히 일반 JSON으로 즉시 응답하므로
  // content-type으로 분기해서 두 경로 모두 처리한다.
  const checkSingleKeyword = async (post: BlogPost, keyword: string): Promise<{ ok: boolean; status: number; cached: boolean; result: BriefingResult | null }> => {
    if (!profile || !keyword.trim()) return { ok: false, status: 0, cached: false, result: null };
    const key = rankKey(post.id, keyword.trim());
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
        if (res.status === 429) {
          showError('요청이 너무 많습니다. 5분 후 다시 시도해주세요.');
        } else {
          const body = await res.json().catch(() => null);
          showError(body?.error || `AI 브리핑 확인 실패 (오류 ${res.status}). 잠시 후 다시 시도해주세요.`, 8000);
        }
        return { ok: false, status: res.status, cached: false, result: null };
      }

      const isStream = res.headers.get('content-type')?.includes('application/x-ndjson') && res.body;
      if (!isStream) {
        // 캐시 적중 등 — 일반 JSON 즉시 응답
        const data = await res.json();
        setBriefingResults(prev => ({ ...prev, [key]: data }));
        saveBriefingResultToDb(profile.blogId, post.id, keyword.trim(), data);
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
        return { ok: false, status: res.status, cached: false, result: null };
      }
      if (finalData) {
        const parsed = finalData as unknown as BriefingResult;
        setBriefingResults(prev => ({ ...prev, [key]: parsed }));
        saveBriefingResultToDb(profile.blogId, post.id, keyword.trim(), parsed);
        return { ok: true, status: res.status, cached: false, result: parsed };
      }
      showError('AI 브리핑 확인 결과를 받지 못했습니다. 잠시 후 다시 시도해주세요.', 8000);
      return { ok: false, status: res.status, cached: false, result: null };
    } catch {
      showError('네트워크 오류로 AI 브리핑을 확인하지 못했습니다.');
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

  const totalPages = Math.ceil(blogPostsTotal / postsPerPage);

  // 포스트 단위 노출 상태 파생 (해당 포스트에 할당된 키워드 중 하나라도 인용/미인용이면 그 상태로 판정)
  const postExposureState = (postId: string): { briefing: boolean | null; tab: boolean | null } => {
    const keywords = (postKeywords || {})[postId] || [];
    const results = keywords.map(kw => (briefingResults || {})[rankKey(postId, kw)]).filter(Boolean) as BriefingResult[];
    if (results.length === 0) return { briefing: null, tab: null };
    return {
      briefing: results.some(r => r.exposed === true) ? true : results.some(r => r.exposed === false) ? false : null,
      tab: results.some(r => r.tabExposed === true) ? true : results.some(r => r.tabExposed === false) ? false : null,
    };
  };

  const scoredPosts = Object.values(postScores);
  const kpiAvg = (key: 'aiScore' | 'seoScore' | 'geoScore' | 'aeoScore'): number =>
    scoredPosts.length === 0 ? 0 : Math.round(scoredPosts.reduce((s, p) => s + p[key], 0) / scoredPosts.length);

  const kpiExposure = blogPosts.reduce(
    (acc, post) => {
      const st = postExposureState(post.id);
      if (st.briefing === true) acc.briefingExposed++;
      if (st.briefing === false) acc.briefingUnexposed++;
      if (st.tab === true) acc.tabExposed++;
      if (st.tab === false) acc.tabUnexposed++;
      return acc;
    },
    { briefingExposed: 0, briefingUnexposed: 0, tabExposed: 0, tabUnexposed: 0 },
  );

  const FILTER_OPTIONS: { key: typeof filter; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'briefingExposed', label: 'AI브리핑 노출' },
    { key: 'briefingUnexposed', label: 'AI브리핑 미노출' },
    { key: 'tabExposed', label: 'AI탭 노출' },
    { key: 'tabUnexposed', label: 'AI탭 미노출' },
    { key: 'needsImprovement', label: '개선필요' },
    { key: 'highScore', label: '점수높은글' },
    { key: 'lowScore', label: '점수낮은글' },
  ];

  const filteredPosts = blogPosts.filter(post => {
    if (filter === 'all') return true;
    const st = postExposureState(post.id);
    const score = postScores[post.id];
    switch (filter) {
      case 'briefingExposed': return st.briefing === true;
      case 'briefingUnexposed': return st.briefing === false;
      case 'tabExposed': return st.tab === true;
      case 'tabUnexposed': return st.tab === false;
      case 'needsImprovement': return !!score && score.aiScore < 60;
      case 'highScore': return !!score && score.aiScore >= 70;
      case 'lowScore': return !!score && score.aiScore < 40;
      default: return true;
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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
            포스팅별 타겟 키워드를 지정하고 네이버 AI 브리핑(생성형 검색 답변) 인용 여부를 확인하세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canDownload && (
            <button
              onClick={handleDownload}
              disabled={blogPosts.length === 0}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
              title="현재 페이지 포스팅의 AI 브리핑 확인 결과를 CSV 다운로드 (최대 500건)"
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
        AI 브리핑(통합검색 인라인 위젯)과 AI 탭은 서로 완전히 다른 별개 서비스입니다 — 실제 브라우저로 두 화면을 순차 방문해
        각각 콘텐츠 생성 여부와 내 게시글의 출처 인용 여부를 독립적으로 확인하기 때문에 건당 30~50초 정도 걸릴 수 있습니다.
        한 번에 한 포스팅씩만 확인해주세요 — 짧은 시간에 반복 확인하면 네이버 측에서 일시적으로 접근이 제한될 수 있습니다.
        같은 키워드라도 검색 시점에 따라 두 서비스 각각의 노출 여부와 출처 목록이 서로 다르게 나타날 수 있습니다.
      </p>

      {/* 키워드 검색 + 자동 분석 */}
      <GlassCard padding="none">
        <div className="px-5 pt-5">
          <SectionHeader title="AI 브리핑 · AI탭" subtitle="키워드를 입력하면 노출 여부·순위·검색량·경쟁도·관련 키워드를 자동으로 분석합니다" />
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

      {/* 결과 히스토리 */}
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

      {/* 게시물별 키워드 관리 — 자동 매칭의 근거 데이터(타겟 키워드 등록)이자, 개별 게시물 단위로 직접 확인하고 싶을 때 사용 */}
      <details className="group">
        <summary className="cursor-pointer select-none px-4 py-3 rounded-xl border border-border bg-surface text-sm font-bold flex items-center justify-between hover:border-accent/50 transition">
          게시물별 키워드 관리
          <span className="text-dim text-xs group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="mt-4 space-y-4">

      {/* KPI 바 — 현재 페이지 로드된 포스팅 기준(전체 블로그 합산 아님) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <AnimatedStatCard label="전체 포스팅" value={blogPosts.length} description="현재 페이지 기준" color="dim" />
        <AnimatedStatCard label="AI브리핑 노출" value={kpiExposure.briefingExposed} color="up" />
        <AnimatedStatCard label="AI브리핑 미노출" value={kpiExposure.briefingUnexposed} color="down" />
        <AnimatedStatCard label="AI탭 노출" value={kpiExposure.tabExposed} color="up" />
        <AnimatedStatCard label="AI탭 미노출" value={kpiExposure.tabUnexposed} color="down" />
        <AnimatedStatCard label="평균 AI점수" value={kpiAvg('aiScore')} description={`${scoredPosts.length}개 분석됨`} color="accent" />
        <AnimatedStatCard label="평균 SEO점수" value={kpiAvg('seoScore')} description={`${scoredPosts.length}개 분석됨`} color="accent" />
        <AnimatedStatCard label="평균 GEO점수" value={kpiAvg('geoScore')} description={`${scoredPosts.length}개 분석됨`} color="accent" />
        <AnimatedStatCard label="평균 AEO점수" value={kpiAvg('aeoScore')} description={`${scoredPosts.length}개 분석됨`} color="accent" />
      </div>

      {/* 포스팅 수 선택 */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-surface rounded-lg border border-border p-0.5">
          {[30, 60, 90].map(n => (
            <button key={n} onClick={() => { setPostsPerPage(n); setCurrentPage(1); if (profile) fetchBlogPosts(profile.blogId, 1); }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                postsPerPage === n ? 'bg-accent text-white' : 'text-dim hover:text-text'
              }`}
            >
              {n}개
            </button>
          ))}
        </div>
        <span className="text-xs text-dim">
          총 {blogPostsTotal.toLocaleString()}개 포스팅
        </span>
      </div>

      {/* 필터 (현재 로드된 페이지 데이터 기준 클라이언트 사이드 필터) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
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
                    <th className="text-left px-3 py-3 font-semibold w-28">대표키워드</th>
                    <th className="text-left px-3 py-3 font-semibold w-40">타겟 키워드</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">AI브리핑</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">AI탭</th>
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
                  {filteredPosts.map((post, i) => {
                    const keywords = editingKeywords[post.id] || [];
                    const rowCount = Math.max(keywords.length, 1);
                    const score = postScores[post.id];
                    return keywords.map((kw, kwIdx) => {
                      const key = rankKey(post.id, kw.trim());
                      const result = briefingResults[key];
                      const isFirst = kwIdx === 0;
                      const isLast = kwIdx === rowCount - 1;
                      return (
                        <>
                        <tr key={`${post.id}-${kwIdx}`} className={`hover:bg-surface-hover transition ${!isLast ? '!border-b-0' : ''}`}>
                          {isFirst && (
                            <>
                              <td className="px-4 py-3 text-dim text-xs align-top" rowSpan={rowCount}>
                                {(currentPage - 1) * postsPerPage + i + 1}
                              </td>
                              <td className="px-3 py-3 align-top" rowSpan={rowCount}>
                                <a href={post.url} target="_blank" rel="noopener noreferrer"
                                  className="font-semibold hover:text-accent transition truncate block max-w-[280px]" title={post.title}>
                                  {post.title}
                                </a>
                                <div className="flex items-center gap-1.5 mt-1">
                                  {post.commentCount > 0 && (
                                    <span className="text-[10px] text-accent">댓글 {post.commentCount}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {!keywords.some(k => k.trim()) && (
                                    <button onClick={() => handleAutoExtract(post)}
                                      disabled={extractingPostId === post.id}
                                      className="text-xs text-accent cursor-pointer hover:underline disabled:opacity-50">
                                      {extractingPostId === post.id ? '추출 중...' : '자동 추출'}
                                    </button>
                                  )}
                                  {keywords.length < 5 && (
                                    <button onClick={() => addKeyword(post.id)}
                                      className="text-xs text-accent cursor-pointer hover:underline">
                                      + 키워드 추가
                                    </button>
                                  )}
                                  {keywords.some(k => k.trim()) && (
                                    <button onClick={() => handleClearPostKeywords(post.id)}
                                      className="text-xs text-down/60 hover:text-down cursor-pointer hover:underline">
                                      초기화
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3 align-top" rowSpan={rowCount}>
                                <span className="text-xs text-dim">{score?.representativeKeyword || '—'}</span>
                              </td>
                            </>
                          )}
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={kw}
                                onChange={e => handleKeywordChange(post.id, kwIdx, e.target.value)}
                                onBlur={() => handleKeywordSave(post.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleKeywordSave(post.id);
                                    checkSingleKeyword(post, kw);
                                  }
                                }}
                                className="flex-1 px-2 py-1.5 text-xs bg-bg border border-border rounded-lg focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                                placeholder="타겟 키워드"
                              />
                              {keywords.length > 1 && (
                                <button onClick={() => removeKeyword(post.id, kwIdx)}
                                  className="text-dim hover:text-down text-xs cursor-pointer shrink-0 px-1">
                                  x
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="text-center px-3 py-1.5">
                            <BriefingLabelBadge result={result} />
                          </td>
                          <td className="text-center px-3 py-1.5">
                            <AiTabBadge result={result} />
                          </td>
                          {isFirst && (
                            <>
                              <td className="text-center px-2 py-1.5 align-top" rowSpan={rowCount}>
                                <ScoreCell score={score?.aiScore} />
                              </td>
                              <td className="text-center px-2 py-1.5 align-top" rowSpan={rowCount}>
                                <ScoreCell score={score?.seoScore} />
                              </td>
                              <td className="text-center px-2 py-1.5 align-top" rowSpan={rowCount}>
                                <ScoreCell score={score?.geoScore} />
                              </td>
                              <td className="text-center px-2 py-1.5 align-top" rowSpan={rowCount}>
                                <ScoreCell score={score?.aeoScore} />
                              </td>
                              <td className="text-center px-3 py-1.5 align-top text-xs text-dim" rowSpan={rowCount}>
                                {typeof post.viewCount === 'number' ? post.viewCount.toLocaleString() : '—'}
                              </td>
                              <td className="text-center px-3 py-1.5 align-top text-[10px] text-dim" rowSpan={rowCount}>
                                {post.date}
                              </td>
                            </>
                          )}
                          <td className="text-center px-3 py-1.5">
                            <button
                              onClick={() => checkSingleKeyword(post, kw)}
                              disabled={!!checkingKey || !kw.trim()}
                              className="text-[11px] text-accent hover:underline cursor-pointer disabled:opacity-50"
                            >
                              {checkingKey === key ? (
                                <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                              ) : result ? '재확인' : '확인'}
                            </button>
                          </td>
                          {isFirst && (
                            <td className="text-center px-3 py-1.5 align-top" rowSpan={rowCount}>
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
                          )}
                        </tr>
                        {isFirst && score && score.causeTags.length > 0 && (
                          <tr key={`${post.id}-causes`} className={!isLast ? '!border-b-0' : ''}>
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
                        {isFirst && improvePanelPostId === post.id && score && (
                          <tr key={`${post.id}-improve`} className={!isLast ? '!border-b-0' : ''}>
                            <td colSpan={14} className="px-4 pb-4 pt-1 bg-bg/30">
                              <ImprovePanel score={score} />
                            </td>
                          </tr>
                        )}
                        </>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {filteredPosts.map((post, i) => {
                const keywords = editingKeywords[post.id] || [];
                const score = postScores[post.id];
                return (
                  <div key={post.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] text-dim w-5 shrink-0 pt-0.5">
                        {(currentPage - 1) * postsPerPage + i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <a href={post.url} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-sm hover:text-accent transition line-clamp-2">
                          {post.title}
                        </a>
                        <span className="text-[10px] text-dim ml-1">{post.date}</span>
                      </div>
                    </div>

                    <div className="pl-7 flex items-center gap-2 flex-wrap text-[10px] text-dim">
                      {score?.representativeKeyword && (
                        <span className="px-1.5 py-0.5 rounded-full bg-bg border border-border">대표키워드: {score.representativeKeyword}</span>
                      )}
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

                    <div className="space-y-1.5 pl-7">
                      {keywords.map((kw, kwIdx) => {
                        const key = rankKey(post.id, kw.trim());
                        const result = briefingResults[key];
                        return (
                          <div key={kwIdx} className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={kw}
                                onChange={e => handleKeywordChange(post.id, kwIdx, e.target.value)}
                                onBlur={() => handleKeywordSave(post.id)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleKeywordSave(post.id);
                                    checkSingleKeyword(post, kw);
                                  }
                                }}
                                className="flex-1 px-2.5 py-1.5 text-sm bg-bg border border-border rounded-lg focus:border-accent outline-none"
                                placeholder="타겟 키워드"
                              />
                              <button
                                onClick={() => checkSingleKeyword(post, kw)}
                                disabled={!!checkingKey || !kw.trim()}
                                className="px-2.5 py-1.5 text-[11px] text-accent border border-accent/30 rounded-lg cursor-pointer disabled:opacity-50 shrink-0"
                              >
                                {checkingKey === key ? (
                                  <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                                ) : result ? '재확인' : '확인'}
                              </button>
                              {keywords.length > 1 && (
                                <button onClick={() => removeKeyword(post.id, kwIdx)}
                                  className="text-dim hover:text-down text-xs cursor-pointer px-1">
                                  x
                                </button>
                              )}
                            </div>
                            {result && (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-dim">브리핑</span>
                                <BriefingLabelBadge result={result} />
                                <span className="text-[10px] text-dim">탭</span>
                                <AiTabBadge result={result} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2 flex-wrap">
                        {!keywords.some(k => k.trim()) && (
                          <button onClick={() => handleAutoExtract(post)}
                            disabled={extractingPostId === post.id}
                            className="text-xs text-accent cursor-pointer hover:underline disabled:opacity-50">
                            {extractingPostId === post.id ? '추출 중...' : '자동 추출'}
                          </button>
                        )}
                        {keywords.length < 5 && (
                          <button onClick={() => addKeyword(post.id)}
                            className="text-xs text-accent cursor-pointer hover:underline">
                            + 키워드 추가
                          </button>
                        )}
                        {keywords.some(k => k.trim()) && (
                          <button onClick={() => handleClearPostKeywords(post.id)}
                            className="text-xs text-down/60 hover:text-down cursor-pointer hover:underline">
                            초기화
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="pl-7 pt-0.5 flex items-center gap-3 flex-wrap">
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
                    {improvePanelPostId === post.id && score && (
                      <div className="mt-2">
                        <ImprovePanel score={score} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-2">
                <button
                  onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); if (profile) fetchBlogPosts(profile.blogId, Math.max(1, currentPage - 1)); }}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg disabled:opacity-30 cursor-pointer"
                >
                  이전
                </button>
                <span className="text-xs text-dim">{currentPage} / {totalPages}</span>
                <button
                  onClick={() => { setCurrentPage(p => Math.min(totalPages, p + 1)); if (profile) fetchBlogPosts(profile.blogId, Math.min(totalPages, currentPage + 1)); }}
                  disabled={currentPage === totalPages}
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
      </details>
    </div>
  );
}
