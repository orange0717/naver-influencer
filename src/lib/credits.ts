/**
 * credits.ts — N인플 크레딧 차감 엔진 (Service Role 전용)
 *
 * 구독제와 병행하는 크레딧(사용량) 시스템의 서버 로직.
 * API 라우트에서만 import (Service Role 키 사용).
 *
 * 원칙 (명세 STEP 5~7):
 *  - 크레딧은 고비용 기능에만 사용한다 (credit-config.ts CREDIT_COSTS).
 *  - 실제 API 요청이 "성공한 뒤" 차감한다 (요청 전 무조건 차감 금지).
 *  - 잔액 부족은 "구독 필요"가 아니라 "크레딧 부족"으로 정확히 안내한다.
 */

import { createServiceClient } from '@/lib/supabase-server';
import { type CreditFeature } from '@/lib/credit-config';
import { getCreditCost, getSignupBonusCredits } from '@/lib/settings';

/** 크레딧 부족 시 API 가 내려줄 표준 응답 바디 (명세 6: "크레딧이 부족합니다") */
export interface InsufficientCreditBody {
  code: 'insufficient_credit';
  error: string;
  required: number;
  balance: number;
}

export function insufficientCreditBody(required: number, balance: number): InsufficientCreditBody {
  return {
    code: 'insufficient_credit',
    error: '크레딧이 부족합니다.',
    required,
    balance,
  };
}

/**
 * 잔액 조회. 크레딧 계정이 없으면 최초 1회 생성하며 가입 보너스를 지급한다(멱등).
 */
export async function getCreditBalance(authUserId: string): Promise<number> {
  const supa = createServiceClient();
  const signupBonus = await getSignupBonusCredits();
  const { data, error } = await supa.rpc('ensure_credit_account', {
    p_user_id: authUserId,
    p_signup_bonus: signupBonus,
  });
  if (error) {
    console.error('[Credits] ensure_credit_account failed:', error);
    // 폴백: 단순 조회
    const { data: bal } = await supa.rpc('get_credit_balance', { p_user_id: authUserId });
    return Number(bal ?? 0);
  }
  return Number(data ?? 0);
}

/** 기능 실행 전 잔액이 충분한지 확인(차감하지 않음). 명세 STEP 5. */
export async function hasEnoughCredit(
  authUserId: string,
  feature: CreditFeature,
): Promise<{ ok: boolean; balance: number; required: number }> {
  const required = await getCreditCost(feature);
  const balance = await getCreditBalance(authUserId);
  return { ok: balance >= required, balance, required };
}

/**
 * 기능 사용 크레딧 차감 (API 성공 후 호출 — 명세 STEP 7).
 * 원자적. 잔액 부족 시 차감하지 않고 ok:false 를 반환한다.
 *
 * @param referenceId 멱등 키. 동일 요청 재시도 시 중복 차감을 막는다.
 *                    (예: `${feature}:${crypto.randomUUID()}` 또는 요청 고유 id)
 */
export async function chargeCredit(
  authUserId: string,
  feature: CreditFeature,
  opts?: { referenceId?: string; amountOverride?: number },
): Promise<
  | { ok: true; balance: number; charged: number; idempotent?: boolean }
  | { ok: false; reason: 'insufficient_credit'; balance: number; required: number }
> {
  const amount = opts?.amountOverride ?? (await getCreditCost(feature));
  const supa = createServiceClient();

  // 계정 보장(가입 보너스 포함) — 신규 사용자가 첫 기능에서 계정 없이 실패하지 않도록.
  await getCreditBalance(authUserId);

  const { data, error } = await supa.rpc('use_credit', {
    p_user_id: authUserId,
    p_amount: amount,
    p_feature: feature,
    p_reference_id: opts?.referenceId ?? null,
  });

  if (error) {
    console.error('[Credits] use_credit failed:', error, { authUserId, feature, amount });
    // 차감 실패는 기능을 막지 않되(이미 API 는 성공했으므로), 운영자가 원장에서 보정.
    // 잔액은 그대로 반환.
    const balance = await getCreditBalance(authUserId);
    return { ok: true, balance, charged: 0 };
  }

  const res = data as {
    ok: boolean;
    balance: number;
    charged?: number;
    reason?: string;
    required?: number;
    idempotent?: boolean;
  };

  if (!res.ok) {
    return {
      ok: false,
      reason: 'insufficient_credit',
      balance: Number(res.balance ?? 0),
      required: Number(res.required ?? amount),
    };
  }

  return {
    ok: true,
    balance: Number(res.balance ?? 0),
    charged: Number(res.charged ?? 0),
    idempotent: res.idempotent,
  };
}

/**
 * 크레딧 적립 (구독 지급/충전/보정/환불). 멱등(referenceId 중복 시 재지급 안 함).
 */
export async function grantCredit(
  authUserId: string,
  amount: number,
  type: 'subscription_grant' | 'purchase' | 'admin_adjust' | 'refund',
  opts?: { referenceId?: string; feature?: string },
): Promise<number> {
  if (amount <= 0) return getCreditBalance(authUserId);
  const supa = createServiceClient();
  const { data, error } = await supa.rpc('add_credit', {
    p_user_id: authUserId,
    p_amount: amount,
    p_type: type,
    p_feature: opts?.feature ?? null,
    p_reference_id: opts?.referenceId ?? null,
  });
  if (error) {
    console.error('[Credits] add_credit failed:', error, { authUserId, amount, type });
    return getCreditBalance(authUserId);
  }
  return Number(data ?? 0);
}
