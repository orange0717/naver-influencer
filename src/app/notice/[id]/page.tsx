'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { getVoterFingerprint } from '@/lib/voter-fingerprint';

const TAG_LABEL: Record<string, string> = {
  notice: '공지',
  update: '업데이트',
  event: '이벤트',
};

const TAG_COLOR: Record<string, string> = {
  notice: 'bg-accent/15 text-accent',
  update: 'bg-accent2/25 text-text-2',
  event: 'bg-gold/15 text-gold',
};

interface Notice {
  id: string;
  title: string;
  content: string;
  tag: string;
  author_name: string;
  view_count: number;
  comment_count: number;
  like_count: number;
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

interface PollOption {
  id: string;
  label: string;
  sort_order: number;
  vote_count: number | null; // 관리자만 실제 숫자, 일반은 null
}

interface PollVoter {
  user_email?: string;
  anon_label?: string;
}

interface Poll {
  id: string;
  question: string;
  is_multiple: boolean;
  options: PollOption[];
  my_vote: string[];
  results_hidden: boolean;
  voters?: Record<string, PollVoter[]>; // 관리자만
  total_votes?: number; // 관리자만
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
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likeLoading, setLikeLoading] = useState(false);
  const [poll, setPoll] = useState<Poll | null>(null);
  const [pollSelections, setPollSelections] = useState<string[]>([]);
  const [voting, setVoting] = useState(false);
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

    // sessionStorage로 세션당 1회만 조회수 증가
    const viewedKey = `notice_viewed_${noticeId}`;
    const isFirstView = !sessionStorage.getItem(viewedKey);
    const headers: Record<string, string> = {};
    if (isFirstView) {
      headers['X-Count-View'] = '1';
    }

    // 인증 토큰 + 비회원 fingerprint를 헤더에 포함해서 요청
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      } catch { /* ignore */ }
      const fp = getVoterFingerprint();
      if (fp) headers['X-Voter-Fp'] = fp;

      fetch(`/api/notices/${noticeId}`, { headers })
        .then(r => {
          if (!r.ok) throw new Error();
          if (isFirstView) sessionStorage.setItem(viewedKey, '1');
          return r.json();
        })
        .then(data => {
          setNotice(data.notice);
          setComments(data.comments || []);
          setLikeCount(data.notice.like_count || 0);
          if (data.poll) {
            setPoll(data.poll);
            setPollSelections(data.poll.my_vote || []);
          }
        })
        .catch(() => setNotice(null))
        .finally(() => setLoading(false));
    })();
  }, [noticeId]);

  // 좋아요 상태 체크
  useEffect(() => {
    if (!noticeId || !user.id) return;
    fetch(`/api/notices/${noticeId}/like`)
      .then(r => r.json())
      .then(data => {
        setLiked(data.liked);
        if (data.like_count !== undefined) setLikeCount(data.like_count);
      })
      .catch(() => {});
  }, [noticeId, user.id]);

  // 진입 시 해당 공지의 미확인 new_notice 알림 자동 읽음 처리
  useEffect(() => {
    if (!noticeId) return;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        await fetch('/api/notifications/read', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ notice_id: noticeId }),
        });
      } catch { /* ignore */ }
    })();
  }, [noticeId, getAuthHeaders]);

  const handleLike = async () => {
    if (!user.id || likeLoading) return;
    setLikeLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/notices/${noticeId}/like`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount(data.like_count);
      }
    } catch { /* ignore */ }
    finally {
      setLikeLoading(false);
    }
  };

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

  const toggleSelection = (optionId: string) => {
    if (!poll) return;
    if (poll.is_multiple) {
      setPollSelections(prev => prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]);
    } else {
      setPollSelections([optionId]);
    }
  };

  const handleVote = async () => {
    if (!poll || pollSelections.length === 0 || voting) return;
    setVoting(true);
    try {
      const headers = await getAuthHeaders();
      const fp = getVoterFingerprint();
      const res = await fetch(`/api/notices/${noticeId}/poll/vote`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ option_ids: pollSelections, voter_fingerprint: fp }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '투표에 실패했습니다.');
        return;
      }
      // 투표 후 최신 데이터 다시 조회 (관리자면 결과 포함)
      const reloadHeaders: Record<string, string> = { ...headers };
      if (fp) reloadHeaders['X-Voter-Fp'] = fp;
      const r = await fetch(`/api/notices/${noticeId}`, { headers: reloadHeaders });
      if (r.ok) {
        const data = await r.json();
        if (data.poll) {
          setPoll(data.poll);
          setPollSelections(data.poll.my_vote || []);
        }
      }
    } catch {
      alert('투표에 실패했습니다.');
    } finally {
      setVoting(false);
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

        <h1 className="type-page-title mb-4">{notice.title}</h1>

        <div className="text-sm text-text leading-relaxed whitespace-pre-wrap mb-4">
          {notice.content}
        </div>

        {/* 투표 위젯 */}
        {poll && (
          <div className="mt-4 mb-4 p-4 rounded-xl border border-border bg-bg/60">
            <div className="flex items-start gap-2 mb-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent shrink-0 mt-0.5">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-bold text-text mb-0.5">{poll.question}</p>
                <p className="text-[11px] text-dim">
                  {poll.is_multiple ? '복수 선택 가능' : '1개 선택'}
                  {poll.my_vote.length > 0 && ' · 이미 참여하셨습니다 (재투표 가능)'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {poll.options.map((opt) => {
                const selected = pollSelections.includes(opt.id);
                const isAdminView = !poll.results_hidden && opt.vote_count !== null;
                const totalForBar = isAdminView && poll.total_votes
                  ? poll.total_votes
                  : 0;
                const pct = totalForBar > 0 && opt.vote_count !== null
                  ? Math.round(((opt.vote_count || 0) / totalForBar) * 100)
                  : 0;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleSelection(opt.id)}
                    disabled={voting}
                    className={`w-full relative px-3 py-2.5 rounded-lg border text-left text-sm transition cursor-pointer overflow-hidden ${
                      selected
                        ? 'border-accent bg-accent/10 text-accent font-bold'
                        : 'border-border bg-surface text-text hover:border-accent/40'
                    }`}
                  >
                    {isAdminView && (
                      <div
                        className="absolute inset-y-0 left-0 bg-accent/10 pointer-events-none"
                        style={{ width: `${pct}%` }}
                      />
                    )}
                    <span className="relative flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full border ${
                          selected ? 'border-accent bg-accent' : 'border-border'
                        }`}>
                          {selected && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                              <path d="M5 12l5 5L20 7" />
                            </svg>
                          )}
                        </span>
                        {opt.label}
                      </span>
                      {isAdminView && (
                        <span className="text-[11px] font-bold text-accent">
                          {opt.vote_count ?? 0}표 ({pct}%)
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between mt-3 gap-2">
              {poll.results_hidden ? (
                <p className="text-[11px] text-dim">
                  {poll.my_vote.length > 0
                    ? '투표해주셔서 감사합니다. 결과는 공개되지 않습니다.'
                    : '결과는 공개되지 않는 비공개 투표입니다.'}
                </p>
              ) : (
                <p className="text-[11px] text-dim">
                  총 {poll.total_votes || 0}명 참여 · 관리자 뷰
                </p>
              )}
              <button
                type="button"
                onClick={handleVote}
                disabled={voting || pollSelections.length === 0}
                className="px-4 py-1.5 text-xs font-bold bg-accent text-white rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {voting ? '제출 중...' : (poll.my_vote.length > 0 ? '다시 투표' : '투표하기')}
              </button>
            </div>

            {/* 관리자 전용: 투표자 목록 */}
            {!poll.results_hidden && poll.voters && (
              <div className="mt-4 pt-3 border-t border-border space-y-2">
                <p className="text-[11px] font-bold text-dim">투표자 목록 (관리자 전용)</p>
                {poll.options.map(opt => (
                  <div key={opt.id} className="text-[11px]">
                    <p className="text-dim mb-1">
                      <span className="font-semibold text-text">{opt.label}</span>
                      {' '}
                      — {(poll.voters?.[opt.id] || []).length}명
                    </p>
                    {(poll.voters?.[opt.id] || []).length > 0 && (
                      <div className="flex flex-wrap gap-1 pl-2">
                        {(poll.voters?.[opt.id] || []).map((v, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-bg border border-border text-dim">
                            {v.user_email || v.anon_label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-dim">
            <span>{notice.author_name}</span>
            <span>조회 {notice.view_count}</span>
            <button
              onClick={handleLike}
              disabled={!user.id || likeLoading}
              className={`flex items-center gap-1 transition cursor-pointer disabled:cursor-default ${
                liked ? 'text-accent' : 'hover:text-accent'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
              {likeCount}
            </button>
            <span>댓글 {notice.comment_count}</span>
          </div>
          {user.id && (
            <div className="flex items-center gap-2">
              <Link href={`/notice/${noticeId}/edit`}
                className="text-xs text-accent hover:text-accent/70 transition">
                수정
              </Link>
              <button onClick={handleDelete} disabled={deleting}
                className="text-xs text-down hover:text-down/70 transition cursor-pointer disabled:opacity-50">
                삭제
              </button>
            </div>
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
