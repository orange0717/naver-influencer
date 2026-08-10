'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * PRO 전용 페이지에 PRO 이용권 없이 접근했을 때 뜨는 게이트 모달의 상태.
 * (2026-08-08 이전에는 "7일 체험 종료/미개시" 두 가지 사유가 있었으나, 자가발급 체험이
 *  폐지되면서 "PRO 이용권이 필요합니다" 단일 안내로 단순화됨 — reason 구분 없음.)
 */
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
