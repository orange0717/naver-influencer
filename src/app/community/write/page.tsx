'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.id) {
          setUser({ type: data.type, id: data.id, name: data.name });
        } else {
          router.push('/auth/login');
        }
      })
      .catch(() => router.push('/auth/login'));
  }, [router]);

  const handleSubmit = async () => {
    if (!title.trim()) { setError('제목을 입력해주세요.'); return; }
    if (!content.trim()) { setError('내용을 입력해주세요.'); return; }
    if (title.trim().length < 2) { setError('제목을 2자 이상 입력해주세요.'); return; }
    if (content.trim().length < 5) { setError('내용을 5자 이상 입력해주세요.'); return; }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/community', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          title: title.trim(),
          content: content.trim(),
          author_id: user?.id,
          author_type: user?.type,
          author_name: user?.name || user?.id,
        }),
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
          <h1 className="font-title text-xl font-extrabold text-text">글쓰기</h1>
        </div>
        <Link href="/community" className="text-sm text-dim hover:text-text transition">
          ← 목록으로
        </Link>
      </div>

      {/* 작성 폼 */}
      <div className="bg-surface rounded-2xl border border-border p-6 space-y-5">
        {/* 카테고리 선택 */}
        <div>
          <label className="block text-xs font-bold text-dim mb-2">카테고리</label>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                  category === cat.value
                    ? 'bg-accent text-white'
                    : 'bg-bg border border-border text-dim hover:text-text'
                }`}>
                {cat.label}
              </button>
            ))}
          </div>
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
            className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-accent transition"
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
            className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-accent transition resize-none leading-relaxed"
          />
          <p className="text-xs text-dim mt-1 text-right">{content.length}/5,000</p>
        </div>

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
              user.type === 'blogger' ? 'bg-[#2DB400]/15 text-[#2DB400]' : 'bg-accent/10 text-accent'
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
