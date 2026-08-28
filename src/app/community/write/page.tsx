'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';

const CATEGORIES = [
  { value: 'free', label: '자유게시판' },
  { value: 'tip', label: '블로그 꿀팁' },
  { value: 'review', label: '체험단/협찬' },
  { value: 'qna', label: 'Q&A' },
] as const;

export default function CommunityWritePage() {
  const router = useRouter();
  const [category, setCategory] = useState('free');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState<{ type: string; id: string; name: string | null } | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  useEffect(() => {
    // ⚠️ 예전엔 res.ok 검사가 없어서 500 의 {error} 바디도 "로그인 안 됨"으로 취급됐고,
    // .catch(네트워크 끊김)까지 로그인 화면으로 튕겼다. **확인 못 한 것과 비로그인은 다르다.**
    // 멀쩡히 로그인한 사람에게 "회원 전용입니다"라고 거짓말하면 안 되므로 실패는 실패로 보여준다.
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        if (data.id) {
          setUser({ type: data.type, id: data.id, name: data.name });
        } else {
          // 확실히 비로그인일 때만 튕긴다. 목적지를 붙여야 로그인 후 글쓰기 화면으로 돌아온다.
          // 회원 전용 모달(가입/로그인 둘 다)로 통일(2026-08-28 오렌지 승인 "C를 B로 합치기").
          router.push(`/?memberOnly=1&redirect=${encodeURIComponent('/community/write')}`);
        }
      })
      .catch(() => setAuthFailed(true));
  }, [router, reloadKey]);

  const handleSubmit = async () => {
    if (!title.trim()) { setError('제목을 입력해주세요.'); return; }
    if (!content.trim()) { setError('내용을 입력해주세요.'); return; }
    if (title.trim().length < 2) { setError('제목을 2자 이상 입력해주세요.'); return; }
    if (content.trim().length < 5) { setError('내용을 5자 이상 입력해주세요.'); return; }

    if (pollEnabled) {
      const validOptions = pollOptions.filter(o => o.trim());
      if (!pollQuestion.trim()) { setError('투표 질문을 입력해주세요.'); return; }
      if (validOptions.length < 2) { setError('투표 선택지를 2개 이상 입력해주세요.'); return; }
    }

    setSubmitting(true);
    setError('');

    try {
      const payload: Record<string, unknown> = {
        category,
        title: title.trim(),
        content: content.trim(),
        author_id: user?.id,
        author_type: user?.type,
        author_name: user?.name || user?.id,
      };

      if (pollEnabled && pollQuestion.trim()) {
        payload.poll = {
          question: pollQuestion.trim(),
          options: pollOptions.filter(o => o.trim()).map(o => ({ label: o.trim() })),
          is_multiple: false,
        };
      }

      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '글 작성에 실패했습니다.');
      }

      const data = await res.json();
      router.push(`/community/${data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '글 작성에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authFailed) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center space-y-3">
        <p className="text-text text-sm font-semibold">로그인 상태를 확인하지 못했습니다.</p>
        <p className="text-dim text-xs">일시적인 오류입니다. 로그아웃되었다는 뜻은 아닙니다.</p>
        <button
          type="button"
          onClick={() => { setAuthFailed(false); setReloadKey(k => k + 1); }}
          className="px-3 py-1.5 bg-surface border border-border text-text text-sm font-semibold rounded-lg hover:border-accent/30 transition cursor-pointer"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-dim text-sm">
        <div className="inline-block w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between pt-4">
        <div>
          <p className="text-xs text-accent font-semibold tracking-widest mb-2">WRITE</p>
          <h1 className="type-page-title text-text">글쓰기</h1>
        </div>
        <Link href="/community" className="text-sm text-dim hover:text-text transition">
          ← 목록으로
        </Link>
      </div>

      {/* 작성 폼 */}
      <div className="bg-surface rounded-lg border border-border p-6 space-y-5">
        {/* 카테고리 선택 */}
        <div>
          <label className="block text-xs font-bold text-dim mb-2">카테고리</label>
          <SegmentedFilter options={CATEGORIES.map(c => ({ value: c.value, label: c.label }))} value={category} onChange={setCategory} />
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-xs font-bold text-dim mb-2">제목</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            maxLength={100}
            className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-accent transition"
          />
          <p className="text-xs text-dim mt-1 text-right">{title.length}/100</p>
        </div>

        {/* 내용 */}
        <div>
          <label className="block text-xs font-bold text-dim mb-2">내용</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="내용을 입력하세요"
            rows={12}
            maxLength={5000}
            className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-accent transition resize-none leading-relaxed"
          />
          <p className="text-xs text-dim mt-1 text-right">{content.length}/5,000</p>
        </div>

        {/* 투표 추가 */}
        <div>
          <button
            type="button"
            onClick={() => { setPollEnabled(!pollEnabled); if (pollEnabled) { setPollQuestion(''); setPollOptions(['', '']); } }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              pollEnabled ? 'bg-accent text-white' : 'bg-bg border border-border text-dim hover:text-text'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12l2 2 4-4"/></svg>
            {pollEnabled ? '투표 제거' : '투표 추가'}
          </button>
        </div>

        {pollEnabled && (
          <div className="bg-bg rounded-lg border border-border p-4 space-y-3">
            <label className="block text-xs font-bold text-dim">투표 질문</label>
            <input
              type="text"
              value={pollQuestion}
              onChange={e => setPollQuestion(e.target.value)}
              placeholder="투표 질문을 입력하세요"
              maxLength={200}
              className="w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-accent transition"
            />
            <label className="block text-xs font-bold text-dim">선택지 (2~5개)</label>
            {pollOptions.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={e => {
                    const next = [...pollOptions];
                    next[idx] = e.target.value;
                    setPollOptions(next);
                  }}
                  placeholder={`선택지 ${idx + 1}`}
                  maxLength={100}
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-accent transition"
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                    className="w-8 h-8 rounded-lg hover:bg-border/30 flex items-center justify-center text-dim cursor-pointer"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 5 && (
              <button
                type="button"
                onClick={() => setPollOptions([...pollOptions, ''])}
                className="text-xs text-accent font-semibold hover:underline cursor-pointer"
              >
                + 선택지 추가
              </button>
            )}
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {error}
          </div>
        )}

        {/* 작성자 정보 + 버튼 */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="text-xs text-dim">
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mr-1.5 ${
              user.type === 'blogger' ? 'bg-up/12 text-up' : 'bg-accent/10 text-accent'
            }`}>
              {user.type === 'blogger' ? '블로거' : '인플루언서'}
            </span>
            {user.name || user.id}
          </div>
          <div className="flex gap-2">
            <Link href="/community"
              className="px-4 py-2.5 text-sm font-semibold text-dim hover:text-text transition rounded-xl border border-border">
              취소
            </Link>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover transition disabled:opacity-50 cursor-pointer disabled:cursor-default">
              {submitting ? '작성 중...' : '작성하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
