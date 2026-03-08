'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? '이메일 또는 비밀번호가 올바르지 않습니다.'
          : authError.message);
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
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">N</div>
          <h1 className="text-2xl font-extrabold">로그인</h1>
          <p className="text-sm text-dim mt-1">네이버 인플루언서 키워드챌린지 대시보드</p>
        </div>

        {error && (
          <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 입력" required
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-xs text-dim">
          계정이 없으신가요? <Link href="/auth/signup" className="text-accent font-semibold hover:underline">회원가입</Link>
        </p>
      </div>
    </div>
  );
}
