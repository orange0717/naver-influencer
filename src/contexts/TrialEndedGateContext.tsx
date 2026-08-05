'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface TrialEndedGateState {
  open: boolean;
  redirectTo: string | null;
}

interface TrialEndedGateContextValue extends TrialEndedGateState {
  openGate: (redirectTo?: string) => void;
  close: () => void;
}

const TrialEndedGateContext = createContext<TrialEndedGateContextValue | null>(null);

export function TrialEndedGateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrialEndedGateState>({ open: false, redirectTo: null });

  const openGate = useCallback((redirectTo?: string) => {
    setState({ open: true, redirectTo: redirectTo ?? null });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const value = useMemo(() => ({ ...state, openGate, close }), [state, openGate, close]);

  return <TrialEndedGateContext.Provider value={value}>{children}</TrialEndedGateContext.Provider>;
}

export function useTrialEndedGate() {
  const ctx = useContext(TrialEndedGateContext);
  if (!ctx) throw new Error('useTrialEndedGate는 TrialEndedGateProvider 내부에서만 사용할 수 있습니다.');
  return ctx;
}
