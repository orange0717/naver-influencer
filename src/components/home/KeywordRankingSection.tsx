'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import GlassCard from '@/components/dashboard/GlassCard';
import { useAuth } from '@/hooks/useAuth';
import { rowsToCsv, downloadCsvInBrowser, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';
import BlogRankingClient from '@/app/keywords/blog-ranking/BlogRankingClient';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { BloggerProfile, BlogPost, RankingResult, RankDelta, SyncedState, KeywordRankLookupRow, RepKeywordEntry } from './KeywordRankingSection.helpers';
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
  getProfileFromApi,
} from './KeywordRankingSection.helpers';

export default function KeywordRankingSection() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(30);
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
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState('');
  const [showKeywordSearch, setShowKeywordSearch] = useState(false);
  const abortRef = useRef(false);
  const extractAbortRef = useRef(false);
  const refreshingRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const rankingResultsRef = useRef<Record<string, RankingResult>>({});
  const postKeywordsRef = useRef<Record<string, string[]>>({});
  const editingKeywordsRef = useRef<Record<string, string[]>>({});
  const repKeywordsRef = useRef<Record<string, RepKeywordEntry>>({});
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
          result?.viewTab?.exposed ? `${result.viewTab.rank}위` : '-',
          result?.blogTab?.exposed ? `${result.blogTab.rank}위` : '-',
          result?.influencerTab?.exposed ? `${result.influencerTab.rank}위` : '-',
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
    (async () => {
      const p = await getProfileFromApi();
      setProfile(p);
      if (p?.blogId) {
        await fetchBlogPosts(p.blogId, 1);
      }
      setLoading(false);
    })();
  }, [fetchBlogPosts]);

  // DB에서 저장된 키워드/순위 상태 복원 (기기 간 동기화). staleTime으로 재방문 시 재요청 최소화.
  const { data: syncedState } = useQuery({
    queryKey: ['keyword-ranking-state', profile?.blogId],
    queryFn: () => fetchRankingState(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  // 영속화된 대표 키워드 복원 (post_representative_keywords, blog_id 기준 공용 — 크롤링 없이 즉시 조회)
  const { data: repState } = useQuery({
    queryKey: ['rep-keywords-state', profile?.blogId],
    queryFn: () => fetchRepKeywordsState(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (repState) setRepKeywords(repState);
  }, [repState]);

  useEffect(() => {
    if (syncedState) {
      setPostKeywords(syncedState.postKeywords);
      setRankingResults(syncedState.rankingResults);
      setRankDeltas(syncedState.rankDeltas || {});
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
        saveRankResultToDb(profile.blogId, post.id, keyword.trim(), nextResult).then(ok => {
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
  const handleExtractRepresentative = useCallback(async (post: BlogPost) => {
    if (!profile) return;
    setExtractingRepId(post.id);
    try {
      const res = await fetch(
        `/api/blog/representative-keywords?blogId=${encodeURIComponent(profile.blogId)}&postId=${encodeURIComponent(post.id)}&title=${encodeURIComponent(post.title)}`,
      );
      if (!res.ok) {
        showError('대표 키워드 자동추출에 실패했습니다.', 4000);
        return;
      }
      const data: {
        representativeKeyword?: string | null;
        source?: string;
        keywords?: string[];
        candidateScreen?: { keyword: string; exposed: boolean; rank: number | null }[];
      } = await res.json();
      const keyword = data.representativeKeyword || null;
      setRepKeywords(prev => ({
        ...prev,
        [post.id]: {
          keyword,
          source: data.source,
          candidates: data.keywords || [],
          candidateScreen: data.candidateScreen || [],
        },
      }));
      if (keyword) await checkSingleKeyword(post, keyword);
    } catch {
      showError('네트워크 오류로 대표 키워드를 추출하지 못했습니다.', 4000);
    } finally {
      setExtractingRepId('');
    }
  }, [profile, checkSingleKeyword, showError]);

  // 대표 키워드가 아직 없는 포스팅을 순차적으로 추출 (네이버 크롤링 + 순위확인이 겹치므로 2초 간격)
  const extractAllRepresentative = useCallback(async () => {
    const targets = blogPosts.filter(p => !repKeywordsRef.current[p.id]?.keyword);
    if (targets.length === 0 || extractingAll) return;
    setExtractingAll(true);
    extractAbortRef.current = false;
    setExtractProgress({ current: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      if (extractAbortRef.current) break;
      await handleExtractRepresentative(targets[i]);
      setExtractProgress({ current: i + 1, total: targets.length });
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    setExtractingAll(false);
  }, [blogPosts, extractingAll, handleExtractRepresentative]);

  const stopExtractingAll = () => { extractAbortRef.current = true; };

  // 자동 백그라운드 갱신 + 관리자 수동 강제 새로고침이 공유하는 순차 실행기
  const runBatch = useCallback(async (
    pairs: { post: BlogPost; keyword: string }[],
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
      const r = await checkSingleKeyword(pairs[i].post, pairs[i].keyword, !!opts.force);
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
    const pairs: { post: BlogPost; keyword: string }[] = [];
    for (const post of blogPosts) {
      const kws = (postKeywordsRef.current[post.id] || []).map(k => k.trim()).filter(Boolean);
      for (const kw of kws) {
        const key = rankKey(post.id, kw);
        if (isStale(rankingResultsRef.current[key])) pairs.push({ post, keyword: kw });
      }
      const repKw = repKeywordsRef.current[post.id]?.keyword;
      if (repKw) {
        const key = rankKey(post.id, repKw);
        if (isStale(rankingResultsRef.current[key])) pairs.push({ post, keyword: repKw });
      }
    }
    if (pairs.length > 0) runBatch(pairs);
  }, [blogPosts, runBatch]);

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
          const nextResult: RankingResult = {
            viewTab: { exposed: row.view_exposed ?? false, rank: row.view_rank },
            blogTab: { exposed: row.blog_exposed ?? false, rank: row.blog_rank },
            influencerTab: { exposed: row.influencer_exposed ?? false, rank: row.influencer_rank },
            query: row.keyword,
            searchVolume: row.search_volume ?? undefined,
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

  // 관리자 전용: 캐시 무시하고 현재 페이지 전체를 강제로 다시 조회
  const handleAdminForceRefreshAll = () => {
    if (!profile || blogPosts.length === 0 || refreshingRef.current) return;
    const pairs: { post: BlogPost; keyword: string }[] = [];
    for (const post of blogPosts) {
      const kws = (postKeywords[post.id] || []).map(k => k.trim()).filter(Boolean);
      for (const kw of kws) pairs.push({ post, keyword: kw });
      const repKw = repKeywords[post.id]?.keyword;
      if (repKw) pairs.push({ post, keyword: repKw });
    }
    if (pairs.length > 0) runBatch(pairs, { force: true });
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

  // 로딩
  if (loading) {
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

  // 비로그인(게스트): 강제 리다이렉트 없이 로그인 유도 빈 상태 — /my 게스트 화면과 동일 톤
  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <h1 className="font-title text-2xl font-extrabold">키워드순위</h1>
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
        <h1 className="text-xl font-bold">키워드순위</h1>
        <p className="text-sm text-dim">블로그 주소가 필요합니다.</p>
        <Link href="/profile" className="inline-block px-6 py-3 bg-accent text-white font-bold rounded-xl">
          마이페이지에서 블로그 연결
        </Link>
      </div>
    );
  }

  const totalPages = Math.ceil(blogPostsTotal / postsPerPage);

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
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-title text-2xl font-extrabold">키워드순위</h1>
          <p className="text-sm text-dim mt-1">
            포스팅별 검색 키워드를 수정하고 정확한 순위를 확인하세요
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            {canDownload && (
              <button
                onClick={handleDownload}
                disabled={blogPosts.length === 0}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
                title="현재 페이지 포스팅의 키워드 순위 결과를 CSV 다운로드 (최대 500건)"
              >
                CSV 다운로드
              </button>
            )}
            {canDownload && profile && (
              <a
                href={`/api/downloads/my-keyword-ranking?blogId=${encodeURIComponent(profile.blogId)}`}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer"
                title="전체 포스팅(페이지 무관)의 키워드 순위 결과를 CSV로 다운로드"
              >
                전체 리포트
              </a>
            )}
            <button
              onClick={handleResetResults}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition cursor-pointer disabled:opacity-50"
              title="모든 키워드와 순위 데이터 초기화"
            >
              초기화
            </button>
            {extractingAll ? (
              <button
                onClick={stopExtractingAll}
                className="px-4 py-2 bg-down/10 text-down font-bold rounded-xl text-sm cursor-pointer hover:bg-down/20 transition"
              >
                중지 {extractProgress.current}/{extractProgress.total}
              </button>
            ) : (
              missingRepCount > 0 && (
                <button
                  onClick={extractAllRepresentative}
                  disabled={postsLoading || blogPosts.length === 0}
                  className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 text-sm"
                  title="포스팅 제목+본문을 분석해 대표 키워드를 자동추출합니다"
                >
                  대표 키워드 {missingRepCount}개 추출
                </button>
              )
            )}
            {user.isAdmin && (
              checkingAll ? (
                <button
                  onClick={stopChecking}
                  className="px-4 py-2 bg-down/10 text-down font-bold rounded-xl text-sm cursor-pointer hover:bg-down/20 transition"
                >
                  중지 {checkProgress.current}/{checkProgress.total}
                </button>
              ) : (
                <button
                  onClick={handleAdminForceRefreshAll}
                  disabled={postsLoading || blogPosts.length === 0}
                  className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 text-sm"
                  title="관리자 전용: 캐시를 무시하고 전체를 강제로 다시 조회합니다"
                >
                  전체 새로고침
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-dim h-4">
            {checkingAll && (
              <span className="w-2.5 h-2.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block shrink-0" />
            )}
            {overallLastUpdated ? (
              <span>마지막 업데이트: {timeAgo(overallLastUpdated)}</span>
            ) : checkingAll ? (
              <span>최신 순위 확인 중...</span>
            ) : null}
          </div>
        </div>
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

      {/* 테이블 */}
      <GlassCard padding="none">
        {postsLoading ? (
          <div className="p-12 text-center text-dim text-sm">포스팅을 불러오는 중...</div>
        ) : blogPosts.length === 0 ? (
          <div className="p-12 text-center text-dim text-sm">포스팅이 없습니다.</div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1040px]">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim uppercase">
                    <th className="text-left px-4 py-3 font-semibold w-10">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-48">검색 키워드</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">통합검색</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">블로그</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">인플루언서</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">전일대비</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">7일대비</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">검색량</th>
                    <th className="text-center px-4 py-3 font-semibold w-20">업데이트</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {blogPosts.map((post, i) => {
                    const keywords = editingKeywords[post.id] || [];
                    const rowCount = Math.max(keywords.length, 1) + 1; // +1: 대표 키워드 행
                    const repEntry = repKeywords[post.id];
                    const repKeyword = repEntry?.keyword || null;
                    const repKey = repKeyword ? rankKey(post.id, repKeyword) : '';
                    const repResult = repKeyword ? rankingResults[repKey] : undefined;
                    const repDelta = repKeyword ? rankDeltas[repKey] : undefined;
                    const repPrevDelta = repResult ? computeDeltaDisplay(repResult.viewTab.exposed, repResult.viewTab.rank, repDelta?.prevRank ?? null, repDelta?.prevCheckedAt ?? null) : null;
                    const repWeekDelta = repResult ? computeDeltaDisplay(repResult.viewTab.exposed, repResult.viewTab.rank, repDelta?.weekRank ?? null, repDelta?.weekCheckedAt ?? null) : null;
                    const repFlashing = repKeyword ? flashKeys.has(repKey) : false;
                    const isExtracting = extractingRepId === post.id;

                    const sharedCells = (
                      <>
                        <td className="px-4 py-3 text-dim text-xs align-top" rowSpan={rowCount}>
                          {(currentPage - 1) * postsPerPage + i + 1}
                        </td>
                        <td className="px-3 py-3 align-top" rowSpan={rowCount}>
                          <a href={post.url} target="_blank" rel="noopener noreferrer"
                            className="font-semibold hover:text-accent transition truncate block max-w-[320px]" title={post.title}>
                            {post.title}
                          </a>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-dim">{post.date}</span>
                            {post.commentCount > 0 && (
                              <span className="text-[10px] text-accent">댓글 {post.commentCount}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5">
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
                      </>
                    );

                    const repRow = (
                      <tr key={`${post.id}-rep`} className={`hover:bg-surface-hover transition !border-b-0 bg-accent/5`}>
                        {sharedCells}
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full shrink-0">대표</span>
                            {repKeyword ? (
                              <span className="text-xs font-semibold truncate" title={repKeyword}>{repKeyword}</span>
                            ) : (
                              <span className="text-xs text-dim">미확인</span>
                            )}
                            <button
                              onClick={() => handleExtractRepresentative(post)}
                              disabled={isExtracting}
                              className="ml-auto text-dim hover:text-accent cursor-pointer disabled:opacity-40 text-xs shrink-0"
                              title="대표 키워드 자동추출(다시 누르면 재추출)"
                            >
                              {isExtracting ? (
                                <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                              ) : '⟳'}
                            </button>
                          </div>
                          {(repEntry?.candidates?.length ?? 0) > 1 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {repEntry!.candidates!.map(kw => {
                                const isRep = kw === repKeyword;
                                const screen = repEntry?.candidateScreen?.find(s => s.keyword === kw);
                                return (
                                  <span
                                    key={kw}
                                    title={screen?.exposed ? `통합검색 ${screen.rank}위` : screen ? '통합검색 100위 밖' : '스크리닝 전'}
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[110px] ${
                                      isRep ? 'bg-accent/15 text-accent font-semibold' : 'bg-bg text-dim'
                                    }`}
                                  >
                                    {isRep ? '★ ' : ''}{kw}
                                    {screen?.exposed ? ` ${screen.rank}위` : ''}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className={`text-center px-3 py-1.5 transition-colors duration-700 ${repFlashing ? 'bg-accent/15' : ''}`}>
                          {repResult ? (
                            repResult.viewTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                {repResult.viewTab.rank}위
                              </span>
                            ) : <span className="text-xs text-dim">-</span>
                          ) : <span className="text-[10px] text-dim/50">--</span>}
                        </td>
                        <td className={`text-center px-3 py-1.5 transition-colors duration-700 ${repFlashing ? 'bg-accent/15' : ''}`}>
                          {repResult ? (
                            repResult.blogTab.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                {repResult.blogTab.rank}위
                              </span>
                            ) : <span className="text-xs text-dim">-</span>
                          ) : <span className="text-[10px] text-dim/50">--</span>}
                        </td>
                        <td className={`text-center px-3 py-1.5 transition-colors duration-700 ${repFlashing ? 'bg-accent/15' : ''}`}>
                          {repResult ? (
                            repResult.influencerTab?.exposed ? (
                              <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                {repResult.influencerTab.rank}위
                              </span>
                            ) : <span className="text-xs text-dim">-</span>
                          ) : <span className="text-[10px] text-dim/50">--</span>}
                        </td>
                        <td className="text-center px-3 py-1.5">
                          {repPrevDelta ? (
                            <span className={`text-xs font-bold ${repPrevDelta.colorClass}`} title={repPrevDelta.tooltip}>
                              {repPrevDelta.label}
                            </span>
                          ) : <span className="text-[10px] text-dim/50">--</span>}
                        </td>
                        <td className="text-center px-3 py-1.5">
                          {repWeekDelta ? (
                            <span className={`text-xs font-bold ${repWeekDelta.colorClass}`} title={repWeekDelta.tooltip}>
                              {repWeekDelta.label}
                            </span>
                          ) : <span className="text-[10px] text-dim/50">--</span>}
                        </td>
                        <td className="text-center px-3 py-1.5 text-xs text-dim">
                          {repResult?.searchVolume ? repResult.searchVolume.toLocaleString() : '--'}
                        </td>
                        <td className="text-center px-4 py-1.5">
                          <span
                            className="text-[10px] text-dim"
                            title={repResult?.checkedAt ? new Date(repResult.checkedAt).toLocaleString('ko-KR') : ''}
                          >
                            {repResult?.checkedAt ? timeAgo(repResult.checkedAt) : '--'}
                          </span>
                        </td>
                      </tr>
                    );

                    const keywordRows = keywords.map((kw, kwIdx) => {
                      const key = rankKey(post.id, kw.trim());
                      const result = rankingResults[key];
                      const delta = rankDeltas[key];
                      const prevDelta = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.prevRank ?? null, delta?.prevCheckedAt ?? null) : null;
                      const weekDelta = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.weekRank ?? null, delta?.weekCheckedAt ?? null) : null;
                      const isLast = kwIdx === keywords.length - 1;
                      const flashing = flashKeys.has(key);
                      return (
                        <tr key={`${post.id}-${kwIdx}`} className={`hover:bg-surface-hover transition ${!isLast ? '!border-b-0' : ''}`}>
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
                                  }
                                }}
                                className="flex-1 px-2 py-1.5 text-xs bg-bg border border-border rounded-lg focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition"
                                placeholder="키워드"
                              />
                              {keywords.length > 1 && (
                                <button onClick={() => removeKeyword(post.id, kwIdx)}
                                  className="text-dim hover:text-down text-xs cursor-pointer shrink-0 px-1">
                                  x
                                </button>
                              )}
                            </div>
                          </td>
                          <td className={`text-center px-3 py-1.5 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>
                            {result ? (
                              result.viewTab.exposed ? (
                                <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                  {result.viewTab.rank}위
                                </span>
                              ) : <span className="text-xs text-dim">-</span>
                            ) : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className={`text-center px-3 py-1.5 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>
                            {result ? (
                              result.blogTab.exposed ? (
                                <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                  {result.blogTab.rank}위
                                </span>
                              ) : <span className="text-xs text-dim">-</span>
                            ) : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className={`text-center px-3 py-1.5 transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>
                            {result ? (
                              result.influencerTab?.exposed ? (
                                <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                  {result.influencerTab.rank}위
                                </span>
                              ) : <span className="text-xs text-dim">-</span>
                            ) : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className="text-center px-3 py-1.5">
                            {prevDelta ? (
                              <span className={`text-xs font-bold ${prevDelta.colorClass}`} title={prevDelta.tooltip}>
                                {prevDelta.label}
                              </span>
                            ) : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className="text-center px-3 py-1.5">
                            {weekDelta ? (
                              <span className={`text-xs font-bold ${weekDelta.colorClass}`} title={weekDelta.tooltip}>
                                {weekDelta.label}
                              </span>
                            ) : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className="text-center px-3 py-1.5 text-xs text-dim">
                            {result?.searchVolume ? result.searchVolume.toLocaleString() : '--'}
                          </td>
                          <td className="text-center px-4 py-1.5">
                            {checkingKey === key ? (
                              <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                            ) : (
                              <div className="flex items-center justify-center gap-1">
                                <span
                                  className="text-[10px] text-dim"
                                  title={result?.checkedAt ? new Date(result.checkedAt).toLocaleString('ko-KR') : ''}
                                >
                                  {result?.checkedAt ? timeAgo(result.checkedAt) : '--'}
                                </span>
                                {user.isAdmin && kw.trim() && (
                                  <button
                                    onClick={() => checkSingleKeyword(post, kw, true)}
                                    disabled={checkingAll}
                                    className="text-dim hover:text-accent cursor-pointer disabled:opacity-40 text-xs"
                                    title="관리자 전용: 캐시 무시하고 강제 재조회"
                                  >
                                    ⟳
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    });

                    return [repRow, ...keywordRows];
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {blogPosts.map((post, i) => {
                const keywords = editingKeywords[post.id] || [];
                const repEntry = repKeywords[post.id];
                const repKeyword = repEntry?.keyword || null;
                const repKey = repKeyword ? rankKey(post.id, repKeyword) : '';
                const repResult = repKeyword ? rankingResults[repKey] : undefined;
                const repDelta = repKeyword ? rankDeltas[repKey] : undefined;
                const repPrevDelta = repResult ? computeDeltaDisplay(repResult.viewTab.exposed, repResult.viewTab.rank, repDelta?.prevRank ?? null, repDelta?.prevCheckedAt ?? null) : null;
                const repWeekDelta = repResult ? computeDeltaDisplay(repResult.viewTab.exposed, repResult.viewTab.rank, repDelta?.weekRank ?? null, repDelta?.weekCheckedAt ?? null) : null;
                const repFlashing = repKeyword ? flashKeys.has(repKey) : false;
                const isExtracting = extractingRepId === post.id;
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

                    {/* 대표 키워드 행 */}
                    <div className={`ml-7 rounded-lg p-2 space-y-1 bg-accent/5 transition-colors duration-700 ${repFlashing ? '!bg-accent/15' : ''}`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full shrink-0">대표</span>
                        {repKeyword ? (
                          <span className="text-xs font-semibold truncate" title={repKeyword}>{repKeyword}</span>
                        ) : (
                          <span className="text-xs text-dim">미확인</span>
                        )}
                        <button
                          onClick={() => handleExtractRepresentative(post)}
                          disabled={isExtracting}
                          className="ml-auto text-dim hover:text-accent cursor-pointer disabled:opacity-40 text-xs shrink-0"
                          title="대표 키워드 자동추출(다시 누르면 재추출)"
                        >
                          {isExtracting ? (
                            <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                          ) : '⟳'}
                        </button>
                      </div>
                      {(repEntry?.candidates?.length ?? 0) > 1 && (
                        <div className="flex flex-wrap gap-1">
                          {repEntry!.candidates!.map(kw => {
                            const isRep = kw === repKeyword;
                            const screen = repEntry?.candidateScreen?.find(s => s.keyword === kw);
                            return (
                              <span
                                key={kw}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full truncate max-w-[110px] ${
                                  isRep ? 'bg-accent/15 text-accent font-semibold' : 'bg-bg text-dim'
                                }`}
                              >
                                {isRep ? '★ ' : ''}{kw}
                                {screen?.exposed ? ` ${screen.rank}위` : ''}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {repResult && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            repResult.viewTab.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                          }`}>
                            통합 {repResult.viewTab.exposed ? `${repResult.viewTab.rank}위` : '-'}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            repResult.blogTab.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                          }`}>
                            블로그 {repResult.blogTab.exposed ? `${repResult.blogTab.rank}위` : '-'}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            repResult.influencerTab?.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                          }`}>
                            인플루언서 {repResult.influencerTab?.exposed ? `${repResult.influencerTab.rank}위` : '-'}
                          </span>
                          {repResult.searchVolume ? (
                            <span className="text-[10px] text-dim">{repResult.searchVolume.toLocaleString()}</span>
                          ) : null}
                        </div>
                      )}
                      {repResult && repPrevDelta && repWeekDelta && (
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className={`font-bold ${repPrevDelta.colorClass}`} title={repPrevDelta.tooltip}>전일 {repPrevDelta.label}</span>
                          <span className={`font-bold ${repWeekDelta.colorClass}`} title={repWeekDelta.tooltip}>7일 {repWeekDelta.label}</span>
                          <span className="text-dim ml-auto" title={repResult?.checkedAt ? new Date(repResult.checkedAt).toLocaleString('ko-KR') : ''}>
                            {repResult?.checkedAt ? timeAgo(repResult.checkedAt) : ''}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 키워드별 행 */}
                    <div className="space-y-1.5 pl-7">
                      {keywords.map((kw, kwIdx) => {
                        const key = rankKey(post.id, kw.trim());
                        const result = rankingResults[key];
                        const delta = rankDeltas[key];
                        const prevDelta = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.prevRank ?? null, delta?.prevCheckedAt ?? null) : null;
                        const weekDelta = result ? computeDeltaDisplay(result.viewTab.exposed, result.viewTab.rank, delta?.weekRank ?? null, delta?.weekCheckedAt ?? null) : null;
                        const flashing = flashKeys.has(key);
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
                                  }
                                }}
                                className="flex-1 px-2.5 py-1.5 text-sm bg-bg border border-border rounded-lg focus:border-accent outline-none"
                                placeholder="키워드"
                              />
                              {checkingKey === key ? (
                                <span className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block shrink-0" />
                              ) : (
                                <span
                                  className="text-[10px] text-dim shrink-0"
                                  title={result?.checkedAt ? new Date(result.checkedAt).toLocaleString('ko-KR') : ''}
                                >
                                  {result?.checkedAt ? timeAgo(result.checkedAt) : '--'}
                                </span>
                              )}
                              {user.isAdmin && kw.trim() && checkingKey !== key && (
                                <button
                                  onClick={() => checkSingleKeyword(post, kw, true)}
                                  disabled={checkingAll}
                                  className="text-dim hover:text-accent cursor-pointer disabled:opacity-40 text-xs shrink-0 px-1"
                                  title="관리자 전용: 캐시 무시하고 강제 재조회"
                                >
                                  ⟳
                                </button>
                              )}
                              {keywords.length > 1 && (
                                <button onClick={() => removeKeyword(post.id, kwIdx)}
                                  className="text-dim hover:text-down text-xs cursor-pointer px-1 shrink-0">
                                  x
                                </button>
                              )}
                            </div>
                            {result && (
                              <div className={`flex items-center gap-2 flex-wrap rounded-lg transition-colors duration-700 ${flashing ? 'bg-accent/15' : ''}`}>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  result.viewTab.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                                }`}>
                                  통합 {result.viewTab.exposed ? `${result.viewTab.rank}위` : '-'}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  result.blogTab.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                                }`}>
                                  블로그 {result.blogTab.exposed ? `${result.blogTab.rank}위` : '-'}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  result.influencerTab?.exposed ? 'bg-up/10 text-up' : 'bg-bg text-dim'
                                }`}>
                                  인플루언서 {result.influencerTab?.exposed ? `${result.influencerTab.rank}위` : '-'}
                                </span>
                                {result.searchVolume ? (
                                  <span className="text-[10px] text-dim">{result.searchVolume.toLocaleString()}</span>
                                ) : null}
                              </div>
                            )}
                            {result && prevDelta && weekDelta && (
                              <div className="flex items-center gap-2 text-[10px]">
                                <span className={`font-bold ${prevDelta.colorClass}`} title={prevDelta.tooltip}>전일 {prevDelta.label}</span>
                                <span className={`font-bold ${weekDelta.colorClass}`} title={weekDelta.tooltip}>7일 {weekDelta.label}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center gap-2">
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
                  </div>
                );
              })}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-border/50 flex items-center justify-center gap-2">
                <button
                  onClick={() => { setCurrentPage(p => Math.max(1, p - 1)); if (profile) fetchBlogPosts(profile.blogId, Math.max(1, currentPage - 1)); }}
                  disabled={currentPage === totalPages}
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

      {/* 임의 키워드 검색 — 기존 /keywords/blog-ranking 로직을 접이식 박스로 그대로 내장 */}
      <GlassCard padding="none">
        <button
          onClick={() => setShowKeywordSearch(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 cursor-pointer"
        >
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
    </div>
  );
}
