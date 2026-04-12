'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function AdLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();

  const handleLogin = async () => {
    setError('');
    if (!email.trim()) return setError('이메일을 입력해주세요.');
    if (!password) return setError('비밀번호를 입력해주세요.');

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError('이메일 또는 비밀번호가 일치하지 않습니다.');
        return;
      }

      // 광고주 계정인지 확인
      const res = await fetch('/api/ad/auth/me');
      if (!res.ok) {
        await supabase.auth.signOut();
        setError('광고주 계정이 아닙니다. 일반 회원은 N인플 로그인을 이용해주세요.');
        return;
      }
      const data = await res.json();
      if (!data.id) {
        await supabase.auth.signOut();
        setError('광고주 계정이 아닙니다. 일반 회원은 N인플 로그인을 이용해주세요.');
        return;
      }

      router.push('/orangeconnect/dashboard');
      router.refresh();
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleLogin();
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-sm mx-auto px-4">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          {/* 헤더 */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
              AD
            </div>
            <h1 className="text-2xl font-extrabold">광고주 로그인</h1>
            <p className="text-sm text-dim mt-1">인플루언서 마케팅 플랫폼</p>
          </div>

          <div className="space-y-4 animate-fade-in-up">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="example@company.com" autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="비밀번호를 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            {error && (
              <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">{error}</div>
            )}

            <button type="button" onClick={handleLogin} disabled={loading}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : '로그인'}
            </button>

            <p className="text-[10px] text-dim text-center">
              계정이 없으신가요?{' '}
              <Link href="/orangeconnect/signup" className="text-accent underline hover:text-accent-hover">회원가입</Link>
            </p>

            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-dim text-center">
                인플루언서/블로거이신가요?{' '}
                <Link href="/auth/login" className="text-accent underline hover:text-accent-hover">N인플 로그인</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
