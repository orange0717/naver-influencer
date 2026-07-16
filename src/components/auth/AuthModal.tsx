'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { withTimeout, TimeoutError } from '@/lib/with-timeout';
import { login as gaLogin, signUp as gaSignUp } from '@/lib/gtag';
import { validatePassword, PASSWORD_PLACEHOLDER } from '@/lib/validations/auth';
import { KEYWORD_CHALLENGE_CATEGORIES } from '@/lib/keyword-challenge-categories';
import LegalModal from '@/components/legal/LegalModal';
import TermsContent from '@/components/legal/TermsContent';
import PrivacyContent from '@/components/legal/PrivacyContent';
import { useAuthModal } from '@/contexts/AuthModalContext';

const RequiredMark = () => <span className="text-down ml-0.5">*</span>;

const REASON_MESSAGES: Record<string, string> = {
  session_taken: '다른 기기에서 로그인되어 자동 로그아웃되었습니다. 다시 로그인해 주세요.',
  oauth_no_account: '가입되지 않은 구글 계정입니다. 먼저 회원가입을 완료해주세요.',
};

// blog.naver.com/foo, https://blog.naver.com/foo?bar 등에서 'foo' 만 추출
const extractBlogId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/blog\.naver\.com\/([^/?#]+)/i);
  return (m ? m[1] : trimmed).toLowerCase();
};

// in.naver.com/foo → foo
const extractNaverId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/in\.naver\.com\/([^/?#]+)/i);
  return (m ? m[1] : trimmed).toLowerCase();
};

export default function AuthModal() {
  const { mode, redirectTo, reason, close, switchMode } = useAuthModal();
  const router = useRouter();
  const queryClient = useQueryClient();
  const open = mode !== null;
  const containerRef = useRef<HTMLDivElement>(null);

  // ── 로그인 폼 상태 ──
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── 회원가입 폼 상태 ──
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [blogInput, setBlogInput] = useState('');
  const [naverInput, setNaverInput] = useState('');
  const [keywordCategory, setKeywordCategory] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupLoadingStep, setSignupLoadingStep] = useState('');
  const [signupError, setSignupError] = useState('');

  const allAgreed = agreeTerms && agreePrivacy;

  // 리다이렉트 사유가 있으면 로그인 탭에 안내 메시지 표시
  useEffect(() => {
    if (mode === 'login' && reason && REASON_MESSAGES[reason]) {
      setLoginError(REASON_MESSAGES[reason]);
    }
  }, [mode, reason]);

  // ESC 닫기 + 배경 스크롤 잠금 + 최초 포커스 + Tab 포커스 트랩
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;

    const getFocusable = () =>
      container
        ? Array.from(container.querySelectorAll<HTMLElement>('input, button, select, textarea, a[href]'))
            .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
        : [];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = getFocusable();
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const firstInput = container?.querySelector<HTMLElement>('input');
    firstInput?.focus();

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, mode, close]);

  function resetLoginForm() {
    setLoginEmail('');
    setLoginPassword('');
    setLoginError('');
    setLoginLoading(false);
    setGoogleLoading(false);
  }

  function resetSignupForm() {
    setEmail('');
    setNickname('');
    setPassword('');
    setPasswordConfirm('');
    setBlogInput('');
    setNaverInput('');
    setKeywordCategory('');
    setAgreeTerms(false);
    setAgreePrivacy(false);
    setSignupError('');
    setSignupLoading(false);
    setSignupLoadingStep('');
  }

  function handleClose() {
    resetLoginForm();
    resetSignupForm();
    close();
  }

  async function handleGoogleLogin() {
    setLoginError('');
    setGoogleLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const next = redirectTo || window.location.pathname;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) {
        setLoginError(error.message);
        setGoogleLoading(false);
      }
    } catch {
      setLoginError('구글 로그인 중 오류가 발생했습니다.');
      setGoogleLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');

    if (!loginEmail.trim()) {
      setLoginError('이메일을 입력해주세요.');
      return;
    }
    if (!loginPassword) {
      setLoginError('비밀번호를 입력해주세요.');
      return;
    }
    if (loginLoading) return; // 중복 클릭 방지 (버튼 disabled에 더한 이중 안전장치)

    setLoginLoading(true);
    const t0 = performance.now();
    let stage = 'auth';

    // 콘솔 출력 + 서버 집계(로그인 성공률/실패원인) 동시 기록. 집계 실패가
    // 로그인 흐름을 막으면 안 되므로 응답을 기다리지 않는다(fire-and-forget).
    const report = (result: 'success' | 'fail', reason?: string) => {
      const totalMs = Math.round(performance.now() - t0);
      const line = `[login] result=${result}${reason ? ` reason=${reason}` : ''} total=${totalMs}ms`;
      if (result === 'success') console.info(line);
      else console.error(line);
      fetch('/api/auth/login-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'main', result, reason, totalMs }),
      }).catch(() => {});
    };

    try {
      const supabase = createSupabaseBrowserClient();

      // signInWithPassword가 응답 없이 멈추면 아래 await가 영원히 끝나지 않아
      // finally도 실행되지 않는다 → 8초 타임아웃으로 강제 종료시켜 버튼이
      // "로그인 중..."에 무한정 멈추는 것을 방지한다.
      stage = 'auth';
      const tAuth = performance.now();
      const { data: authData, error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: loginEmail.trim(),
          password: loginPassword,
        }),
        8000,
        '로그인 인증',
      );
      console.info(`[login] auth stage=${Math.round(performance.now() - tAuth)}ms`);

      if (authError) {
        setLoginError(
          authError.message.includes('Invalid login credentials')
            ? '이메일 또는 비밀번호가 올바르지 않습니다.'
            : authError.message,
        );
        report('fail', 'auth_error');
        return;
      }

      stage = 'user-lookup';
      const tUser = performance.now();
      const { data: userRecord } = await withTimeout(
        supabase.from('users').select('id').eq('auth_id', authData.user?.id).single(),
        6000,
        '회원 정보 조회',
      );
      console.info(`[login] user-lookup stage=${Math.round(performance.now() - tUser)}ms`);

      if (!userRecord) {
        await supabase.auth.signOut().catch(() => {});
        setLoginError('회원가입이 완료되지 않은 계정입니다. 회원가입 탭에서 다시 가입해주세요.');
        report('fail', 'no_user_record');
        return;
      }

      stage = 'sync-cookies';
      const tCookie = performance.now();
      await fetch('/api/auth/sync-cookies', { method: 'POST' }).catch(() => {});
      console.info(`[login] sync-cookies stage=${Math.round(performance.now() - tCookie)}ms`);

      stage = 'session-register';
      const tSession = performance.now();
      try {
        const { getDeviceId } = await import('@/lib/device-id');
        getDeviceId();
        await fetch('/api/session/register', { method: 'POST' });
      } catch { /* 등록 실패해도 로그인 흐름은 계속 */ }
      console.info(`[login] session-register stage=${Math.round(performance.now() - tSession)}ms`);

      gaLogin('email');

      stage = 'invalidate-queries';
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      stage = 'redirect';
      const tRedirect = performance.now();
      handleClose();
      if (redirectTo) router.push(redirectTo);
      router.refresh();
      console.info(`[login] redirect stage=${Math.round(performance.now() - tRedirect)}ms`);

      report('success');
    } catch (err) {
      const timedOut = err instanceof TimeoutError;
      setLoginError(
        timedOut
          ? '로그인 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '로그인 중 오류가 발생했습니다.',
      );
      console.error(`[login] stage=${stage}`, err);
      report('fail', timedOut ? 'timeout' : 'exception');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleSignup() {
    setSignupError('');

    if (!email.trim()) {
      setSignupError('이메일을 입력해주세요.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setSignupError('올바른 이메일 형식을 입력해주세요.');
      return;
    }
    if (!nickname.trim()) {
      setSignupError('닉네임을 입력해주세요.');
      return;
    }
    if (nickname.trim().length > 20) {
      setSignupError('닉네임은 20자 이하로 입력해주세요.');
      return;
    }
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) {
      setSignupError(pwCheck.error);
      return;
    }
    if (password !== passwordConfirm) {
      setSignupError('비밀번호가 일치하지 않습니다.');
      return;
    }

    const blogId = extractBlogId(blogInput);
    const naverId = extractNaverId(naverInput);
    if (!blogId) {
      setSignupError('네이버 블로그 주소를 입력해주세요.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(blogId)) {
      setSignupError('네이버 블로그 주소를 다시 확인해주세요.');
      return;
    }
    if (naverId && !/^[a-zA-Z0-9._-]{2,30}$/.test(naverId)) {
      setSignupError('네이버 인플루언서홈 주소를 다시 확인해주세요.');
      return;
    }
    if (!keywordCategory) {
      setSignupError('활동 주제(키워드챌린지 분야)를 선택해주세요.');
      return;
    }
    if (!allAgreed) {
      setSignupError('이용약관과 개인정보처리방침에 동의해주세요.');
      return;
    }

    setSignupLoading(true);
    setSignupLoadingStep('계정 생성 중...');

    try {
      const supabase = createSupabaseBrowserClient();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        setSignupError(
          authError.message.includes('already registered')
            ? '이미 가입된 이메일입니다. 로그인해주세요.'
            : authError.message,
        );
        return;
      }

      if (!authData.user) {
        setSignupError('회원가입에 실패했습니다.');
        return;
      }

      if (!authData.session) {
        setSignupError('이미 가입된 이메일입니다. 로그인 탭에서 로그인해주세요.');
        return;
      }

      setSignupLoadingStep('프로필 생성 중...');

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authId: authData.user.id,
          email: email.trim(),
          nickname: nickname.trim(),
          keywordCategory,
          ...(blogId ? { blogId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        await supabase.auth.signOut();
        setSignupError(data.error || '프로필 생성에 실패했습니다.');
        return;
      }

      await fetch('/api/auth/sync-cookies', { method: 'POST' }).catch(() => {});

      gaSignUp('email');

      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      handleClose();
      if (redirectTo) {
        router.push(redirectTo);
      } else if (naverId) {
        router.push(`/my/link?naverId=${encodeURIComponent(naverId)}`);
      } else {
        router.push('/my/blogger');
      }
      router.refresh();
    } catch {
      setSignupError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setSignupLoading(false);
      setSignupLoadingStep('');
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8 backdrop-blur-sm sm:items-center"
      role="presentation"
      onClick={handleClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'login' ? '로그인' : '회원가입'}
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="닫기"
          className="absolute right-4 top-4 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-dim transition hover:bg-bg hover:text-text"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 4l10 10M14 4L4 14" />
          </svg>
        </button>

        <div className="max-h-[85vh] overflow-y-auto p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-xl font-bold text-white">
              N
            </div>
            <h2 className="text-xl font-extrabold text-text">
              {mode === 'login' ? 'N인플 로그인' : 'N인플 회원가입'}
            </h2>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">이메일</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">비밀번호</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="비밀번호를 입력해주세요"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>

              {loginError && (
                <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-sm text-down">{loginError}</div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loginLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    로그인 중...
                  </span>
                ) : (
                  '로그인'
                )}
              </button>

              <div className="flex items-center justify-center gap-3 text-xs text-dim">
                <button type="button" onClick={() => switchMode('signup')} className="cursor-pointer transition hover:text-accent">
                  회원가입
                </button>
                <span className="text-border">|</span>
                <Link href="/auth/forgot" onClick={handleClose} className="transition hover:text-accent">
                  ID/PW 찾기
                </Link>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className="bg-surface px-3 text-dim">또는</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading || loginLoading}
                  aria-label="Google로 로그인"
                  title="Google로 로그인"
                  className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-border bg-white transition hover:border-accent/50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {googleLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/30 border-t-gray-600" />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">닉네임<RequiredMark /></label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임을 입력해주세요"
                  maxLength={20}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">이메일<RequiredMark /></label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">비밀번호<RequiredMark /></label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={PASSWORD_PLACEHOLDER}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">비밀번호 확인<RequiredMark /></label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호를 다시 입력해주세요"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>

              <div className="space-y-2.5 rounded-xl border-2 border-accent/25 bg-accent/5 p-4">
                <label className="mb-1.5 block text-xs font-semibold text-dim" htmlFor="signup-modal-keyword-category">
                  활동 주제 (키워드챌린지)<RequiredMark />
                </label>
                <p className="text-[11px] leading-relaxed text-dim">
                  대시보드·추천 키워드는 선택한 분야 기준으로 보입니다. 네이버 챌린지 카테고리와 이름이 같습니다.
                </p>
                <select
                  id="signup-modal-keyword-category"
                  value={keywordCategory}
                  onChange={(e) => setKeywordCategory(e.target.value)}
                  style={!keywordCategory ? { color: 'var(--color-dim)' } : undefined}
                  className={`w-full cursor-pointer appearance-auto rounded-xl border border-border bg-surface px-4 py-3 text-sm transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${
                    keywordCategory ? 'text-text' : 'text-dim'
                  }`}
                >
                  <option value="">주제를 선택하세요</option>
                  {KEYWORD_CHALLENGE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">네이버 블로그 주소<RequiredMark /></label>
                <input
                  type="text"
                  value={blogInput}
                  onChange={(e) => setBlogInput(e.target.value)}
                  placeholder="blog.naver.com/blogid 또는 blogid"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">
                  네이버 인플루언서홈 주소 <span className="font-normal text-dim/60">(선택)</span>
                </label>
                <input
                  type="text"
                  value={naverInput}
                  onChange={(e) => setNaverInput(e.target.value)}
                  placeholder="in.naver.com/naverid 또는 naverid"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                <p className="mt-1 text-[11px] text-dim">가입 후 본인 인증 페이지로 이동합니다.</p>
              </div>

              {signupError && (
                <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-center text-sm text-down">{signupError}</div>
              )}

              <div className="space-y-2 pt-2">
                <label className="flex cursor-pointer items-center gap-2" onClick={() => { setAgreeTerms(!allAgreed); setAgreePrivacy(!allAgreed); }}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${allAgreed ? 'border-accent bg-accent' : 'border-border'}`}>
                    {allAgreed && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2"><path d="M2 6l3 3 5-5" /></svg>}
                  </span>
                  <span className="text-sm font-bold">전체 동의</span>
                </label>
                <div className="ml-7 space-y-1.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
                    <span className="text-xs text-dim">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setShowTerms(true); }} className="cursor-pointer underline hover:text-accent">[필수] 이용약관</button> 동의
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
                    <span className="text-xs text-dim">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setShowPrivacy(true); }} className="cursor-pointer underline hover:text-accent">[필수] 개인정보처리방침</button> 동의
                    </span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSignup}
                disabled={signupLoading || !allAgreed}
                className="w-full cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {signupLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    {signupLoadingStep}
                  </span>
                ) : '가입하기'}
              </button>

              <p className="text-center text-[11px] leading-relaxed text-dim">
                구글 로그인은 회원가입 완료 후 사용 가능합니다.
              </p>

              <p className="text-center text-sm text-dim">
                이미 계정이 있으신가요?{' '}
                <button type="button" onClick={() => switchMode('login')} className="cursor-pointer text-accent underline hover:text-accent-hover">
                  로그인
                </button>
              </p>
            </div>
          )}
        </div>
      </div>

      <LegalModal open={showTerms} title="이용약관" onClose={() => setShowTerms(false)}>
        <TermsContent />
      </LegalModal>
      <LegalModal open={showPrivacy} title="개인정보처리방침" onClose={() => setShowPrivacy(false)}>
        <PrivacyContent />
      </LegalModal>
    </div>
  );
}
