'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import NaverAiQualityPanel from '@/components/NaverAiQualityPanel';
import type { NaverAiQualityEvaluation } from '@/lib/naver-ai-quality-evaluator';

interface BloggerProfile {
  blogId: string;
  displayName: string;
}

interface BlogPost {
  id: string;
  title: string;
  url: string;
  date: string;
}

export default function NaverMateQualityEvaluateView() {
  const { user, isLoading: authLoading } = useAuth();
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [qualityResults, setQualityResults] = useState<Record<string, NaverAiQualityEvaluation>>({});
  const [evaluatingId, setEvaluatingId] = useState('');
  const [openPanelId, setOpenPanelId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // useAuth()가 이미 불러온 사용자 정보에서 도출 — AiBriefingSection.tsx와 동일 패턴
  const profile = useMemo<BloggerProfile | null>(() => {
    if (user.type === 'unified' && (user.blogId || user.id)) {
      return { blogId: (user.blogId || user.id)!, displayName: user.name || user.blogId || user.id || '' };
    }
    if (user.type === 'blogger' && user.id) {
      return { blogId: user.id, displayName: user.name || user.id };
    }
    if (user.type === 'influencer' && user.id) {
      return { blogId: (user.blogId || user.id)!, displayName: user.name || user.id };
    }
    return null;
  }, [user]);

  const fetchBlogPosts = useCallback(async (blogId: string) => {
    setPostsLoading(true);
    try {
      const res = await fetch(`/api/blog/posts?blogId=${encodeURIComponent(blogId)}&page=1&count=30`);
      if (res.ok) {
        const data = await res.json();
        setBlogPosts(data.posts || []);
      }
    } catch { /* ignore */ }
    finally { setPostsLoading(false); }
  }, []);

  useEffect(() => {
    if (profile?.blogId) fetchBlogPosts(profile.blogId);
  }, [profile?.blogId, fetchBlogPosts]);

  const handleEvaluate = useCallback(async (post: BlogPost) => {
    if (!profile) return;
    if (qualityResults[post.id]) {
      setOpenPanelId(prev => prev === post.id ? '' : post.id);
      return;
    }
    setEvaluatingId(post.id);
    setOpenPanelId(post.id);
    setErrorMessage('');
    try {
      const res = await fetch('/api/blog/quality-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, postId: post.id }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        setErrorMessage(errBody?.error || 'AI 품질평가에 실패했습니다.');
        setOpenPanelId('');
        return;
      }
      const data: NaverAiQualityEvaluation = await res.json();
      setQualityResults(prev => ({ ...prev, [post.id]: data }));
    } catch {
      setErrorMessage('네트워크 오류로 AI 품질평가를 하지 못했습니다.');
      setOpenPanelId('');
    } finally {
      setEvaluatingId('');
    }
  }, [profile, qualityResults]);

  if (authLoading) {
    return <div className="text-sm text-dim py-10 text-center">불러오는 중...</div>;
  }

  if (!profile?.blogId) {
    return <div className="text-sm text-dim py-10 text-center">블로그 연결 후 이용 가능합니다.</div>;
  }

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="text-sm text-down bg-down/10 border border-down/20 rounded-xl px-4 py-2.5">{errorMessage}</div>
      )}
      {postsLoading ? (
        <div className="text-sm text-dim py-10 text-center">포스팅 목록을 불러오는 중...</div>
      ) : blogPosts.length === 0 ? (
        <div className="text-sm text-dim py-10 text-center">분석할 포스팅이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {blogPosts.map(post => (
            <div key={post.id} className="bg-surface border border-border/30 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <a href={post.url} target="_blank" rel="noreferrer" className="text-sm font-bold hover:underline break-words">
                    {post.title}
                  </a>
                  <p className="text-xs text-dim mt-1">{post.date}</p>
                </div>
                <button
                  onClick={() => handleEvaluate(post)}
                  disabled={evaluatingId === post.id}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-down/10 text-down hover:bg-down/20 disabled:opacity-50 cursor-pointer"
                >
                  {evaluatingId === post.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-down/30 border-t-down rounded-full animate-spin inline-block" />
                      진단 중...
                    </span>
                  ) : qualityResults[post.id] ? (openPanelId === post.id ? '접기' : '결과 보기') : 'AI 정밀진단 실행'}
                </button>
              </div>
              {openPanelId === post.id && qualityResults[post.id] && (
                <div className="mt-4">
                  <NaverAiQualityPanel result={qualityResults[post.id]} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
