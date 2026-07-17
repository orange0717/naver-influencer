'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface MemberOnlyGateState {
  open: boolean;
  redirectTo: string | null;
}

interface MemberOnlyGateContextValue extends MemberOnlyGateState {
  openGate: (redirectTo?: string) => void;
  close: () => void;
}

const MemberOnlyGateContext = createContext<MemberOnlyGateContextValue | null>(null);

export function MemberOnlyGateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MemberOnlyGateState>({ open: false, redirectTo: null });

  const openGate = useCallback((redirectTo?: string) => {
    setState({ open: true, redirectTo: redirectTo ?? null });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const value = useMemo(() => ({ ...state, openGate, close }), [state, openGate, close]);

  return <MemberOnlyGateContext.Provider value={value}>{children}</MemberOnlyGateContext.Provider>;
}

export function useMemberOnlyGate() {
  const ctx = useContext(MemberOnlyGateContext);
  if (!ctx) throw new Error('useMemberOnlyGate는 MemberOnlyGateProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
