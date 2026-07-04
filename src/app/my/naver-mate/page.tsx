'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import GlassCard from '@/components/dashboard/GlassCard';
import { useAuth } from '@/hooks/useAuth';
import { rowsToCsv, downloadCsvInBrowser, todayStamp, DOWNLOAD_ROW_LIMIT } from '@/lib/csv';

interface BloggerProfile {
  blogId: string;
  displayName: string;
  isInfluencer: boolean;
}

interface BlogPost {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  date: string;
  isPublic: boolean;
}

interface BriefingResult {
  hasAiBriefing: boolean | null;  // AI 브리핑 컬럼: 이 키워드로 AI 탭에 들어갔을 때 실제 브리핑 콘텐츠가 생성됐는지
  exposed: boolean | null;        // AI 탭 컬럼: 그 브리핑의 출처 목록에 내 게시글이 포함되는지
  sourceIndex: number | null;
  sourceTotal: number | null;
  matchedTitle: string | null;
  error?: string;
}

const STATE_API = '/api/my/ai-briefing-state';

// 서버(DB)에서 저장된 타겟 키워드/AI 브리핑 결과를 복원한다. (기기 간 동기화)
async function fetchBriefingState(blogId: string): Promise<{
  postKeywords: Record<string, string[]>;
  briefingResults: Record<string, BriefingResult>;
}> {
  const res = await fetch(`${STATE_API}?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('상태 로드 실패');
  return res.json();
}

// 포스트별 타겟 키워드 할당을 DB에 저장 (제거된 키워드 삭제 포함)
function saveKeywordsToDb(blogId: string, postId: string, keywords: string[]): void {
  fetch(STATE_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keywords }),
  }).catch(() => { /* 낙관적 UI — 실패는 다음 동작에서 재시도됨 */ });
}

// 단일 (post, keyword) AI 브리핑 확인 결과를 DB에 갱신
function saveBriefingResultToDb(blogId: string, postId: string, keyword: string, result: BriefingResult): void {
  fetch(STATE_API, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blogId, postId, keyword, result }),
  }).catch(() => { /* ignore */ });
}

function rankKey(postId: string, keyword: string): string {
  return `${postId}::${keyword}`;
}

async function getProfileFromApi(): Promise<BloggerProfile | null> {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.type === 'unified' && (data.blogId || data.id)) {
      return { blogId: data.blogId || data.id, displayName: data.name || data.blogId || data.id, isInfluencer: true };
    }
    if (data.type === 'blogger' && data.id) {
      return { blogId: data.id, displayName: data.name || data.id, isInfluencer: false };
    }
    if (data.type === 'influencer' && data.id) {
      return { blogId: data.blogId || data.id, displayName: data.name || data.id, isInfluencer: true };
    }
    return null;
  } catch { return null; }
}

/** "AI 브리핑" 컬럼 배지 — 이 키워드로 AI 탭에 들어갔을 때 실제 브리핑 콘텐츠가 생성됐는지만 표시(인용 여부 무관). */
function BriefingLabelBadge({ result }: { result?: BriefingResult }) {
  if (!result) return <span className="text-[10px] text-dim/50">--</span>;
  if (result.hasAiBriefing === false) {
    return (
      <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded-full" title="이 키워드로는 AI 브리핑 콘텐츠 자체가 생성되지 않았습니다.">
        없음
      </span>
    );
  }
  return (
    <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full" title="이 키워드로 검색 시 AI 브리핑 콘텐츠가 생성됩니다.">
      있음
    </span>
  );
}

/** "AI 탭" 컬럼 배지 — AI 브리핑의 출처 목록에 내 게시글이 실제로 포함되는지(blogId+logNo 기준 매칭). */
function AiTabBadge({ result }: { result?: BriefingResult }) {
  if (!result) return <span className="text-[10px] text-dim/50">--</span>;
  if (!result.hasAiBriefing || !result.exposed) {
    return (
      <span className="text-xs text-dim bg-bg px-2 py-0.5 rounded-full" title="AI 브리핑의 출처 목록에 이 게시글이 없습니다.">
        없음
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full" title="AI 브리핑의 출처 목록에 이 게시글이 포함되어 있습니다.">
        있음
      </span>
      {result.sourceIndex && (
        <span className="text-[10px] text-dim">
          출처 #{result.sourceIndex}{result.sourceTotal ? `/${result.sourceTotal}` : ''}
        </span>
      )}
    </span>
  );
}

export default function NaverMatePage() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsTotal, setBlogPostsTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(30);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(false);

  // postId → 타겟 키워드 배열
  const [postKeywords, setPostKeywords] = useState<Record<string, string[]>>({});
  // postId → 타겟 키워드 배열 (편집 중)
  const [editingKeywords, setEditingKeywords] = useState<Record<string, string[]>>({});
  // "postId::keyword" → BriefingResult
  const [briefingResults, setBriefingResults] = useState<Record<string, BriefingResult>>({});
  const [checkingKey, setCheckingKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string, ms = 5000) => {
    setErrorMessage(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorMessage(''), ms);
  }, []);

  useEffect(() => () => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
  }, []);

  const { user } = useAuth();
  const isLoggedIn = !!(user.id || user.authId);
  const canDownload = user.isAdmin || user.subscriptionPlan === 'INFLUENCER';

  const handleDownload = () => {
    if (!canDownload) return;
    const headers = ['포스팅 제목', '포스팅 URL', '작성일', '타겟 키워드', 'AI 브리핑', 'AI 탭', '출처 순번', '출처 총계'];
    const rows: unknown[][] = [];
    for (const post of blogPosts) {
      const kws = postKeywords[post.id] || [];
      if (kws.length === 0) continue;
      for (const kw of kws) {
        if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
        const result = briefingResults[rankKey(post.id, kw)];
        const briefingStatus = !result ? '미확인' : result.hasAiBriefing ? '있음' : '없음';
        const tabStatus = !result ? '미확인' : (result.hasAiBriefing && result.exposed) ? '있음' : '없음';
        rows.push([
          post.title,
          post.url,
          post.date,
          kw,
          briefingStatus,
          tabStatus,
          result?.sourceIndex ?? '',
          result?.sourceTotal ?? '',
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
    (async () => {
      const p = await getProfileFromApi();
      setProfile(p);
      if (p?.blogId) {
        await fetchBlogPosts(p.blogId, 1);
      }
      setLoading(false);
    })();
  }, [fetchBlogPosts]);

  const { data: syncedState } = useQuery({
    queryKey: ['ai-briefing-state', profile?.blogId],
    queryFn: () => fetchBriefingState(profile!.blogId),
    enabled: !!profile?.blogId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (syncedState) {
      setPostKeywords(syncedState.postKeywords);
      setBriefingResults(syncedState.briefingResults);
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

  const checkSingleKeyword = async (post: BlogPost, keyword: string): Promise<{ ok: boolean; status: number; cached: boolean }> => {
    if (!profile || !keyword.trim()) return { ok: false, status: 0, cached: false };
    const key = rankKey(post.id, keyword.trim());
    setCheckingKey(key);
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
      if (res.ok) {
        const data = await res.json();
        setBriefingResults(prev => ({ ...prev, [key]: data }));
        saveBriefingResultToDb(profile.blogId, post.id, keyword.trim(), data);
        return { ok: true, status: res.status, cached: data?.cached === true };
      }
      if (res.status === 429) {
        showError('요청이 너무 많습니다. 5분 후 다시 시도해주세요.');
      } else {
        const body = await res.json().catch(() => null);
        showError(body?.error || `AI 브리핑 확인 실패 (오류 ${res.status}). 잠시 후 다시 시도해주세요.`, 8000);
      }
      return { ok: false, status: res.status, cached: false };
    } catch {
      showError('네트워크 오류로 AI 브리핑을 확인하지 못했습니다.');
      return { ok: false, status: 0, cached: false };
    } finally { setCheckingKey(''); }
  };

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

  if (!isLoggedIn) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
        <h1 className="font-title text-2xl font-extrabold">네이버메이트</h1>
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
        <h1 className="text-xl font-bold">네이버메이트</h1>
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
          <h1 className="font-title text-2xl font-extrabold">네이버메이트</h1>
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
        AI 브리핑 확인은 실제 브라우저로 네이버 AI 탭 답변 생성을 직접 기다린 뒤 내 게시글이 출처로 인용됐는지까지 확인하기 때문에 건당 20~30초 정도 걸릴 수 있습니다.
        한 번에 한 포스팅씩만 확인해주세요 — 짧은 시간에 반복 확인하면 네이버 측에서 일시적으로 접근이 제한될 수 있습니다.
        같은 키워드라도 검색 시점에 따라 AI 브리핑 자체가 노출되지 않거나 출처 목록이 달라질 수 있습니다.
      </p>

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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim uppercase">
                    <th className="text-left px-4 py-3 font-semibold w-10">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-44">타겟 키워드</th>
                    <th className="text-center px-3 py-3 font-semibold w-24">AI 브리핑</th>
                    <th className="text-center px-3 py-3 font-semibold w-32">AI 탭</th>
                    <th className="text-center px-4 py-3 font-semibold w-16">확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {blogPosts.map((post, i) => {
                    const keywords = editingKeywords[post.id] || [];
                    const rowCount = Math.max(keywords.length, 1);
                    return keywords.map((kw, kwIdx) => {
                      const key = rankKey(post.id, kw.trim());
                      const result = briefingResults[key];
                      const isFirst = kwIdx === 0;
                      const isLast = kwIdx === rowCount - 1;
                      return (
                        <tr key={`${post.id}-${kwIdx}`} className={`hover:bg-surface-hover transition ${!isLast ? '!border-b-0' : ''}`}>
                          {isFirst && (
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
                          <td className="text-center px-4 py-1.5">
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
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {blogPosts.map((post, i) => {
                const keywords = editingKeywords[post.id] || [];
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
  );
}
