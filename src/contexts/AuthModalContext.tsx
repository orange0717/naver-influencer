'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type AuthModalMode = 'login' | 'signup' | null;

interface AuthModalState {
  mode: AuthModalMode;
  redirectTo: string | null;
  reason: string | null;
}

interface OpenOptions {
  redirectTo?: string;
  reason?: string;
}

interface AuthModalContextValue extends AuthModalState {
  openLogin: (opts?: OpenOptions) => void;
  openSignup: (opts?: OpenOptions) => void;
  /** 모달 내부 로그인 ↔ 회원가입 전환. redirectTo/reason은 유지한다. */
  switchMode: (mode: 'login' | 'signup') => void;
  close: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthModalState>({ mode: null, redirectTo: null, reason: null });

  const openLogin = useCallback((opts?: OpenOptions) => {
    setState({ mode: 'login', redirectTo: opts?.redirectTo ?? null, reason: opts?.reason ?? null });
  }, []);

  const openSignup = useCallback((opts?: OpenOptions) => {
    setState({ mode: 'signup', redirectTo: opts?.redirectTo ?? null, reason: opts?.reason ?? null });
  }, []);

  const switchMode = useCallback((mode: 'login' | 'signup') => {
    setState((s) => ({ ...s, mode }));
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, mode: null }));
  }, []);

  const value = useMemo(
    () => ({ ...state, openLogin, openSignup, switchMode, close }),
    [state, openLogin, openSignup, switchMode, close],
  );

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal은 AuthModalProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
