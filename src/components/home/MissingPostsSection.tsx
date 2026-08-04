'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';
import { filterMissing } from '@/lib/missing-rate';
import type { BloggerProfile, BlogPost } from './BlogAnalysisSection.helpers';
import { fetchWithTimeout, getProfileFromApi, CHECK_FRESH_MS } from './BlogAnalysisSection.helpers';

const PERIOD_OPTIONS = [30, 90, 120, 0] as const; // 0 = 전체
type Period = typeof PERIOD_OPTIONS[number];
const PER_PAGE = 30;
const MAX_PAGES_ALL = 20; // "전체" 선택 시 최대 600개까지 조회 (그 이상은 성능상 제한)

interface PostMissingEntry {
  blogTab: { exposed: boolean | null; rank: number | null };
  viewTab: { exposed: boolean | null; rank: number | null };
  query?: string | null;
  status?: string;
  checkedAt?: string | null;
}

function missingStatusLabel(mr?: PostMissingEntry): string {
  if (!mr) return '미확인';
  const viewExp = mr.viewTab.exposed;
  const blogExp = mr.blogTab.exposed;
  if (viewExp === false && blogExp === false) return '통합검색·블로그탭 모두 미노출';
  if (viewExp === false) return '통합검색 미노출';
  if (blogExp === false) return '블로그탭 미노출';
  return '미확인';
}

export default function MissingPostsSection() {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  const [period, setPeriod] = useState<Period>(30);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [missingResults, setMissingResults] = useState<Record<string, PostMissingEntry>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef(false);

  useEffect(() => () => { abortRef.current = true; }, []);

  useEffect(() => {
    (async () => {
      const p = await getProfileFromApi();
      setProfile(p);
    })();
  }, []);

  const fetchPosts = useCallback(async (blogId: string, limit: Period) => {
    setPostsLoading(true);
    try {
      const maxPages = limit === 0 ? MAX_PAGES_ALL : Math.ceil(limit / PER_PAGE);
      const all: BlogPost[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const res = await fetchWithTimeout(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=${page}&count=${PER_PAGE}`);
        if (!res.ok) break;
        const data = await res.json();
        const pagePosts: BlogPost[] = data.posts || [];
        all.push(...pagePosts);
        if (pagePosts.length < PER_PAGE) break; // 마지막 페이지
        if (limit !== 0 && all.length >= limit) break;
      }
      setPosts(limit === 0 ? all : all.slice(0, limit));
    } catch {
      setErrorMessage('포스트 목록을 불러오지 못했습니다.');
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const fetchMissingState = useCallback(async (blogId: string) => {
    try {
      const res = await fetchWithTimeout(`/api/my/post-missing-state?blogId=${encodeURIComponent(blogId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setMissingResults(data.results || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!profile) return;
    fetchPosts(profile.blogId, period);
    fetchMissingState(profile.blogId);
  }, [profile, period, fetchPosts, fetchMissingState]);

  const checkOne = useCallback(async (post: BlogPost): Promise<'ok' | 'failed'> => {
    if (!profile) return 'failed';
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch('/api/blog/check-missing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogId: profile.blogId, postTitle: post.title, postId: post.id }),
        });
        if (res.ok) {
          const data = await res.json();
          setMissingResults(prev => ({ ...prev, [post.id]: { ...data, status: 'ok', checkedAt: new Date().toISOString() } }));
          return 'ok';
        }
      } catch { /* 재시도 */ }
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 800 * attempt));
    }
    return 'failed';
  }, [profile]);

  const checkAll = async () => {
    if (!profile || posts.length === 0) return;
    setCheckingAll(true);
    abortRef.current = false;
    setCheckProgress({ current: 0, total: posts.length });
    const now = Date.now();
    for (let i = 0; i < posts.length; i++) {
      if (abortRef.current) break;
      const post = posts[i];
      const existing = missingResults[post.id];
      const isFresh = existing?.status === 'ok' && !!existing.checkedAt
        && (now - new Date(existing.checkedAt).getTime()) < CHECK_FRESH_MS;
      if (!isFresh) {
        await checkOne(post);
        if (i < posts.length - 1) await new Promise(r => setTimeout(r, 2000));
      }
      setCheckProgress({ current: i + 1, total: posts.length });
    }
    setCheckingAll(false);
  };

  const missingList = useMemo(() => filterMissing(posts, missingResults), [posts, missingResults]);
  const uncheckedCount = useMemo(() => posts.filter(p => !missingResults[p.id]).length, [posts, missingResults]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold">미노출</h2>
          <p className="text-xs text-dim mt-1">선택한 기간 내 포스팅 중 통합검색·블로그탭에서 미노출된 글만 표시합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-[11px]">
            {PERIOD_OPTIONS.map(n => (
              <button key={n} onClick={() => setPeriod(n)}
                className={`px-3 py-1.5 font-semibold transition cursor-pointer ${period === n ? 'bg-accent text-white' : 'text-dim hover:bg-surface-hover'}`}>
                {n === 0 ? '전체' : `${n}개`}
              </button>
            ))}
          </div>
          <button onClick={checkAll} disabled={checkingAll || posts.length === 0}
            className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0">
            {checkingAll ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {checkProgress.current}/{checkProgress.total}
              </span>
            ) : uncheckedCount > 0 ? `미확인 ${uncheckedCount}개 검사` : '다시 검사'}
          </button>
        </div>
      </div>

      {errorMessage && <p className="text-xs text-down">{errorMessage}</p>}

      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
          <h3 className="font-bold text-[15px]">미노출 포스팅</h3>
          <span className="text-xs text-dim">{postsLoading ? '불러오는 중...' : `${missingList.length}개`}</span>
        </div>

        {postsLoading ? (
          <div className="flex items-center justify-center py-10 text-dim text-sm">
            <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
            포스트를 불러오는 중...
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">포스트가 없습니다.</div>
        ) : missingList.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">
            {uncheckedCount > 0 ? '아직 검사하지 않은 포스팅이 있습니다. "미확인 검사"를 눌러 확인하세요.' : '미노출된 포스팅이 없습니다.'}
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-left px-5 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-32">대표 키워드</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">발행일</th>
                    <th className="text-left px-3 py-3 font-semibold w-56">미노출 상태</th>
                    <th className="text-center px-5 py-3 font-semibold w-16">보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {missingList.map(post => {
                    const mr = missingResults[post.id];
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition">
                        <td className="px-5 py-3.5">
                          <span className="font-semibold truncate block max-w-[400px]" title={post.title}>{post.title}</span>
                        </td>
                        <td className="px-3 py-3.5 text-dim">{mr?.query || '—'}</td>
                        <td className="px-3 py-3.5 text-right text-dim text-xs">{post.date}</td>
                        <td className="px-3 py-3.5">
                          <span className="text-xs font-bold text-down bg-down/10 px-2 py-0.5 rounded-full">{missingStatusLabel(mr)}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {missingList.map(post => {
                const mr = missingResults[post.id];
                return (
                  <div key={post.id} className="p-4 space-y-2">
                    <p className="font-semibold text-sm truncate" title={post.title}>{post.title}</p>
                    <div className="flex items-center justify-between text-xs text-dim">
                      <span>{mr?.query || '대표 키워드 —'}</span>
                      <span>{post.date}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-down bg-down/10 px-2 py-0.5 rounded-full">{missingStatusLabel(mr)}</span>
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}
