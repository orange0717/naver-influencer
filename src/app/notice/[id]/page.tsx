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
  notice: 'bg-[#c8816b]/15 text-[#c8816b]',
  update: 'bg-[#8b5e4b]/15 text-[#8b5e4b]',
  event: 'bg-[#d4956e]/15 text-[#d4956e]',
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
        <span className="w-6 h-6 border-2 border-[#c8816b]/30 border-t-[#c8816b] rounded-full animate-spin inline-block" />
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-dim text-sm">공지를 찾을 수 없습니다.</p>
        <Link href="/notice" className="text-[#c8816b] text-sm mt-4 inline-block hover:underline">목록으로 돌아가기</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* 상단 네비 */}
      <Link href="/notice" className="inline-flex items-center gap-1.5 text-sm text-dim hover:text-[#c8816b] transition mb-6">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        공지사항 목록
      </Link>

      {/* 공지 헤더 */}
      <div className="bg-gradient-to-r from-[#3d2020] to-[#4a2828] rounded-2xl px-8 py-7 mb-6">
        <div className="flex items-center gap-2 mb-3">
          {notice.is_pinned && (
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#c8816b] text-white">고정</span>
          )}
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${TAG_COLOR[notice.tag] || 'bg-white/10 text-white/60'}`}>
            {TAG_LABEL[notice.tag] || notice.tag}
          </span>
        </div>
        <h1 className="text-xl font-bold text-[#f5d5c8] mb-3">{notice.title}</h1>
        <div className="flex items-center gap-4 text-xs text-[#c8816b]">
          <span className="font-medium">{notice.author_name}</span>
          <span>{formatFullDate(notice.created_at)}</span>
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {notice.view_count}
          </span>
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {notice.comment_count}
          </span>
        </div>
      </div>

      {/* 공지 본문 */}
      <div className="bg-surface rounded-2xl border border-border px-8 py-8 mb-6">
        <div className="text-sm text-text leading-relaxed whitespace-pre-wrap">
          {notice.content}
        </div>

        {/* 삭제 버튼 */}
        {user.id && (
          <div className="mt-8 pt-4 border-t border-border flex justify-end">
            <button onClick={handleDelete} disabled={deleting}
              className="text-xs text-down hover:text-down/70 transition cursor-pointer disabled:opacity-50">
              삭제
            </button>
          </div>
        )}
      </div>

      {/* 댓글 섹션 */}
      <div className="bg-surface rounded-2xl border border-border px-8 py-6">
        <h3 className="font-bold text-sm text-text mb-4 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#c8816b]"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          댓글 {comments.length}개
        </h3>

        {comments.length === 0 ? (
          <p className="text-sm text-dim py-6 text-center">아직 댓글이 없습니다. 첫 댓글을 남겨보세요!</p>
        ) : (
          <div className="space-y-4 mb-4">
            {comments.map(c => (
              <div key={c.id} className="border-b border-border/50 pb-3 last:border-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 bg-[#c8816b]/15 rounded-full flex items-center justify-center text-[10px] font-bold text-[#c8816b]">
                    {c.author_name.charAt(0)}
                  </span>
                  <span className="text-xs font-semibold text-text">{c.author_name}</span>
                  <span className="text-[11px] text-dim">{formatDate(c.created_at)}</span>
                </div>
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap pl-8">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* 댓글 작성 폼 */}
        {user.id ? (
          <div className="flex gap-2 pt-4 border-t border-border">
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="댓글을 입력해주세요..."
              maxLength={1000}
              rows={2}
              className="flex-1 px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-[#c8816b] focus:ring-1 focus:ring-[#c8816b]/30 resize-none transition"
            />
            <button
              onClick={handleComment}
              disabled={!commentText.trim() || submitting}
              className="px-5 py-2 bg-[#c8816b] text-white text-sm font-semibold rounded-xl hover:bg-[#b5725e] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed self-end shadow-sm">
              {submitting ? '...' : '등록'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-dim text-center pt-4 border-t border-border">
            댓글을 작성하려면 <Link href="/auth/login" className="text-[#c8816b] font-semibold hover:underline">로그인</Link>이 필요합니다.
          </p>
        )}
      </div>
    </div>
  );
}
