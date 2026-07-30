'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface GoogleLoginButtonProps {
  /** OAuth 콜백 이후 이동할 경로. 미지정 시 클릭 시점의 현재 경로를 유지한다. */
  redirectTo?: string;
  /** 커스텀 클릭 핸들러. 지정하지 않으면 Supabase Google OAuth를 직접 호출한다
   *  (AuthModal처럼 자체 로딩/에러 상태를 관리하는 화면에서 재사용하기 위한 확장 포인트). */
  onClick?: () => void | Promise<void>;
  /** 외부에서 로딩 상태(스피너 표시 포함)를 제어하고 싶을 때 사용. 미지정 시 내부 상태를 사용한다. */
  loading?: boolean;
  /** 스피너 없이 버튼만 비활성화하고 싶을 때 (예: 다른 폼이 제출 중인 경우) */
  disabled?: boolean;
  label?: string;
  fullWidth?: boolean;
  className?: string;
}

/** 전 화면 공용 Google 로그인 버튼 — Google Brand Guideline 준수(흰 배경/회색 보더/최소 그림자).
 * 로그인 성공 이후 흐름(세션 생성 → 콜백 → users 조회)은 기존 로직을 그대로 사용한다. */
export default function GoogleLoginButton({
  redirectTo,
  onClick,
  loading: externalLoading,
  disabled = false,
  label = 'Google로 시작하기',
  fullWidth = false,
  className = '',
}: GoogleLoginButtonProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const [error, setError] = useState('');
  const loading = externalLoading ?? internalLoading;
  const isDisabled = loading || disabled;

  async function handleClick() {
    if (onClick) {
      await onClick();
      return;
    }
    setError('');
    setInternalLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const next = redirectTo || window.location.pathname;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (oauthError) {
        setError(oauthError.message);
        setInternalLoading(false);
      }
    } catch {
      setError('Google 로그인 중 오류가 발생했습니다.');
      setInternalLoading(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isDisabled}
        aria-label="Google 계정으로 로그인"
        className={`inline-flex items-center justify-center gap-3 rounded-xl border border-[#DADCE0] bg-white px-5 py-2.5 text-sm font-medium text-[#3C4043] shadow-sm transition-colors hover:bg-[#F8F9FA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${fullWidth ? 'w-full' : ''}`}
      >
        {loading ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" aria-hidden />
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden focusable="false" className="shrink-0">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
          </svg>
        )}
        <span className="whitespace-nowrap">{loading ? '이동 중...' : label}</span>
      </button>
      {error && <p className="mt-2 text-center text-xs text-down">{error}</p>}
    </div>
  );
}
