'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * 'ended'  — 체험/결제를 이미 받아본 적 있고 지금은 만료됨 → 구매 유도만 (자가발급 체험 없음)
 * 'offer'  — subscription_plan 이 한 번도 없던 회원(가입 시점에 체험을 못 받은 기존 가입자 등)
 *            → "7일 무료체험을 시작하시겠습니까?" 자가발급 옵트인 모달
 */
export type TrialGateReason = 'ended' | 'offer';

interface TrialEndedGateState {
  open: boolean;
  redirectTo: string | null;
  reason: TrialGateReason;
}

interface TrialEndedGateContextValue extends TrialEndedGateState {
  openGate: (redirectTo?: string, reason?: TrialGateReason) => void;
  close: () => void;
}

const TrialEndedGateContext = createContext<TrialEndedGateContextValue | null>(null);

export function TrialEndedGateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrialEndedGateState>({ open: false, redirectTo: null, reason: 'ended' });

  const openGate = useCallback((redirectTo?: string, reason: TrialGateReason = 'ended') => {
    setState({ open: true, redirectTo: redirectTo ?? null, reason });
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
