/**
 * billing.ts — N인플 구독 비즈니스 로직 (Service Role 전용)
 *
 * subscriptions / payment_intents / payment_transactions 를 통합 관리.
 * API 라우트에서만 import (Service Role 키 사용).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPlan, calculateNextChargeAt, type PlanKey } from '@/lib/payment-config';
import {
  preRegisterPayment,
  chargeWithBillingKey,
  getBillingKey,
  deleteBillingKey as portoneDeleteBillingKey,
  type BillingChargeResult,
} from '@/lib/portone';

const MAX_FAILED_CHARGES = 3;

/**
 * KPN PG 규칙: 영숫자만 + 32바이트 이하.
 * 우리는 'b'(빌링키 발급) 또는 'p'(청구) + UUID 24자 = 25자로 발급한다.
 * 외부에서 paymentId 를 인입받는 곳(웹훅 등)에서 형식을 미리 검증해
 * 잘못된 식별자가 SQL 쿼리·로깅에 도달하는 걸 차단한다.
 */
export const PAYMENT_ID_REGEX = /^[a-z0-9]{25}$/;

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role not configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/* ── 빌링키 발급용 사전등록 (amount=0, type='issue') ───────────────────
   클라이언트가 PortOne.requestIssueBillingKey 호출 직전에 받는 paymentId. */
export async function preparePortoneIssue(
  userId: string,
  planKey: string
): Promise<{ paymentId: string; planName: string } | { error: string }> {
  const plan = getPlan(planKey);
  if (!plan) return { error: '유효하지 않은 플랜입니다.' };

  // KPN PG 제약: 영숫자만 + 32바이트 이하 → 'b' (1) + UUID 24자 = 25자
  const paymentId = 'b' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  // pre-register 는 amount=0 도 허용. PortOne 빌링키 발급은 별도 API 라 pre-register 생략 가능.
  // 단, payment_intents 에 발급용 레코드는 남겨 추적 가능하게.
  const supa = adminClient();
  const { error } = await supa.from('payment_intents').insert({
    payment_id: paymentId,
    user_id: userId,
    plan_key: planKey,
    amount: 0,
    type: 'issue',
  });
  if (error) {
    console.error('[Billing] intent insert failed:', error);
    return { error: '결제 준비 중 오류가 발생했습니다.' };
  }
  return { paymentId, planName: plan.name };
}

/* ── 빌링키 발급 완료 → 구독 생성 + 첫 결제 ──────────────────────────── */
export async function completeBillingKeyIssue(opts: {
  userId: string;
  billingKey: string;
  planKey: string;
}): Promise<{ ok: true; subscriptionId: string; firstChargeOk: boolean; error?: string } | { ok: false; error: string }> {
  const plan = getPlan(opts.planKey);
  if (!plan) return { ok: false, error: '유효하지 않은 플랜입니다.' };

  // 1. PortOne 측 빌링키 검증
  const bk = await getBillingKey(opts.billingKey);
  if (!bk || bk.status !== 'ISSUED') {
    return { ok: false, error: '빌링키 검증에 실패했습니다.' };
  }

  const supa = adminClient();

  // 2. 기존 active/pending 구독 정리 (한 user 한 active 정책)
  await supa
    .from('subscriptions')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('user_id', opts.userId)
    .in('status', ['pending', 'active', 'past_due']);

  // 3. 새 구독 생성 (status='pending')
  const { data: sub, error: insErr } = await supa
    .from('subscriptions')
    .insert({
      user_id: opts.userId,
      plan_key: opts.planKey,
      billing_key: opts.billingKey,
      billing_key_issued_at: new Date().toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();
  if (insErr || !sub) {
    console.error('[Billing] subscription insert failed:', insErr);
    return { ok: false, error: '구독 생성에 실패했습니다.' };
  }

  // 4. 즉시 첫 결제 시도
  const firstCharge = await chargePlan({
    subscriptionId: sub.id,
    userId: opts.userId,
    planKey: opts.planKey,
    billingKey: opts.billingKey,
    chargeType: 'initial',
  });

  if (!firstCharge.ok) {
    // [C-1 review fix] 첫 결제 실패 시 PortOne 측 빌링키도 삭제 (orphan 방지)
    // PortOne 에 ISSUED 상태로 남으면 사용자가 재시도할 때 quasi-duplicate 누적된다.
    if (opts.billingKey) {
      await portoneDeleteBillingKey(opts.billingKey).catch((e) => {
        console.warn('[Billing] orphan billing key delete failed:', e);
      });
    }
    await supa
      .from('subscriptions')
      .update({
        status: 'cancelled',
        billing_key: null,                       // 명시적 NULL
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', sub.id);
    return { ok: true, subscriptionId: sub.id, firstChargeOk: false, error: firstCharge.error };
  }

  return { ok: true, subscriptionId: sub.id, firstChargeOk: true };
}

/* ── 빌링키로 1회 자동청구 + 구독 상태 갱신 ──────────────────────────── */
export async function chargePlan(opts: {
  subscriptionId: string;
  userId: string;
  planKey: string;
  billingKey: string;
  chargeType: 'initial' | 'recurring' | 'manual';
}): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  const plan = getPlan(opts.planKey);
  if (!plan) return { ok: false, error: '유효하지 않은 플랜입니다.' };
  const supa = adminClient();

  // KPN PG 제약: 영숫자만 + 32바이트 이하 → 'p' (1) + UUID 24자 = 25자
  const paymentId = 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);

  // [H-3 review fix] payment_intents 먼저 INSERT — DB 실패 시 PortOne pre-register 안 함.
  // 이렇게 하면 PortOne 측 orphan paymentId 가 생기지 않는다.
  const { error: intentErr } = await supa.from('payment_intents').insert({
    payment_id: paymentId,
    user_id: opts.userId,
    plan_key: opts.planKey,
    amount: plan.amount,
    type: 'charge',
  });
  if (intentErr) {
    console.error('[Billing] payment_intents insert failed:', intentErr);
    return { ok: false, error: '결제 준비 중 오류가 발생했습니다.' };
  }

  // PortOne pre-register (금액 잠금)
  const pre = await preRegisterPayment(paymentId, plan.amount);
  if (!pre.ok) {
    // intent 는 30분 후 cleanup_expired_payment_intents() 가 자동 정리.
    return { ok: false, error: '결제 게이트웨이 오류. 잠시 후 다시 시도해주세요.' };
  }

  // 2. PortOne 빌링키 결제
  const result: BillingChargeResult = await chargeWithBillingKey({
    paymentId,
    billingKey: opts.billingKey,
    orderName: plan.name,
    totalAmount: plan.amount,
    customer: { id: opts.userId },
  });

  if (!result.ok) {
    // 실패: 구독 failed_charge_count 증가, 3회 도달 시 past_due → cancelled
    await handleChargeFailure(opts.subscriptionId);
    return { ok: false, error: result.error || '결제에 실패했습니다.' };
  }

  // 3. 트랜잭션 기록 (멱등성: payment_id UNIQUE)
  await supa.from('payment_transactions').insert({
    user_id: opts.userId,
    payment_id: paymentId,
    transaction_id: result.transactionId || null,
    plan_key: opts.planKey,
    amount: plan.amount,
    status: 'PAID',
    pay_method: 'BILLING_KEY',
    charge_type: opts.chargeType,
    billing_key: opts.billingKey,
    raw_response: result.raw as object,
  });

  // 4. 구독 active + 다음 청구일 설정
  const now = new Date();
  const nextEnd = calculateNextChargeAt(now, plan.months);
  await supa
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: now.toISOString(),
      current_period_end: nextEnd.toISOString(),
      next_charge_at: nextEnd.toISOString(),
      last_payment_id: paymentId,
      failed_charge_count: 0,
    })
    .eq('id', opts.subscriptionId);

  // 5. users 테이블 페이월 컬럼 동기화.
  //    admin.ts 의 hasActiveSubscription / getPaywallContext / requireInfluencerPlan 가
  //    users.subscription_plan + subscription_expires_at 를 source of truth 로 읽으므로,
  //    여기서 함께 갱신하지 않으면 결제한 사용자가 계속 비구독자로 취급된다.
  const planTier = plan.tier.toUpperCase(); // 'BLOGGER' | 'INFLUENCER'
  const { error: userUpdErr } = await supa
    .from('users')
    .update({
      subscription_plan: planTier,
      subscription_expires_at: nextEnd.toISOString(),
    })
    .eq('auth_id', opts.userId);
  if (userUpdErr) {
    console.error('[Billing] users paywall sync failed:', userUpdErr, { userId: opts.userId, paymentId });
    // 결제 자체는 성공했으므로 200 흐름은 유지 — 운영자가 알림으로 수동 보정 권장.
  }

  return { ok: true, paymentId };
}

/* ── 결제 실패 처리 (failed_charge_count 누적, 3회 시 past_due → cancelled) */
async function handleChargeFailure(subscriptionId: string): Promise<void> {
  const supa = adminClient();
  const { data: sub } = await supa
    .from('subscriptions')
    .select('failed_charge_count, billing_key')
    .eq('id', subscriptionId)
    .single();
  if (!sub) return;

  const newCount = (sub.failed_charge_count || 0) + 1;
  const reachedMax = newCount >= MAX_FAILED_CHARGES;

  await supa
    .from('subscriptions')
    .update({
      failed_charge_count: newCount,
      status: reachedMax ? 'cancelled' : 'past_due',
      next_charge_at: reachedMax ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h 후 재시도
      cancelled_at: reachedMax ? new Date().toISOString() : null,
    })
    .eq('id', subscriptionId);

  // 최종 실패 시 빌링키도 정리
  if (reachedMax && sub.billing_key) {
    await portoneDeleteBillingKey(sub.billing_key).catch(() => {});
  }
}

/* ── 구독 취소 (cancel_at_period_end=true 또는 즉시 취소) ──────────── */
export async function cancelSubscription(opts: {
  userId: string;
  immediate?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const supa = adminClient();
  const { data: sub } = await supa
    .from('subscriptions')
    .select('id, billing_key, status')
    .eq('user_id', opts.userId)
    .in('status', ['active', 'pending', 'past_due'])
    .single();
  if (!sub) return { ok: false, error: '취소할 구독이 없습니다.' };

  if (opts.immediate) {
    // 즉시 취소: 빌링키 삭제 + status='cancelled'
    if (sub.billing_key) {
      await portoneDeleteBillingKey(sub.billing_key).catch(() => {});
    }
    await supa
      .from('subscriptions')
      .update({
        status: 'cancelled',
        billing_key: null,
        cancelled_at: new Date().toISOString(),
        next_charge_at: null,
      })
      .eq('id', sub.id);
  } else {
    // 기간 만료 후 취소: cancel_at_period_end=true. 다음 cron 시 next_charge_at 도래해도 청구 X.
    await supa
      .from('subscriptions')
      .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
      .eq('id', sub.id);
  }
  return { ok: true };
}

/* ── 자동청구 cron 진입점: 만료 임박 active 구독 batch 청구 ──────────── */
const CRON_LOCK_KEY = 'cron:charge-recurring';
const CRON_LOCK_TTL_SECONDS = 600; // 10분 (Pro maxDuration 5분 + 여유)

export async function runRecurringCharges(limit: number = 100): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{ subscriptionId: string; ok: boolean; error?: string }>;
  lockSkipped?: boolean;
}> {
  const supa = adminClient();

  // [H-1 review fix] cron 동시 실행 방지 — cron_locks 테이블 mutex
  const { data: lockAcquired, error: lockErr } = await supa.rpc('try_acquire_cron_lock', {
    p_key: CRON_LOCK_KEY,
    p_ttl_seconds: CRON_LOCK_TTL_SECONDS,
  });
  if (lockErr) {
    console.error('[Billing] cron lock acquire failed:', lockErr);
    return { processed: 0, succeeded: 0, failed: 0, results: [] };
  }
  if (!lockAcquired) {
    console.log('[Billing] cron lock already held — skipping this run');
    return { processed: 0, succeeded: 0, failed: 0, results: [], lockSkipped: true };
  }

  try {
    const { data: due, error } = await supa.rpc('get_subscriptions_due_for_charge', { p_limit: limit });
    if (error) {
      console.error('[Billing] cron rpc failed:', error);
      return { processed: 0, succeeded: 0, failed: 0, results: [] };
    }
    if (!due || due.length === 0) return { processed: 0, succeeded: 0, failed: 0, results: [] };

    const results: Array<{ subscriptionId: string; ok: boolean; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const row of due as Array<{ id: string; user_id: string; plan_key: PlanKey; billing_key: string }>) {
      const r = await chargePlan({
        subscriptionId: row.id,
        userId: row.user_id,
        planKey: row.plan_key,
        billingKey: row.billing_key,
        chargeType: 'recurring',
      });
      if (r.ok) {
        succeeded++;
        results.push({ subscriptionId: row.id, ok: true });
      } else {
        failed++;
        results.push({ subscriptionId: row.id, ok: false, error: r.error });
      }
    }

    return { processed: due.length, succeeded, failed, results };
  } finally {
    try {
      await supa.rpc('release_cron_lock', { p_key: CRON_LOCK_KEY });
    } catch (e) {
      console.error('[Billing] cron lock release failed:', e);
    }
  }
}
