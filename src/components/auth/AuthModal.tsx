'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { withTimeout, TimeoutError } from '@/lib/with-timeout';
import { login as gaLogin, signUp as gaSignUp } from '@/lib/gtag';
import { validatePassword, PASSWORD_PLACEHOLDER, isValidEmail, EMAIL_FORMAT_ERROR } from '@/lib/validations/auth';
import { mapSupabaseAuthError } from '@/lib/auth-error-messages';
import { KEYWORD_CHALLENGE_CATEGORIES } from '@/lib/keyword-challenge-categories';
import LegalModal from '@/components/legal/LegalModal';
import GoogleLoginButton from '@/components/auth/GoogleLoginButton';
import TermsContent from '@/components/legal/TermsContent';
import PrivacyContent from '@/components/legal/PrivacyContent';
import { useAuthModal } from '@/contexts/AuthModalContext';
import Modal from '@/components/ui/Modal';

const RequiredMark = () => <span className="text-down ml-0.5">*</span>;

const REASON_MESSAGES: Record<string, string> = {
  session_taken: '다른 기기에서 로그인되어 자동 로그아웃되었습니다. 다시 로그인해 주세요.',
  // /auth/callback 이 실패했을 때. 예전에는 `?error=confirm_failed` 로 붙여 보냈는데
  // 그 파라미터를 읽는 코드가 어디에도 없어서, 구글 계정 선택까지 마친 사용자가
  // 아무 설명 없는 빈 로그인 모달만 보고 같은 버튼을 계속 눌렀다.
  confirm_failed: '로그인 인증이 만료되었거나 처리에 실패했습니다. 다시 시도해주세요.',
  oauth_cancelled: '구글 로그인이 취소되었습니다. 다시 시도하시려면 아래 버튼을 눌러주세요.',
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
  /** 검증에 실패한 칸. 오류 상자가 그린 뒤 그 칸으로 스크롤·포커스하는 데 쓴다. */
  const [signupErrorField, setSignupErrorField] = useState<{ id: string; seq: number } | null>(null);
  const errorSeq = useRef(0);

  const allAgreed = agreeTerms && agreePrivacy;

  // 리다이렉트 사유가 있으면 로그인 탭에 안내 메시지 표시
  useEffect(() => {
    if (mode === 'login' && reason && REASON_MESSAGES[reason]) {
      setLoginError(REASON_MESSAGES[reason]);
    }
  }, [mode, reason]);

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
    setSignupErrorField(null);
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
        // Supabase 는 영문으로 답한다 — 그대로 뿌리지 않는다.
        setLoginError(mapSupabaseAuthError(error, '구글 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.'));
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
    // 형식 검사가 없으면 오타난 주소를 그대로 Supabase 로 보내고 "이메일과 비밀번호를
    // 확인해주세요"라는 뭉뚱그린 실패만 돌려받는다. 어느 쪽이 틀렸는지 알 수 없다.
    if (!isValidEmail(loginEmail)) {
      setLoginError(EMAIL_FORMAT_ERROR);
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
        // 예전에는 'Invalid login credentials' 한 가지만 한글로 바꾸고 나머지는 영문 원문을
        // 그대로 띄웠다. 'Email not confirmed'(메일함을 봐야 함)·'For security purposes, you
        // can only request this after 47 seconds'(기다려야 함)처럼 **해야 할 일이 완전히 다른**
        // 상황들이 전부 알 수 없는 영문 한 줄로 뭉개졌다.
        setLoginError(mapSupabaseAuthError(authError, '로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.'));
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
      // 이 기기를 user_sessions 에 등록해야 이후 요청이 verifySession 을 통과한다.
      // 등록이 실패한 채 로그인만 진행되면, 새 기기가 미들웨어에서 강제 로그아웃되어
      // 모든 메뉴가 "데이터 없음"으로 보이는 증상이 발생한다 → 최대 2회 재시도.
      try {
        const { getDeviceId } = await import('@/lib/device-id');
        getDeviceId(); // localStorage+쿠키에 device-id 동기화 (서버가 쿠키로 읽음)
        let registered = false;
        for (let attempt = 0; attempt < 2 && !registered; attempt++) {
          try {
            const res = await fetch('/api/session/register', { method: 'POST' });
            const body = await res.json().catch(() => null);
            registered = res.ok && body?.ok === true;
          } catch { /* 네트워크 오류 — 다음 시도 */ }
          if (!registered && attempt === 0) await new Promise(r => setTimeout(r, 300));
        }
        if (!registered) console.warn('[login] session-register 실패 — 새 기기에서 세션이 튈 수 있음');
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

  /**
   * 가입 검증 실패를 알린다.
   *
   * 오류 상자는 폼 **맨 아래**(동의 체크박스 바로 위)에 뜨는데, 회원가입 폼은 길어서
   * 문제의 칸이 스크롤 위로 사라져 있을 수 있다. 실제로 "이메일을 입력해주세요."가
   * 떠 있는데 이메일 칸은 화면에 없는 상태가 나왔다 — 무엇을 고쳐야 하는지는 알려주지만
   * 어디를 고쳐야 하는지는 안 알려준 셈이다. 그래서 해당 칸으로 스크롤 + 포커스한다.
   *
   * 스크롤을 여기서 바로 하면 안 된다. setSignupError 로 오류 상자가 DOM 에 끼어드는
   * 리렌더가 **아직 커밋되기 전**이라, 곧이어 일어나는 레이아웃 변경이 이동을 취소시킨다
   * (실측: scrollTop 이 420 그대로였다). 커밋 뒤에 움직이도록 effect 로 미룬다.
   * seq 는 같은 칸이 연속으로 틀렸을 때도 effect 가 다시 돌게 하는 용도다.
   */
  function failSignup(message: string, fieldId?: string) {
    setSignupError(message);
    setSignupErrorField(fieldId ? { id: fieldId, seq: ++errorSeq.current } : null);
  }

  useEffect(() => {
    if (!signupErrorField) return;
    const el = document.getElementById(signupErrorField.id);
    if (!el) return;
    // behavior:'smooth' 는 리렌더 중 끊긴다. 즉시 이동시킨다.
    el.scrollIntoView({ block: 'center' });
    (el as HTMLElement).focus({ preventScroll: true });
  }, [signupErrorField]);

  /**
   * 문제의 칸 바로 아래에 같은 메시지를 한 번 더 적는다.
   *
   * 위 effect 가 해당 칸으로 스크롤해주면 이번엔 **오류 상자 쪽이** 화면 밖으로 나간다
   * (실측: 닉네임 칸으로 올라오니 맨 아래 "닉네임을 입력해주세요." 가 안 보였다).
   * 폼이 한 화면에 다 안 들어오는 이상 둘 중 하나는 반드시 가려지므로, 칸과 메시지가
   * 항상 같이 보이도록 칸 옆에도 적는다. 맨 아래 상자는 그대로 둔다 — 동의 체크박스처럼
   * 가리킬 칸이 없는 오류는 거기서만 나오고, 스크롤 없이 누른 사람은 그쪽을 먼저 본다.
   */
  function signupFieldError(fieldId: string) {
    if (signupErrorField?.id !== fieldId) return null;
    return <p className="mt-1.5 text-[11px] text-down">{signupError}</p>;
  }

  async function handleSignup() {
    // 로그인(handleLogin)에는 있는데 회원가입에만 없던 가드. 버튼 disabled 만으로는
    // Enter 키 경로를 못 막아서, 연타하면 signUp 요청이 두 번 나갈 수 있었다.
    if (signupLoading) return;
    setSignupError('');

    // 검사 순서는 **화면에 보이는 칸 순서**와 같아야 한다.
    // 예전엔 이메일을 닉네임보다 먼저 검사해서, 다 비운 채 누르면 맨 위 칸(닉네임)을
    // 놔두고 "이메일을 입력해주세요."가 떴다. 채우고 누르면 이번엔 위로 되돌아가
    // "닉네임을 입력해주세요." — 폼을 오르내리게 만든다. (2026-08-27 감사)
    if (!nickname.trim()) return failSignup('닉네임을 입력해주세요.', 'signup-modal-nickname');
    if (nickname.trim().length > 20) return failSignup('닉네임은 20자 이하로 입력해주세요.', 'signup-modal-nickname');

    if (!email.trim()) return failSignup('이메일을 입력해주세요.', 'signup-modal-email');
    if (!isValidEmail(email)) return failSignup(EMAIL_FORMAT_ERROR, 'signup-modal-email');

    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) return failSignup(pwCheck.error, 'signup-modal-password');
    if (password !== passwordConfirm) {
      return failSignup('비밀번호가 일치하지 않습니다.', 'signup-modal-password-confirm');
    }

    if (!keywordCategory) {
      return failSignup('활동 주제(키워드챌린지 분야)를 선택해주세요.', 'signup-modal-keyword-category');
    }

    const blogId = extractBlogId(blogInput);
    const naverId = extractNaverId(naverInput);
    if (!blogId) return failSignup('네이버 블로그 주소를 입력해주세요.', 'signup-modal-blog');
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(blogId)) {
      return failSignup('네이버 블로그 주소를 다시 확인해주세요.', 'signup-modal-blog');
    }
    if (naverId && !/^[a-zA-Z0-9._-]{2,30}$/.test(naverId)) {
      return failSignup('네이버 인플루언서홈 주소를 다시 확인해주세요.', 'signup-modal-naver');
    }

    // 동의 체크박스는 오류 상자 바로 아래에 있고 버튼도 여기서 비활성화되므로 이동시키지 않는다.
    if (!allAgreed) return failSignup('이용약관과 개인정보처리방침에 동의해주세요.');

    setSignupLoading(true);
    setSignupLoadingStep('계정 생성 중...');

    try {
      const supabase = createSupabaseBrowserClient();

      // signUp이 응답 없이 멈추면 아래 await가 끝나지 않아 버튼이 "계정 생성 중..."에
      // 무한정 멈춘다 → 타임아웃으로 강제 종료.
      // 30초: 크롤링 크론(keyword_rankings 배치 upsert)이 DB CPU를 점유하는 시간대에는
      // 단순 INSERT도 지연될 수 있어(2026-08-10 실관측, 근본 원인은 별도 트래킹) 15초보다
      // 여유를 둔다. 그래도 실패하면 재시도 1회 후에만 사용자에게 에러를 보여준다.
      const doSignUp = () =>
        withTimeout(
          supabase.auth.signUp({
            email: email.trim(),
            password,
          }),
          30000,
          '회원가입',
        );

      let authData: Awaited<ReturnType<typeof doSignUp>>['data'];
      let authError: Awaited<ReturnType<typeof doSignUp>>['error'];
      try {
        ({ data: authData, error: authError } = await doSignUp());
      } catch (err) {
        if (!(err instanceof TimeoutError)) throw err;
        setSignupLoadingStep('재시도 중...');
        ({ data: authData, error: authError } = await doSignUp());
      }

      if (authError) {
        setSignupError(mapSupabaseAuthError(authError, '회원가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'));
        return;
      }

      if (!authData.user) {
        setSignupError('회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      if (!authData.session) {
        // 세션이 없는 데는 원인이 **두 가지**인데 예전에는 둘 다 "이미 가입된 이메일"로 단정했다.
        //   1) 이미 가입된 이메일  → Supabase 가 계정 존재를 숨기려고 identities 를 빈 배열로 준다.
        //   2) 이메일 확인이 켜져 있음 → 정상 신규 가입이고 메일함의 링크를 눌러야 한다.
        // Confirm email 설정이 켜지는 순간 2)가 전부 1)로 오인돼 **모든 신규 가입자**가
        // "이미 가입된 이메일"을 보게 된다. 실제로는 메일만 확인하면 되는 상황인데도.
        const looksAlreadyRegistered = (authData.user.identities?.length ?? 0) === 0;
        setSignupError(
          looksAlreadyRegistered
            ? '이미 가입된 이메일입니다. 로그인 탭에서 로그인해주세요.'
            : '가입 확인 메일을 보냈습니다. 메일함(스팸함 포함)에서 링크를 누르면 가입이 완료됩니다.',
        );
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
        const data = await res.json().catch(() => ({}));
        await supabase.auth.signOut();
        const reason = typeof data.error === 'string' && data.error ? data.error : '프로필 생성에 실패했습니다.';
        // 409 = 닉네임·블로그 중복. 서버가 방금 만든 auth 계정을 지우므로 같은 이메일로 다시
        // 가입할 수 있다 — 그 사실을 알려주지 않으면 사용자는 "이미 가입된 이메일" 과
        // "가입이 완료되지 않은 계정" 사이를 오가며 영영 빠져나오지 못한다.
        setSignupError(
          res.status === 409
            ? `${reason} 값을 바꿔서 다시 "가입하기"를 눌러주세요. (같은 이메일로 다시 가입할 수 있습니다.)`
            : reason,
        );
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
    } catch (err) {
      setSignupError(
        err instanceof TimeoutError
          ? '회원가입 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '회원가입 중 오류가 발생했습니다.',
      );
    } finally {
      setSignupLoading(false);
      setSignupLoadingStep('');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnEscape
      trapFocus
      lockBodyScroll
      autoFocusFirstInput
      role="presentation"
      overlayClassName="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8 backdrop-blur-sm sm:items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'login' ? '로그인' : '회원가입'}
        className="relative w-full max-w-md rounded-lg border border-border bg-surface shadow-lg"
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
            // noValidate: 브라우저 기본 말풍선 대신 아래 오류 상자 한 곳으로만 안내한다.
            // (이유는 lib/validations/auth.ts 의 isValidEmail 주석 참고)
            <form onSubmit={handleLogin} noValidate className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">이메일</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  autoComplete="email"
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
                  autoComplete="current-password"
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

              <GoogleLoginButton
                onClick={handleGoogleLogin}
                loading={googleLoading}
                disabled={loginLoading}
                fullWidth
              />
            </form>
          ) : (
            // 예전에는 <div> 라 Enter 키가 아무 일도 하지 않았다. 로그인 탭은 Enter 가 되는데
            // 회원가입만 안 되니 사용자는 "가입 버튼이 고장났다"고 느꼈다.
            <form
              onSubmit={(e) => { e.preventDefault(); handleSignup(); }}
              noValidate
              className="space-y-4"
            >
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">닉네임<RequiredMark /></label>
                <input
                  id="signup-modal-nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  autoComplete="nickname"
                  placeholder="닉네임을 입력해주세요"
                  maxLength={20}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                {signupFieldError('signup-modal-nickname')}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">이메일<RequiredMark /></label>
                <input
                  id="signup-modal-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="example@email.com"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                {signupFieldError('signup-modal-email')}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">비밀번호<RequiredMark /></label>
                <input
                  id="signup-modal-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={PASSWORD_PLACEHOLDER}
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                {/* 규칙이 placeholder 에만 있으면 한 글자 입력하는 순간 사라진다 →
                    다 채우고 "가입하기"를 누른 뒤에야 "숫자를 포함해주세요"를 보게 된다.
                    입력 중에도 무엇이 남았는지 보이도록 상시 표기한다. */}
                {/* 이 줄이 이미 비밀번호 상태를 상시 안내하므로 signupFieldError 로 같은 말을
                    한 줄 더 붙이지 않는다. 대신 이 칸이 지목되면 회색 → 빨강으로만 바꾼다. */}
                <p className={`mt-1.5 text-[11px] ${(password && !validatePassword(password).ok) || signupErrorField?.id === 'signup-modal-password' ? 'text-down' : 'text-dim'}`}>
                  {password
                    ? (validatePassword(password).ok
                        ? '사용할 수 있는 비밀번호입니다.'
                        : (validatePassword(password) as { ok: false; error: string }).error)
                    : `${PASSWORD_PLACEHOLDER}으로 입력해주세요.`}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">비밀번호 확인<RequiredMark /></label>
                <input
                  id="signup-modal-password-confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="비밀번호를 다시 입력해주세요"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                {/* 불일치를 제출한 뒤에야 알려주면 처음부터 다시 입력해야 한다.
                    확인칸이 비어 있으면 이 줄은 안 나오므로 그때는 signupFieldError 가 맡는다. */}
                {passwordConfirm && password !== passwordConfirm ? (
                  <p className="mt-1.5 text-[11px] text-down">비밀번호가 일치하지 않습니다.</p>
                ) : signupFieldError('signup-modal-password-confirm')}
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
                  className={`w-full cursor-pointer appearance-auto rounded-lg border border-border bg-surface px-4 py-3 text-sm transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${
                    keywordCategory ? 'text-text' : 'text-dim'
                  }`}
                >
                  <option value="">주제를 선택하세요</option>
                  {KEYWORD_CHALLENGE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {signupFieldError('signup-modal-keyword-category')}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">네이버 블로그 주소<RequiredMark /></label>
                <input
                  id="signup-modal-blog"
                  type="text"
                  value={blogInput}
                  onChange={(e) => setBlogInput(e.target.value)}
                  placeholder="blog.naver.com/blogid 또는 blogid"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                {signupFieldError('signup-modal-blog')}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-dim">
                  네이버 인플루언서홈 주소 <span className="font-normal text-dim/60">(선택)</span>
                </label>
                <input
                  id="signup-modal-naver"
                  type="text"
                  value={naverInput}
                  onChange={(e) => setNaverInput(e.target.value)}
                  placeholder="in.naver.com/naverid 또는 naverid"
                  className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                {signupFieldError('signup-modal-naver')}
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
                type="submit"
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

              <p className="text-center text-sm text-dim">
                이미 계정이 있으신가요?{' '}
                <button type="button" onClick={() => switchMode('login')} className="cursor-pointer text-accent underline hover:text-accent-hover">
                  로그인
                </button>
              </p>

              {/* 기업/기관 고객 분기 — 개인 가입 흐름은 위에서 그대로 끝나고, 여기서는 안내만 한다 */}
              <div className="rounded-xl border border-border bg-bg p-4 text-center">
                <p className="text-xs font-bold text-text">기업/기관으로 이용하시나요?</p>
                <p className="mt-1 text-[11px] leading-relaxed text-dim">
                  기업 고객은 기업용 문의를 통해 이용 환경과 필요한 기능을 상담받으실 수 있습니다.
                </p>
                <Link
                  href="/enterprise"
                  onClick={handleClose}
                  className="mt-3 inline-block rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-2 transition hover:border-accent/40 hover:text-accent"
                >
                  기업용 문의하기
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

      <LegalModal open={showTerms} title="이용약관" onClose={() => setShowTerms(false)}>
        <TermsContent />
      </LegalModal>
      <LegalModal open={showPrivacy} title="개인정보처리방침" onClose={() => setShowPrivacy(false)}>
        <PrivacyContent />
      </LegalModal>
    </Modal>
  );
}
