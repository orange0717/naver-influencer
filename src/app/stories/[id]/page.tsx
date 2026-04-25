'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface Story {
  id: string;
  title: string;
  content: string;
  short_excerpt: string | null;
  author_id: string;
  author_name: string;
  is_anonymous: boolean;
  metric_before: string | null;
  metric_after: string | null;
  period: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  status: string;
  reject_reason: string | null;
  images: string[] | null;
  created_at: string;
}

interface Comment {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function StoryDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const [story, setStory] = useState<Story | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [lightbox, setLightbox] = useState<string | null>(null);

  const fetchStory = useCallback(() => {
    if (!params?.id) return;
    fetch(`/api/stories/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setStory(data.story);
          setComments(data.comments || []);
          setLiked(!!data.liked);
        }
      })
      .catch(() => setError('후기를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, [params?.id]);

  useEffect(() => {
    fetchStory();
  }, [fetchStory]);

  async function handleToggleLike() {
    if (!user.id) {
      alert('로그인이 필요합니다.');
      return;
    }
    if (!story || likeBusy) return;
    setLikeBusy(true);
    try {
      const res = await fetch(`/api/stories/${story.id}/like`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '좋아요에 실패했습니다.');
      setLiked(!!data.liked);
      setStory((prev) => (prev ? { ...prev, like_count: data.like_count } : prev));
    } catch (err) {
      alert(err instanceof Error ? err.message : '좋아요에 실패했습니다.');
    } finally {
      setLikeBusy(false);
    }
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!user.id) {
      alert('로그인이 필요합니다.');
      return;
    }
    if (!story || commentSubmitting) return;
    const trimmed = commentText.trim();
    if (trimmed.length < 1) return;

    setCommentSubmitting(true);
    try {
      const res = await fetch(`/api/stories/${story.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '댓글 작성 실패');
      setComments((prev) => [...prev, data.comment]);
      setStory((prev) =>
        prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev,
      );
      setCommentText('');
    } catch (err) {
      alert(err instanceof Error ? err.message : '댓글 작성 실패');
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;
    if (!story) return;
    try {
      const res = await fetch(`/api/stories/${story.id}/comments/${commentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '삭제 실패');
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setStory((prev) =>
        prev ? { ...prev, comment_count: Math.max((prev.comment_count || 1) - 1, 0) } : prev,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 실패');
    }
  }

  if (loading) {
    return (
      <div className="text-center py-20">
        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <p className="text-dim mb-4">{error || '후기를 찾을 수 없습니다.'}</p>
        <Link href="/stories" className="text-accent hover:underline">
          목록으로
        </Link>
      </div>
    );
  }

  const isPending = story.status === 'pending';
  const isRejected = story.status === 'rejected';
  const isApproved = story.status === 'approved';
  const images = Array.isArray(story.images) ? story.images : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/stories" className="text-sm text-dim hover:text-accent">
          ← 목록으로
        </Link>
      </div>

      {isPending && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-4 text-sm">
          이 후기는 아직 관리자 승인 대기 중입니다.
        </div>
      )}
      {isRejected && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          이 후기는 반려되었습니다.
          {story.reject_reason && <div className="mt-1">사유: {story.reject_reason}</div>}
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
        <h1 className="text-2xl font-bold">{story.title}</h1>
        <div className="flex items-center gap-3 text-sm text-dim">
          <span>{story.author_name}</span>
          <span>·</span>
          <span>{formatDateTime(story.created_at)}</span>
          <span>·</span>
          <span>조회 {story.view_count}</span>
        </div>

        {(story.metric_before || story.metric_after) && (
          <div className="flex items-center gap-2 p-4 bg-accent/5 rounded-lg">
            {story.metric_before && (
              <span className="px-3 py-1 rounded bg-border/40 text-sm">{story.metric_before}</span>
            )}
            <span className="text-accent text-lg">→</span>
            {story.metric_after && (
              <span className="px-3 py-1 rounded bg-accent/15 text-accent font-semibold text-sm">
                {story.metric_after}
              </span>
            )}
            {story.period && <span className="text-dim text-sm">({story.period})</span>}
          </div>
        )}

        <div className="whitespace-pre-wrap text-[15px] leading-relaxed pt-2 border-t border-border">
          {story.content}
        </div>

        {images.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
            {images.map((url, idx) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={idx}
                src={url}
                alt={`첨부 이미지 ${idx + 1}`}
                onClick={() => setLightbox(url)}
                className="w-full h-32 object-cover rounded-lg border border-border cursor-zoom-in hover:opacity-90 transition"
              />
            ))}
          </div>
        )}

        {isApproved && (
          <div className="flex items-center justify-center pt-4 border-t border-border">
            <button
              type="button"
              onClick={handleToggleLike}
              disabled={likeBusy}
              className={`flex items-center gap-2 px-5 py-2 rounded-full border transition disabled:opacity-50 ${
                liked
                  ? 'bg-accent/15 border-accent text-accent'
                  : 'border-border hover:border-accent hover:text-accent'
              }`}
            >
              <span>{liked ? '♥' : '♡'}</span>
              <span className="font-semibold">좋아요 {story.like_count}</span>
            </button>
          </div>
        )}
      </div>

      {isApproved && (
        <div className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-base font-bold">댓글 {story.comment_count || 0}</h2>

          <form onSubmit={handleSubmitComment} className="space-y-2">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={user.id ? '응원의 한마디를 남겨주세요.' : '로그인 후 댓글을 작성할 수 있어요.'}
              rows={3}
              maxLength={1000}
              disabled={!user.id || commentSubmitting}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg focus:border-accent outline-none resize-y disabled:opacity-60"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!user.id || commentSubmitting || commentText.trim().length === 0}
                className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition disabled:opacity-50"
              >
                {commentSubmitting ? '등록 중...' : '댓글 등록'}
              </button>
            </div>
          </form>

          <ul className="divide-y divide-border">
            {comments.length === 0 && (
              <li className="text-sm text-dim py-4 text-center">아직 댓글이 없습니다.</li>
            )}
            {comments.map((c) => (
              <li key={c.id} className="py-3 space-y-1">
                <div className="flex items-center justify-between text-xs text-dim">
                  <span className="font-semibold text-text">{c.author_name}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatDateTime(c.created_at)}</span>
                    {user.id && c.author_id === user.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteComment(c.id)}
                        className="text-dim hover:text-red-500"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.content}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="첨부 이미지" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
