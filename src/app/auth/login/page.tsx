'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function extractNaverId(input: string): string {
  const trimmed = input.trim();
  // https://in.naver.com/username 또는 in.naver.com/username
  const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9_]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  // 그냥 ID만 입력한 경우
  return trimmed.replace(/^@/, '').toLowerCase();
}

export default function LoginPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const naverId = extractNaverId(input);
    if (!naverId) {
      setError('인플루언서 링크 또는 ID를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/influencer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        return;
      }

      router.push('/my');
      router.refresh();
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">N</div>
            <h1 className="text-2xl font-extrabold">N인플</h1>
            <p className="text-sm text-dim mt-1">인플루언서 링크로 접속하세요</p>
          </div>

          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">네이버 인플루언서 링크</label>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="https://in.naver.com/아이디 또는 아이디"
                required
                autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
              <p className="text-[11px] text-dim mt-1.5">
                예: https://in.naver.com/orangelibrary 또는 orangelibrary
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  확인 중...
                </span>
              ) : '접속하기'}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-border">
            <p className="text-xs text-dim">
              처음이신가요? 인플루언서 링크를 입력하면<br />
              <span className="text-accent font-semibold">자동으로 회원가입</span>됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
