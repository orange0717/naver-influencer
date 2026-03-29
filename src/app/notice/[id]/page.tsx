'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const TAG_LABEL: Record<string, string> = {
  notice: '공지',
  update: '업데이트',
  event: '이벤트',
};

const TAG_COLOR: Record<string, string> = {
  notice: 'bg-accent/15 text-accent',
  update: 'bg-[#c8816b]/15 text-[#c8816b]',
  event: 'bg-[#F29C68]/15 text-[#F29C68]',
};

interface Notice {
  id: string;
  title: string;
  content: string;
  tag: string;
  author_name: string;
  view_count: number;
  comment_count: number;
  is_pinned: boolean;
  created_at: string;
}

interface Comment {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_type: string;
  created_at: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return '방금 전';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function formatFullDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [noticeId, setNoticeId] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  const getAuthHeaders = useCallback(async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    } catch { /* ignore */ }
    return headers;
  }, []);

  useEffect(() => {
    params.then(p => setNoticeId(p.id));
  }, [params]);

  useEffect(() => {
    if (!noticeId) return;
    fetch(`/api/notices/${noticeId}`)
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => {
        setNotice(data.notice);
        setComments(data.comments || []);
      })
      .catch(() => setNotice(null))
      .finally(() => setLoading(false));
  }, [noticeId]);

  const handleComment = async () => {
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/notices/${noticeId}/comments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '댓글 작성에 실패했습니다.');
        return;
      }
      const { comment } = await res.json();
      setComments(prev => [...prev, comment]);
      setCommentText('');
      if (notice) setNotice({ ...notice, comment_count: notice.comment_count + 1 });
    } catch {
      alert('댓글 작성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/notices/${noticeId}`, { method: 'DELETE', headers });
      if (res.ok) {
        router.push('/notice');
      } else {
        const data = await res.json();
        alert(data.error || '삭제에 실패했습니다.');
      }
    } catch {
      alert('삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-dim text-sm">공지를 찾을 수 없습니다.</p>
        <Link href="/notice" className="text-accent text-sm mt-4 inline-block">목록으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 상단 네비 */}
      <Link href="/notice" className="text-sm text-dim hover:text-accent transition">
        &larr; 공지사항 목록
      </Link>

      {/* 공지 본문 */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-3">
          {notice.is_pinned && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent">고정</span>
          )}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TAG_COLOR[notice.tag] || ''}`}>
            {TAG_LABEL[notice.tag] || notice.tag}
          </span>
          <span className="text-xs text-dim">{formatFullDate(notice.created_at)}</span>
        </div>

        <h1 className="text-xl font-bold mb-4">{notice.title}</h1>

        <div className="text-sm text-text leading-relaxed whitespace-pre-wrap mb-4">
          {notice.content}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-dim">
            <span>{notice.author_name}</span>
            <span>조회 {notice.view_count}</span>
            <span>댓글 {notice.comment_count}</span>
          </div>
          {user.id && (
            <button onClick={handleDelete} disabled={deleting}
              className="text-xs text-down hover:text-down/70 transition cursor-pointer disabled:opacity-50">
              삭제
            </button>
          )}
        </div>
      </div>

      {/* 댓글 섹션 */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <h3 className="font-bold text-sm mb-4">댓글 {comments.length}개</h3>

        {comments.length === 0 ? (
          <p className="text-sm text-dim py-4 text-center">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</p>
        ) : (
          <div className="space-y-4 mb-4">
            {comments.map(c => (
              <div key={c.id} className="border-b border-border/50 pb-3 last:border-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-text">{c.author_name}</span>
                  <span className="text-[11px] text-dim">{formatDate(c.created_at)}</span>
                </div>
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* 댓글 작성 폼 */}
        {user.id ? (
          <div className="flex gap-2 pt-3 border-t border-border">
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="댓글을 입력해주세요..."
              maxLength={1000}
              rows={2}
              className="flex-1 px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-none transition"
            />
            <button
              onClick={handleComment}
              disabled={!commentText.trim() || submitting}
              className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed self-end">
              {submitting ? '...' : '등록'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-dim text-center pt-3 border-t border-border">
            댓글을 작성하려면 <Link href="/auth/login" className="text-accent underline">로그인</Link>이 필요합니다.
          </p>
        )}
      </div>
    </div>
  );
}
