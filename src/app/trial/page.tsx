'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TrialPage() {
  const router = useRouter();
  const [naverId, setNaverId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const extractNaverId = (input: string): string => {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9_]+)/);
    if (urlMatch) return urlMatch[1].toLowerCase();
    return trimmed.replace(/^@/, '').toLowerCase();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractNaverId(naverId);
    if (!id) {
      setError('인플루언서 ID를 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId: id }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/my');
      } else {
        setError(data.error || '체험 시작에 실패했습니다.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-16 space-y-8">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto">
          <span className="text-2xl font-black text-accent">N</span>
        </div>
        <h1 className="font-title text-2xl font-extrabold">3일 무료 체험</h1>
        <p className="text-sm text-dim">
          회원가입 없이 인플루언서 ID만 입력하면<br />
          대시보드를 바로 이용할 수 있습니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface rounded-2xl border border-border p-6 space-y-5">
        <div>
          <label className="block text-sm font-semibold mb-2">인플루언서 ID</label>
          <input
            type="text"
            value={naverId}
            onChange={e => { setNaverId(e.target.value); setError(''); }}
            placeholder="네이버 인플루언서 ID 또는 링크"
            className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
            autoFocus
          />
          <p className="text-[11px] text-dim mt-1.5">
            예: orangelibrary 또는 https://in.naver.com/orangelibrary
          </p>
        </div>

        {error && (
          <p className="text-sm text-down bg-down/10 px-4 py-2.5 rounded-xl">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !naverId.trim()}
          className="w-full py-3.5 bg-accent text-white font-bold text-sm rounded-xl hover:bg-accent-hover transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? '확인 중...' : '무료 체험 시작하기'}
        </button>
      </form>

      <div className="text-center space-y-2">
        <p className="text-xs text-dim">
          체험 기간: 3일 / 별도 결제 없음 / 자동 종료
        </p>
        <p className="text-xs text-dim">
          이미 계정이 있으신가요?{' '}
          <Link href="/auth/login" className="text-accent font-semibold hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  );
}
