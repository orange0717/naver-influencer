'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-0 md:gap-12 items-center">

        {/* 왼쪽: 서비스 소개 */}
        <div className="hidden md:block space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-xl">N</div>
            <div>
              <h2 className="text-lg font-extrabold text-text">N인플</h2>
              <p className="text-xs text-dim">네이버 인플루언서들을 위한 플랫폼</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center text-accent text-sm flex-shrink-0 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              </div>
              <div>
                <p className="text-sm font-bold text-text">블루오션 키워드 발굴</p>
                <p className="text-xs text-dim">참여자 적은 키워드를 분석하여 진입 기회를 추천합니다</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-up/15 flex items-center justify-center text-up text-sm flex-shrink-0 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
              </div>
              <div>
                <p className="text-sm font-bold text-text">실시간 순위 추적</p>
                <p className="text-xs text-dim">인플루언서별 키워드 순위와 변동을 실시간으로 확인</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center text-gold text-sm flex-shrink-0 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <div>
                <p className="text-sm font-bold text-text">9,000+ 인플루언서 DB</p>
                <p className="text-xs text-dim">20개 카테고리, 수만 개 키워드 데이터를 한눈에</p>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-border p-4">
            <p className="text-xs text-dim italic">&ldquo;무료 계정으로도 매일 3개의 블루오션 키워드를 추천받을 수 있습니다.&rdquo;</p>
          </div>
        </div>

        {/* 오른쪽: 로그인 폼 */}
        <div className="w-full max-w-sm mx-auto md:mx-0">
          <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
            {/* 모바일에서만 보이는 로고 */}
            <div className="text-center md:hidden">
              <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">N</div>
            </div>

            <div className="text-center md:text-left">
              <h1 className="text-2xl font-extrabold">로그인</h1>
              <p className="text-sm text-dim mt-1">계정에 로그인하세요</p>
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
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="비밀번호 입력"
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 pr-12 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dim hover:text-text transition p-1 cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    로그인 중...
                  </span>
                ) : '로그인'}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-border">
              <p className="text-sm text-dim">
                계정이 없으신가요?{' '}
                <Link href="/auth/signup" className="text-accent font-bold hover:underline">
                  무료 회원가입
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
