'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';

/* ── 카테고리 ── */
const CATEGORIES = [
  { value: '', label: '전체' },
  { value: 'free', label: '자유게시판' },
  { value: 'tip', label: '블로그 꿀팁' },
  { value: 'review', label: '체험단/협찬' },
  { value: 'qna', label: 'Q&A' },
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  free: '자유게시판',
  tip: '블로그 꿀팁',
  review: '체험단/협찬',
  qna: 'Q&A',
};

const CATEGORY_COLORS: Record<string, string> = {
  free: 'bg-blue-100 text-blue-700',
  tip: 'bg-green-100 text-green-700',
  review: 'bg-purple-100 text-purple-700',
  qna: 'bg-amber-100 text-amber-700',
};

interface Post {
  id: string;
  category: string;
  title: string;
  author_name: string;
  author_type: 'blogger' | 'influencer' | 'admin';
  view_count: number;
  comment_count: number;
  like_count: number;
  created_at: string;
  is_pinned?: boolean;
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        setIsLoggedIn(!!data.id);
        if (data.id) {
          fetch('/api/chat/unread-count')
            .then(r => r.json())
            .then(d => setUnreadChat(d.count || 0))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (category) params.set('category', category);
      const res = await fetch(`/api/community?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      // 에러 시 빈 목록
    } finally {
      setLoading(false);
    }
  }, [category, page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHour < 24) return `${diffHour}시간 전`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 min-h-[calc(100vh-10rem)]">
      {/* 헤더 */}
      <div className="flex items-center justify-between pt-4">
        <div>
          <p className="text-xs text-accent font-semibold tracking-widest mb-2">COMMUNITY</p>
          <h1 className="font-title text-2xl md:text-3xl font-extrabold text-text">
            커뮤니티
          </h1>
          <p className="text-sm text-dim mt-1">네이버 인플루언서들의 소통 공간</p>
        </div>
        {isLoggedIn && (
          <Link href="/community/write"
            className="px-4 py-2.5 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover transition">
            글쓰기
          </Link>
        )}
      </div>

      {/* 실시간 채팅방 진입 배너 (로그인 사용자만) */}
      {isLoggedIn && (
        <Link
          href="/community/chat"
          className="block bg-gradient-to-r from-accent/15 to-accent/5 border border-accent/30 rounded-2xl p-4 hover:border-accent transition group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-text flex items-center gap-2">
                실시간 채팅방
                {unreadChat > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold bg-down text-white rounded-full">
                    {unreadChat >= 99 ? '99+' : unreadChat}
                  </span>
                )}
              </p>
              <p className="text-xs text-dim mt-0.5">회원끼리 실시간으로 대화해보세요</p>
            </div>
            <span className="text-xs text-accent font-bold group-hover:translate-x-1 transition">입장 →</span>
          </div>
        </Link>
      )}

      {/* 카테고리 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => { setCategory(cat.value); setPage(1); }}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition cursor-pointer ${
              category === cat.value
                ? 'bg-accent text-white'
                : 'bg-surface border border-border text-dim hover:text-text hover:border-accent/30'
            }`}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* 게시글 목록 */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-dim text-sm">
            <div className="inline-block w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
            <p>불러오는 중...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="py-32 text-center text-dim text-sm">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p className="font-semibold text-base text-text mb-1">아직 게시글이 없습니다</p>
            <p>첫 번째 글을 작성해보세요!</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {posts.map(post => (
              <Link
                key={post.id}
                href={`/community/${post.id}`}
                className="flex items-start gap-3 px-4 sm:px-6 py-4 hover:bg-surface-hover transition group"
              >
                {/* 카테고리 뱃지 */}
                <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  CATEGORY_COLORS[post.category] || 'bg-gray-100 text-gray-600'
                }`}>
                  {CATEGORY_LABELS[post.category] || post.category}
                </span>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {post.is_pinned && (
                      <span className="text-[10px] text-accent font-bold bg-accent/10 px-1.5 py-0.5 rounded">공지</span>
                    )}
                    <h3 className="text-sm font-semibold text-text group-hover:text-accent transition truncate">
                      {post.title}
                    </h3>
                    {post.comment_count > 0 && (
                      <span className="text-xs text-accent font-bold">[{post.comment_count}]</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-dim">
                    <span className="flex items-center gap-1">
                      {post.author_type === 'admin' ? '[관리자] ' : post.author_type === 'influencer' ? '[인플] ' : ''}
                      {post.author_name}
                    </span>
                    <span>{formatDate(post.created_at)}</span>
                    <span className="flex items-center gap-0.5">
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
                        <path d="M8 3C4.5 3 1.7 5.1 0.5 8c1.2 2.9 4 5 7.5 5s6.3-2.1 7.5-5c-1.2-2.9-4-5-7.5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5S6.1 4.5 8 4.5s3.5 1.6 3.5 3.5S9.9 11.5 8 11.5zM8 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                      </svg>
                      {post.view_count}
                    </span>
                    {post.like_count > 0 && (
                      <span className="flex items-center gap-0.5">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-red-400">
                          <path d="M8 14s-5.5-3.5-5.5-7.5C2.5 4 4 2.5 5.5 2.5c1 0 2 .5 2.5 1.5.5-1 1.5-1.5 2.5-1.5C12 2.5 13.5 4 13.5 6.5 13.5 10.5 8 14 8 14z"/>
                        </svg>
                        {post.like_count}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-dim hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default">
            이전
          </button>
          <span className="px-3 py-1.5 text-sm text-dim">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg border border-border text-dim hover:text-text disabled:opacity-30 cursor-pointer disabled:cursor-default">
            다음
          </button>
        </div>
      )}
    </div>
  );
}
