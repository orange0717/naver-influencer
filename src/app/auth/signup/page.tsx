'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

function getPasswordStrength(pw: string): { level: number; label: string; color: string } {
  if (pw.length === 0) return { level: 0, label: '', color: '' };
  if (pw.length < 8) return { level: 1, label: '너무 짧음', color: 'bg-down' };
  let score = 0;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (score <= 2) return { level: 2, label: '보통', color: 'bg-gold' };
  if (score <= 3) return { level: 3, label: '강함', color: 'bg-up' };
  return { level: 4, label: '매우 강함', color: 'bg-up' };
}

function translateAuthError(message: string): string {
  const errorMap: Record<string, string> = {
    'User already registered': '이미 가입된 이메일입니다. 로그인해주세요.',
    'Email rate limit exceeded': '이메일 발송 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
    'Signup requires a valid password': '유효한 비밀번호를 입력해주세요.',
    'Unable to validate email address: invalid format': '올바른 이메일 형식이 아닙니다.',
    'Password should be at least 6 characters': '비밀번호는 최소 6자 이상이어야 합니다.',
    'Anonymous sign-ins are disabled': '회원가입이 일시적으로 비활성화되어 있습니다.',
    'Signups not allowed for this instance': '현재 회원가입이 비활성화되어 있습니다.',
    'Email signups are disabled': '이메일 회원가입이 비활성화되어 있습니다.',
    'A user with this email address has already been registered': '이미 가입된 이메일입니다. 로그인해주세요.',
  };
  return errorMap[message] || message;
}

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nickname, setNickname] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const pwStrength = getPasswordStrength(password);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (!agreeTerms) {
      setError('이용약관에 동의해주세요.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      // 1. Supabase Auth 회원가입
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(translateAuthError(authError.message));
        return;
      }

      // 이메일 확인이 필요한 경우 (identities가 비어있지 않고, confirmed_at이 없으면)
      const needsConfirmation = authData.user && !authData.session;

      // 2. API 라우트로 users 테이블에 프로필 생성 (service_role로 RLS 우회)
      if (authData.user) {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authId: authData.user.id,
            email,
            nickname: nickname.trim(),
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          setError(err.error || '프로필 생성에 실패했습니다.');
          return;
        }
      }

      if (needsConfirmation) {
        // 이메일 확인 필요 — 성공 메시지 표시
        setSuccess(true);
      } else {
        // 이메일 확인 불필요 — 바로 대시보드로 이동
        router.push('/my');
        router.refresh();
      }
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 이메일 확인 안내 화면
  if (success) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center -mt-6">
        <div className="w-full max-w-md mx-auto">
          <div className="bg-surface rounded-2xl border border-border p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-up/15 flex items-center justify-center mx-auto">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-up">
                <path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </div>
            <h1 className="text-2xl font-extrabold text-text">이메일을 확인해주세요</h1>
            <p className="text-sm text-dim leading-relaxed">
              <span className="font-bold text-text">{email}</span>으로<br />
              확인 메일을 보냈습니다.<br />
              메일의 링크를 클릭하면 가입이 완료됩니다.
            </p>
            <div className="pt-4 space-y-2">
              <p className="text-xs text-dim">메일이 안 보이면 스팸함을 확인해주세요.</p>
              <Link href="/auth/login" className="inline-block text-sm text-accent font-bold hover:underline">
                로그인 페이지로 이동
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <div className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-up/12 text-up">무료</span>
                <span className="text-sm font-bold">가입 즉시 이용 가능</span>
              </div>
              <ul className="space-y-2 text-xs text-dim">
                <li className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  키워드 목록 전체 열람
                </li>
                <li className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  일일 추천 키워드 3개
                </li>
                <li className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-up flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  참여자 수 / 블루오션 지표 확인
                </li>
              </ul>
            </div>

            <div className="bg-surface rounded-xl border border-accent/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-accent/12 text-accent">PRO</span>
                <span className="text-sm font-bold">월 9,900원 구독</span>
              </div>
              <ul className="space-y-2 text-xs text-dim">
                <li className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  인플루언서 상세 프로필 열람
                </li>
                <li className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  검색량 트렌드 차트
                </li>
                <li className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
                  내 순위 추적 대시보드
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* 오른쪽: 회원가입 폼 */}
        <div className="w-full max-w-sm mx-auto md:mx-0">
          <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
            {/* 모바일에서만 보이는 로고 */}
            <div className="text-center md:hidden">
              <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">N</div>
            </div>

            <div className="text-center md:text-left">
              <h1 className="text-2xl font-extrabold">회원가입</h1>
              <p className="text-sm text-dim mt-1">무료로 시작하세요</p>
            </div>

            {error && (
              <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dim block mb-1.5">닉네임</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={e => setNickname(e.target.value)}
                  placeholder="활동할 닉네임"
                  required
                  autoComplete="nickname"
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
                />
              </div>
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
                    placeholder="8자 이상"
                    required
                    autoComplete="new-password"
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
                {/* 비밀번호 강도 표시 */}
                {password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= pwStrength.level ? pwStrength.color : 'bg-border'}`} />
                      ))}
                    </div>
                    <p className={`text-[10px] ${pwStrength.level <= 1 ? 'text-down' : pwStrength.level === 2 ? 'text-gold' : 'text-up'}`}>
                      {pwStrength.label}
                    </p>
                  </div>
                )}
              </div>

              {/* 이용약관 동의 */}
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={e => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-accent cursor-pointer"
                />
                <span className="text-xs text-dim leading-relaxed">
                  <span className="text-text font-medium">이용약관</span> 및{' '}
                  <span className="text-text font-medium">개인정보 처리방침</span>에 동의합니다
                </span>
              </label>

              <button
                type="submit"
                disabled={loading || !agreeTerms}
                className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    가입 중...
                  </span>
                ) : '무료로 시작하기'}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-border">
              <p className="text-sm text-dim">
                이미 계정이 있으신가요?{' '}
                <Link href="/auth/login" className="text-accent font-bold hover:underline">
                  로그인
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
