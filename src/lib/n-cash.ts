/**
 * n-cash.ts — N캐시(보상 포인트) 엔진 (Service Role 전용)
 *
 * 구독 결제 시 결제금액의 일정 비율(settings.getNcashAccrualRate, 기본 10%)을 적립하고,
 * 크레딧 구매에 사용한다. 1 N캐시 = 1원. 현금 환급 없음(내부 리워드 전용).
 * credits.ts 와 동일한 멱등/원자성 패턴 — 별도 원장(migration-151).
 *
 * API 라우트/서버 로직에서만 import (Service Role 키 사용).
 */
import { createServiceClient } from '@/lib/supabase-server';
import { getNcashAccrualRate } from '@/lib/settings';

export type NcashTxType = 'subscription_accrual' | 'credit_purchase' | 'admin_adjust' | 'refund';

/** 잔액 조회. */
export async function getNcashBalance(authUserId: string): Promise<number> {
  const supa = createServiceClient();
  const { data, error } = await supa.rpc('get_ncash_balance', { p_user_id: authUserId });
  if (error) {
    console.error('[NCash] get_ncash_balance failed:', error, { authUserId });
    return 0;
  }
  return Number(data ?? 0);
}

/**
 * N캐시 적립. 멱등(referenceId 중복 시 재적립 안 함). amount<=0 이면 no-op.
 * @returns 적립 후 잔액
 */
export async function addNcash(
  authUserId: string,
  amount: number,
  type: NcashTxType,
  opts?: { referenceId?: string },
): Promise<number> {
  if (amount <= 0) return getNcashBalance(authUserId);
  const supa = createServiceClient();
  const { data, error } = await supa.rpc('add_ncash', {
    p_user_id: authUserId,
    p_amount: Math.floor(amount),
    p_type: type,
    p_reference_id: opts?.referenceId ?? null,
  });
  if (error) {
    console.error('[NCash] add_ncash failed:', error, { authUserId, amount, type });
    return getNcashBalance(authUserId);
  }
  return Number(data ?? 0);
}

/**
 * 결제금액 대비 적립할 N캐시 양을 계산한다(원 단위 내림). settings 의 적립률 사용.
 * 예) 9,900원 × 0.10 = 990.
 */
export async function calcAccrual(paidAmount: number): Promise<number> {
  const rate = await getNcashAccrualRate();
  return Math.floor(Math.max(0, paidAmount) * rate);
}

/**
 * 구독 결제 성공 시 N캐시 적립(멱등 — payment_id 기준). 실패는 결제를 막지 않는다.
 * billing.ts 결제/갱신 성공 지점에서 호출.
 */
export async function accrueSubscriptionNcash(
  authUserId: string,
  paidAmount: number,
  paymentId: string,
): Promise<void> {
  try {
    const amount = await calcAccrual(paidAmount);
    if (amount <= 0) return;
    await addNcash(authUserId, amount, 'subscription_accrual', { referenceId: `ncash:${paymentId}` });
  } catch (e) {
    console.error('[NCash] accrueSubscriptionNcash failed:', e, { authUserId, paymentId });
  }
}

/**
 * N캐시 사용(차감). 원자적. 잔액 부족 시 차감하지 않고 ok:false 반환.
 * @param referenceId 멱등 키(중복 차감 방지). 크레딧 구매 트랜잭션 id 등.
 */
export async function spendNcash(
  authUserId: string,
  amount: number,
  type: NcashTxType,
  opts?: { referenceId?: string },
): Promise<
  | { ok: true; balance: number; charged: number; idempotent?: boolean }
  | { ok: false; reason: 'insufficient_ncash'; balance: number; required: number }
> {
  const supa = createServiceClient();
  const { data, error } = await supa.rpc('use_ncash', {
    p_user_id: authUserId,
    p_amount: Math.floor(amount),
    p_type: type,
    p_reference_id: opts?.referenceId ?? null,
  });
  if (error) {
    console.error('[NCash] use_ncash failed:', error, { authUserId, amount, type });
    // 차감 RPC 자체가 실패하면 안전하게 실패로 취급(구매를 진행시키지 않음)
    const balance = await getNcashBalance(authUserId);
    return { ok: false, reason: 'insufficient_ncash', balance, required: Math.floor(amount) };
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
      reason: 'insufficient_ncash',
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
