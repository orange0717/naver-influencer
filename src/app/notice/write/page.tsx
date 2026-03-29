'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const TAGS = [
  { value: 'notice', label: '공지' },
  { value: 'update', label: '업데이트' },
  { value: 'event', label: '이벤트' },
];

export default function NoticeWritePage() {
  const [tag, setTag] = useState('notice');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user.id) {
      router.push('/notice');
    }
  }, [authLoading, user.id, router]);

  const handleSubmit = async () => {
    setError('');
    if (title.trim().length < 2) { setError('제목은 2자 이상 입력해주세요.'); return; }
    if (content.trim().length < 5) { setError('내용은 5자 이상 입력해주세요.'); return; }

    setLoading(true);
    try {
      // Supabase 세션에서 토큰을 가져와 Bearer 인증
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/notices', {
        method: 'POST',
        headers,
        body: JSON.stringify({ tag, title: title.trim(), content: content.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '작성에 실패했습니다.');
        return;
      }

      const { id } = await res.json();
      router.push(`/notice/${id}`);
    } catch {
      setError('작성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">공지사항 작성</h1>

      <div className="bg-surface rounded-xl border border-border p-6 space-y-5">
        {/* 태그 선택 */}
        <div>
          <label className="text-xs font-semibold text-dim block mb-2">태그</label>
          <div className="flex gap-2">
            {TAGS.map(t => (
              <button key={t.value} onClick={() => setTag(t.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                  tag === t.value
                    ? 'bg-accent text-white'
                    : 'bg-bg border border-border text-dim hover:text-text hover:border-accent/30'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 제목 */}
        <div>
          <label className="text-xs font-semibold text-dim block mb-1.5">제목</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="제목을 입력하세요" maxLength={100}
            className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
          <p className="text-[11px] text-dim text-right mt-1">{title.length}/100</p>
        </div>

        {/* 내용 */}
        <div>
          <label className="text-xs font-semibold text-dim block mb-1.5">내용</label>
          <textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="내용을 입력하세요" maxLength={5000} rows={12}
            className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-none transition" />
          <p className="text-[11px] text-dim text-right mt-1">{content.length}/5000</p>
        </div>

        {error && (
          <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">{error}</div>
        )}

        <div className="flex gap-3">
          <button onClick={() => router.push('/notice')}
            className="px-6 py-3 bg-bg border border-border text-dim font-semibold rounded-xl hover:text-text hover:border-accent/30 transition cursor-pointer">
            취소
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex-1 py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                작성 중...
              </span>
            ) : '작성하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
