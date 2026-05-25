'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

interface RankingResult {
  blogTab: { exposed: boolean; rank: number | null };
  viewTab: { exposed: boolean; rank: number | null };
  query: string;
  searchVolume?: number;
}

const STORAGE_PREFIX = 'ninfl_custom_keywords_';
const RANKING_STORAGE_PREFIX = 'ninfl_ranking_results_';

// 키워드 저장: postId → 키워드 배열
function loadCustomKeywords(blogId: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${blogId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 이전 형식(string) 호환
      const result: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(parsed)) {
        result[k] = Array.isArray(v) ? v as string[] : [v as string];
      }
      return result;
    }
  } catch { /* ignore */ }
  return {};
}

function saveCustomKeywords(blogId: string, data: Record<string, string[]>): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${blogId}`, JSON.stringify(data));
  } catch { /* ignore */ }
}

// 순위 결과: "postId::keyword" → RankingResult
function loadRankingResults(blogId: string): Record<string, RankingResult> {
  try {
    const raw = localStorage.getItem(`${RANKING_STORAGE_PREFIX}${blogId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveRankingResults(blogId: string, data: Record<string, RankingResult>): void {
  try {
    // 최대 500개 키워드만 보관 (오래된 것 제거)
    const entries = Object.entries(data);
    if (entries.length > 500) {
      const trimmed = Object.fromEntries(entries.slice(-500));
      localStorage.setItem(`${RANKING_STORAGE_PREFIX}${blogId}`, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(`${RANKING_STORAGE_PREFIX}${blogId}`, JSON.stringify(data));
    }
  } catch { /* ignore */ }
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

// 한국어 조사 제거 (결과가 2글자 미만이면 원본 반환)
function stripParticles(word: string): string {
  const particles2 = ['에서','에게','으로','처럼','만큼','부터','까지','마저','조차','이란','이라','에는','에도','으로서'];
  for (const p of particles2) {
    if (word.length > p.length + 1 && word.endsWith(p)) {
      const stripped = word.slice(0, -p.length);
      if (stripped.length >= 2) return stripped;
    }
  }
  const particles1 = ['의','에','를','을','이','가','는','은','와','과','도','로','만','란','라','며','면','야'];
  for (const p of particles1) {
    if (word.length > 2 && word.endsWith(p)) {
      const stripped = word.slice(0, -p.length);
      if (stripped.length >= 2) return stripped;
    }
  }
  return word;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 포스팅 제목에서 핵심 키워드 추출
function extractKeywords(title: string, blogId: string, displayName?: string): string[] {
  let cleaned = title;
  const removePatterns = [blogId, blogId.replace(/[_-]/g, '')];
  if (displayName && displayName.length >= 2) {
    removePatterns.push(displayName);
    if (displayName.length >= 4) {
      removePatterns.push(displayName.slice(0, Math.ceil(displayName.length / 2)));
    }
  }
  const nameSuffixes = ['단상', '도서관', '지음', '블로그', '일기', '기록', '이야기', '스토리'];
  for (const p of removePatterns) {
    if (p.length >= 2) cleaned = cleaned.replace(new RegExp(escapeRegExp(p), 'gi'), ' ');
  }
  for (const s of nameSuffixes) {
    if (displayName && cleaned.toLowerCase().includes(displayName.slice(0, 3).toLowerCase() + s)) {
      cleaned = cleaned.replace(new RegExp(escapeRegExp(displayName.slice(0, 3)) + s, 'gi'), ' ');
    }
  }
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  const rawWords = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

  const mergedWords: string[] = [];
  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];
    const next = rawWords[i + 1];
    if (/[가-힣]의$/.test(word) && next && /^[가-힣]{1,3}$/.test(next)) {
      mergedWords.push(word + next);
      i++;
    } else {
      mergedWords.push(word);
    }
  }

  const stop = new Set(['의','에','를','을','이','가','는','은','와','과','도','로','으로','에서','에게','한','된','하는','있는','없는','대한','위한','통한','그리고','또는','하지만','그러나','때문에','그래서','관련','관련한','관련된','대해','대해서','과연','입장글','입장','TOP','VS','BEST','추천','정리','모음','총정리','후기','리뷰','비교','분석','방법','소개','안내','단상','지음','中','및','더','각','수','것','중','좋은','나쁜','많은','적은','새로운']);
  const result: string[] = [];
  const seen = new Set<string>();

  function add(kw: string) {
    const k = kw.trim();
    if (k.length >= 2 && !seen.has(k) && !stop.has(k)) {
      result.push(k);
      seen.add(k);
    }
  }

  const kwSuffixes = ['글귀', '명대사', '명언'];

  for (const raw of mergedWords) {
    if (raw.length < 2 || /^\d+$/.test(raw) || stop.has(raw)) continue;
    if (/^[가-힣]{4,}$/.test(raw)) {
      add(raw);
      for (const suf of kwSuffixes) {
        if (raw.endsWith(suf) && raw.length > suf.length + 1) {
          const prefix = raw.slice(0, -suf.length);
          for (const p of ['고', '과', '와']) {
            const pidx = prefix.lastIndexOf(p);
            if (pidx >= 1) {
              const mid = prefix.slice(pidx + 1) + suf;
              if (mid.length >= 3) add(mid);
            }
          }
          add(suf);
        }
      }
    } else {
      const stripped = /^[가-힣]+$/.test(raw) ? stripParticles(raw) : raw;
      if (stripped.length >= 2 && !stop.has(stripped) && !/^[a-zA-Z]$/.test(stripped)) {
        add(stripped);
      }
    }
  }

  return result.slice(0, 6);
}

export default function KeywordRankingPage() {
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
  const [checkingKey, setCheckingKey] = useState('');
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef(false);
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
  const canDownload = user.isAdmin || user.subscriptionPlan === 'INFLUENCER';

  const handleDownload = () => {
    if (!canDownload) return;
    const headers = ['포스팅 제목', '포스팅 URL', '작성일', '키워드', '통합검색 순위', '블로그탭 순위', '검색량'];
    const rows: unknown[][] = [];
    for (const post of blogPosts) {
      const kws = postKeywords[post.id] || [];
      if (kws.length === 0) continue;
      for (const kw of kws) {
        if (rows.length >= DOWNLOAD_ROW_LIMIT) break;
        const result = rankingResults[rankKey(post.id, kw)];
        rows.push([
          post.title,
          post.url,
          post.date,
          kw,
          result?.viewTab?.rank ?? '',
          result?.blogTab?.rank ?? '',
          result?.searchVolume ?? '',
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

      // 저장된 키워드 전부 삭제
      setPostKeywords({});
      saveCustomKeywords(profile.blogId, {});

      // 2. 모든 순위 결과 초기화
      setRankingResults({});
      saveRankingResults(profile.blogId, {});

      // 3. 백엔드에서 저장된 키워드도 삭제 요청
      // 저장된 검색 키워드 테이블의 해당 사용자 키워드 모두 삭제
      const response = await fetch('/api/my/saved-keywords?all=true', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);

      showError('모든 키워드와 순위 데이터가 초기화되었습니다.', 3000);
    } catch (err) {
      showError('초기화 중 오류가 발생했습니다.', 3000);
      console.error('Reset error:', err);
    }
  }, [profile, blogPosts, showError]);

  const handleClearPostKeywords = (postId: string) => {
    if (!profile) return;
    if (!confirm('이 포스팅의 모든 키워드를 삭제하시겠습니까?')) return;

    // 키워드 초기화
    setEditingKeywords(prev => ({ ...prev, [postId]: [''] }));
    const updated = { ...postKeywords };
    delete updated[postId];
    setPostKeywords(updated);
    saveCustomKeywords(profile.blogId, updated);

    // 해당 포스팅의 순위 결과도 삭제
    const newResults = { ...rankingResults };
    for (const key of Object.keys(newResults)) {
      if (key.startsWith(`${postId}::`)) {
        delete newResults[key];
      }
    }
    setRankingResults(newResults);
    saveRankingResults(profile.blogId, newResults);

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
        const saved = loadCustomKeywords(p.blogId);
        setPostKeywords(saved);
        const savedResults = loadRankingResults(p.blogId);
        setRankingResults(savedResults);
      }
      setLoading(false);
    })();
  }, [fetchBlogPosts]);

  // 포스트 로드 시 키워드 초기화 (저장된 키워드 있으면 사용, 없으면 빈 입력 1개)
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
      const updated = { ...postKeywords, [postId]: kws };
      setPostKeywords(updated);
      saveCustomKeywords(profile.blogId, updated);
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
    // 저장도 즉시
    setTimeout(() => handleKeywordSave(postId), 0);
  };

  const checkSingleKeyword = async (post: BlogPost, keyword: string): Promise<{ ok: boolean; status: number }> => {
    if (!profile || !keyword.trim()) return { ok: false, status: 0 };
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
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRankingResults(prev => {
          const updated = { ...prev, [key]: data };
          if (profile) saveRankingResults(profile.blogId, updated);
          return updated;
        });
        // 저장된 키워드라면 최신 순위 캐시도 갱신 (실패 무시)
        fetch('/api/my/saved-keywords', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: keyword.trim(),
            view_rank: data?.viewTab?.rank ?? null,
            blog_rank: data?.blogTab?.rank ?? null,
            view_exposed: data?.viewTab?.exposed ?? null,
            blog_exposed: data?.blogTab?.exposed ?? null,
            post_id: post.id,
          }),
        }).catch(() => { /* ignore */ });
        return { ok: true, status: res.status };
      }
      if (res.status === 429) {
        showError('요청이 너무 많습니다. 5분 후 다시 시도해주세요.');
      } else {
        showError(`순위 확인 실패 (오류 ${res.status}). 잠시 후 다시 시도해주세요.`);
      }
      return { ok: false, status: res.status };
    } catch {
      showError('네트워크 오류로 순위를 확인하지 못했습니다.');
      return { ok: false, status: 0 };
    } finally { setCheckingKey(''); }
  };

  const checkAllRankings = async () => {
    if (!profile || blogPosts.length === 0) return;
    abortRef.current = false;
    setCheckingAll(true);

    // 모든 포스트의 모든 키워드 쌍 수집
    const pairs: { post: BlogPost; keyword: string }[] = [];
    for (const post of blogPosts) {
      const kws = (editingKeywords[post.id] || []).filter(k => k.trim());
      for (const kw of kws) {
        pairs.push({ post, keyword: kw.trim() });
      }
    }

    setCheckProgress({ current: 0, total: pairs.length });

    for (let i = 0; i < pairs.length; i++) {
      if (abortRef.current) break;
      setCheckProgress({ current: i + 1, total: pairs.length });
      const r = await checkSingleKeyword(pairs[i].post, pairs[i].keyword);
      if (r.status === 429) {
        showError(`요청 한도 초과로 ${i + 1}/${pairs.length}에서 중단했습니다. 5분 후 다시 시도해주세요.`, 8000);
        break;
      }
      if (i < pairs.length - 1) {
        await new Promise(r => setTimeout(r, 7000));
      }
    }

    setCheckingAll(false);
    setCheckProgress({ current: 0, total: 0 });
  };

  const stopChecking = () => {
    abortRef.current = true;
  };

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

  // 블로그 미연결
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
          <button
            onClick={handleResetResults}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-dim/5 text-dim/70 border border-dim/20 hover:bg-dim/10 transition cursor-pointer"
            title="모든 키워드와 순위 데이터 초기화"
          >
            초기화
          </button>
          {checkingAll ? (
            <button
              onClick={stopChecking}
              className="px-4 py-2 bg-down/10 text-down font-bold rounded-xl text-sm cursor-pointer hover:bg-down/20 transition"
            >
              중지 {checkProgress.current}/{checkProgress.total}
            </button>
          ) : (
            <button
              onClick={checkAllRankings}
              disabled={postsLoading || blogPosts.length === 0}
              className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 text-sm"
            >
              전체 확인
            </button>
          )}
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim uppercase">
                    <th className="text-left px-4 py-3 font-semibold w-10">#</th>
                    <th className="text-left px-3 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-44">검색 키워드</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">통합검색</th>
                    <th className="text-center px-3 py-3 font-semibold w-20">블로그탭</th>
                    <th className="text-center px-3 py-3 font-semibold w-16">검색량</th>
                    <th className="text-center px-4 py-3 font-semibold w-16">확인</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {blogPosts.map((post, i) => {
                    const keywords = editingKeywords[post.id] || [];
                    const rowCount = Math.max(keywords.length, 1);
                    return keywords.map((kw, kwIdx) => {
                      const key = rankKey(post.id, kw.trim());
                      const result = rankingResults[key];
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
                          <td className="text-center px-3 py-1.5">
                            {result ? (
                              result.viewTab.exposed ? (
                                <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                  {result.viewTab.rank}위
                                </span>
                              ) : <span className="text-xs text-dim">-</span>
                            ) : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className="text-center px-3 py-1.5">
                            {result ? (
                              result.blogTab.exposed ? (
                                <span className="text-xs font-bold text-up bg-up/10 px-2 py-0.5 rounded-full">
                                  {result.blogTab.rank}위
                                </span>
                              ) : <span className="text-xs text-dim">-</span>
                            ) : <span className="text-[10px] text-dim/50">--</span>}
                          </td>
                          <td className="text-center px-3 py-1.5 text-xs text-dim">
                            {result?.searchVolume ? result.searchVolume.toLocaleString() : '--'}
                          </td>
                          <td className="text-center px-4 py-1.5">
                            <button
                              onClick={() => checkSingleKeyword(post, kw)}
                              disabled={checkingKey === key || checkingAll || !kw.trim()}
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

                    {/* 키워드별 행 */}
                    <div className="space-y-1.5 pl-7">
                      {keywords.map((kw, kwIdx) => {
                        const key = rankKey(post.id, kw.trim());
                        const result = rankingResults[key];
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
                                placeholder="키워드"
                              />
                              <button
                                onClick={() => checkSingleKeyword(post, kw)}
                                disabled={checkingKey === key || checkingAll || !kw.trim()}
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
                                {result.searchVolume ? (
                                  <span className="text-[10px] text-dim">{result.searchVolume.toLocaleString()}</span>
                                ) : null}
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
