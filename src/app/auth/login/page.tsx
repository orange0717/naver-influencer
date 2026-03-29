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

    // 브라우저 autofill은 React onChange를 트리거하지 않으므로 DOM에서 직접 읽기
    const form = e.target as HTMLFormElement;
    const emailValue = (form.elements.namedItem('email') as HTMLInputElement)?.value || email;
    const passwordValue = (form.elements.namedItem('password') as HTMLInputElement)?.value || password;

    if (!emailValue.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    if (!passwordValue) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailValue.trim(),
        password: passwordValue,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else {
          setError(authError.message);
        }
        return;
      }

      // users 테이블에 레코드가 있는지 확인 (회원가입 완료 여부)
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', authData.user?.id)
        .single();

      if (!userRecord) {
        await supabase.auth.signOut();
        setError('회원가입이 완료되지 않은 계정입니다. 회원가입 페이지에서 다시 가입해주세요.');
        return;
      }

      // 레거시 쿠키 동기화 (헤더 닉네임 표시용)
      await fetch('/api/auth/sync-cookies', { method: 'POST' }).catch(() => {});

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
      <div className="w-full max-w-sm mx-auto px-4">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          {/* ─── 헤더 ─── */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
              N
            </div>
            <h1 className="text-2xl font-extrabold">N인플 로그인</h1>
            <p className="text-sm text-dim mt-1">이메일과 비밀번호를 입력해주세요</p>
          </div>

          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="example@email.com"
                autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
              <input
                type="password"
                name="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호를 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : (
                '로그인'
              )}
            </button>
          </form>

          <p className="text-[10px] text-dim text-center leading-relaxed">
            아직 계정이 없으신가요?{' '}
            <Link href="/auth/signup" className="text-accent underline hover:text-accent-hover">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
