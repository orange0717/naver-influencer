'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

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

interface PostDetail {
  id: string;
  category: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  author_type: 'blogger' | 'influencer' | 'admin';
  view_count: number;
  like_count: number;
  created_at: string;
  updated_at: string;
}

interface Comment {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_type: 'blogger' | 'influencer' | 'admin';
  created_at: string;
}

export default function CommunityPostPage() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;

  const [post, setPost] = useState<PostDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [liked, setLiked] = useState(false);
  const [user, setUser] = useState<{ type: string; id: string; name: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.id) setUser({ type: data.type, id: data.id, name: data.name });
      })
      .catch(() => {});
  }, []);

  const fetchPost = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/community/${postId}`);
      if (!res.ok) {
        router.push('/community');
        return;
      }
      const data = await res.json();
      setPost(data.post);
      setComments(data.comments || []);
    } catch {
      router.push('/community');
    } finally {
      setLoading(false);
    }
  }, [postId, router]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  // 좋아요 로컬 체크
  useEffect(() => {
    const likedPosts = JSON.parse(localStorage.getItem('liked_posts') || '[]');
    setLiked(likedPosts.includes(postId));
  }, [postId]);

  const handleLike = async () => {
    if (liked || !user) return;
    try {
      const res = await fetch(`/api/community/${postId}/like`, { method: 'POST' });
      if (res.ok) {
        setLiked(true);
        const likedPosts = JSON.parse(localStorage.getItem('liked_posts') || '[]');
        likedPosts.push(postId);
        localStorage.setItem('liked_posts', JSON.stringify(likedPosts));
        setPost(prev => prev ? { ...prev, like_count: prev.like_count + 1 } : null);
      }
    } catch { /* ignore */ }
  };

  const handleComment = async () => {
    if (!newComment.trim() || !user) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/community/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newComment.trim(),
          author_id: user.id,
          author_type: user.type,
          author_name: user.name || user.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(prev => [...prev, data.comment]);
        setNewComment('');
      }
    } catch { /* ignore */ }
    finally { setSubmittingComment(false); }
  };

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/community/${postId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author_id: user?.id }),
      });
      if (res.ok) router.push('/community');
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center text-dim text-sm">
        <div className="inline-block w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
        <p>불러오는 중...</p>
      </div>
    );
  }

  if (!post) return null;

  const isAuthor = user?.id === post.author_id;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 상단 네비 */}
      <div className="flex items-center justify-between pt-4">
        <Link href="/community" className="text-sm text-dim hover:text-text transition flex items-center gap-1">
          ← 목록으로
        </Link>
      </div>

      {/* 게시글 */}
      <article className="bg-surface rounded-2xl border border-border overflow-hidden">
        {/* 헤더 */}
        <div className="px-6 py-5 border-b border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              CATEGORY_COLORS[post.category] || 'bg-gray-100 text-gray-600'
            }`}>
              {CATEGORY_LABELS[post.category] || post.category}
            </span>
          </div>
          <h1 className="text-lg md:text-xl font-extrabold text-text mb-3">{post.title}</h1>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-dim">
              <span className="flex items-center gap-1">
                <span className={`inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                  post.author_type === 'blogger' ? 'bg-[#2DB400]/15 text-[#2DB400]'
                    : post.author_type === 'admin' ? 'bg-accent/10 text-accent'
                    : 'bg-purple-100 text-purple-600'
                }`}>
                  {post.author_type === 'blogger' ? '블로거' : post.author_type === 'admin' ? '관리자' : '인플루언서'}
                </span>
                {post.author_name}
              </span>
              <span>{formatDate(post.created_at)}</span>
              <span>조회 {post.view_count}</span>
            </div>
            {isAuthor && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-dim hover:text-red-500 transition cursor-pointer">
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            )}
          </div>
        </div>

        {/* 본문 */}
        <div className="px-6 py-6">
          <div className="text-sm text-text leading-relaxed whitespace-pre-wrap">
            {post.content}
          </div>
        </div>

        {/* 좋아요 */}
        <div className="px-6 pb-5 flex justify-center">
          <button
            onClick={handleLike}
            disabled={liked || !user}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition cursor-pointer ${
              liked
                ? 'bg-red-50 text-red-500 border border-red-200'
                : 'bg-bg border border-border text-dim hover:text-red-500 hover:border-red-200'
            }`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
              <path d="M8 14s-5.5-3.5-5.5-7.5C2.5 4 4 2.5 5.5 2.5c1 0 2 .5 2.5 1.5.5-1 1.5-1.5 2.5-1.5C12 2.5 13.5 4 13.5 6.5 13.5 10.5 8 14 8 14z"/>
            </svg>
            좋아요 {post.like_count > 0 && post.like_count}
          </button>
        </div>
      </article>

      {/* 댓글 섹션 */}
      <div className="bg-surface rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border/50">
          <h2 className="text-sm font-bold text-text">댓글 {comments.length > 0 && `(${comments.length})`}</h2>
        </div>

        {/* 댓글 목록 */}
        {comments.length > 0 && (
          <div className="divide-y divide-border/50">
            {comments.map(comment => (
              <div key={comment.id} className="px-6 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    comment.author_type === 'blogger' ? 'bg-[#2DB400]/15 text-[#2DB400]'
                      : comment.author_type === 'admin' ? 'bg-accent/10 text-accent'
                      : 'bg-purple-100 text-purple-600'
                  }`}>
                    {comment.author_type === 'blogger' ? '블로거' : comment.author_type === 'admin' ? '관리자' : '인플루언서'}
                  </span>
                  <span className="text-xs font-semibold text-text">{comment.author_name}</span>
                  <span className="text-xs text-dim">{formatDate(comment.created_at)}</span>
                </div>
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{comment.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* 댓글 작성 */}
        {user ? (
          <div className="px-6 py-4 border-t border-border/50 bg-bg/30">
            <div className="flex gap-3">
              <textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="댓글을 입력하세요"
                rows={2}
                maxLength={1000}
                className="flex-1 px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-accent transition resize-none"
              />
              <button
                onClick={handleComment}
                disabled={submittingComment || !newComment.trim()}
                className="self-end px-4 py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover transition disabled:opacity-50 cursor-pointer disabled:cursor-default shrink-0">
                {submittingComment ? '...' : '등록'}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-border/50 bg-bg/30 text-center">
            <Link href="/auth/login" className="text-sm text-accent hover:underline">
              로그인 후 댓글을 작성할 수 있습니다
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
