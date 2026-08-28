/**
 * enterprise-billing.ts — 기업 주문 결제 확정 (Service Role 전용)
 *
 * 빌링키(자동청구)를 쓰지 않는다. 현재 PG 채널(KPN)이 빌링키를 지원하지 않아
 * 월 선불 1회성 결제로 운영하며, 다음 달 이용은 만료 안내 후 직접 재결제한다.
 *
 * 결제 확정 경로가 둘(클라이언트 complete 콜백 / PortOne 웹훅)이므로 이 함수는
 * 반드시 멱등해야 한다. 이미 paid 인 주문은 아무것도 하지 않고 성공으로 끝난다.
 */

import { createServiceClient } from '@/lib/supabase-server';
import { getPayment } from '@/lib/portone';
import { PLAN_TIER, calcNextBillingAt, isPlanId, type PlanId } from '@/lib/pricing';
import { createInviteToken, inviteExpiresAt } from '@/lib/enterprise-invite';
import { sendOrgInviteEmail } from '@/lib/email';

/** KPN PG 제약(영숫자 32바이트 이하)에 맞춘 결제 식별자. 개인 결제와 같은 규칙을 쓴다. */
export function newOrgPaymentId(): string {
  return 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

type ActivateResult = { ok: true; orgId: string } | { ok: false; error: string };

export async function activateOrgOrder(paymentId: string): Promise<ActivateResult> {
  const supa = createServiceClient();

  const { data: order } = await supa
    .from('enterprise_orders')
    .select('id, org_id, kind, plan_id, seat_count, amount, status')
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (!order) return { ok: false, error: '주문을 찾을 수 없습니다.' };
  if (order.status === 'paid') return { ok: true, orgId: order.org_id };

  // 클라이언트 말이 아니라 PG 에 직접 물어본 결과로만 확정한다.
  const payment = await getPayment(paymentId);
  if (!payment) return { ok: false, error: '결제 정보를 조회할 수 없습니다.' };
  if (payment.status !== 'PAID') {
    return { ok: false, error: `결제가 완료되지 않았습니다. (status=${payment.status})` };
  }
  if (Number(payment.amount?.total) !== Number(order.amount)) {
    console.error('[enterprise-billing] amount mismatch:', {
      paid: payment.amount?.total,
      order: order.amount,
      paymentId,
    });
    return { ok: false, error: '결제 금액이 일치하지 않습니다.' };
  }

  const planId = order.plan_id as PlanId;
  if (!isPlanId(planId)) return { ok: false, error: '유효하지 않은 요금제입니다.' };

  const now = new Date();
  const periodEnd = calcNextBillingAt(now);

  const { error: orderUpdateError } = await supa
    .from('enterprise_orders')
    .update({ status: 'paid', paid_at: now.toISOString() })
    .eq('id', order.id)
    .neq('status', 'paid');

  if (orderUpdateError) {
    console.error('[enterprise-billing] order update failed:', orderUpdateError.message);
    return { ok: false, error: '주문 상태를 갱신하지 못했습니다.' };
  }

  const { error: orgUpdateError } = await supa
    .from('enterprise_orgs')
    .update({
      status: 'active',
      plan_id: planId,
      seat_limit: order.seat_count,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    })
    .eq('id', order.org_id);

  if (orgUpdateError) {
    console.error('[enterprise-billing] org activation failed:', orgUpdateError.message);
    return { ok: false, error: '기업 계정을 활성화하지 못했습니다.' };
  }

  await syncOrgSeatEntitlements(order.org_id);

  // 메일 발송이 실패해도 결제는 이미 확정됐다. 여기서 실패를 던지면 재시도 때
  // 결제가 다시 일어날 수 있으므로 로그만 남기고 성공으로 끝낸다(재발송은 관리 화면에서).
  if (order.kind === 'initial') {
    await sendPendingInvites(order.org_id).catch((e) => {
      console.error('[enterprise-billing] invite send failed:', e);
    });
  }

  return { ok: true, orgId: order.org_id };
}

/**
 * 좌석 보유자에게 플랜 등급을 반영한다.
 * 기업 전용 기능표를 따로 두지 않고 개인 요금제의 티어 게이팅을 그대로 재사용하므로,
 * users.subscription_plan / subscription_expires_at 를 갱신하는 것이 곧 권한 부여다.
 */
export async function syncOrgSeatEntitlements(orgId: string): Promise<void> {
  const supa = createServiceClient();

  const { data: org } = await supa
    .from('enterprise_orgs')
    .select('plan_id, status, current_period_end')
    .eq('id', orgId)
    .maybeSingle();

  if (!org || !isPlanId(org.plan_id) || org.status !== 'active' || !org.current_period_end) return;

  const { data: members } = await supa
    .from('enterprise_org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('status', 'active');

  if (!members?.length) return;

  const { error } = await supa
    .from('users')
    .update({
      subscription_plan: PLAN_TIER[org.plan_id].toUpperCase(),
      subscription_expires_at: org.current_period_end,
    })
    .in('id', members.map((m) => m.user_id));

  if (error) console.error('[enterprise-billing] seat entitlement sync failed:', error.message);
}

/**
 * 아직 보내지 않은 초대를 발송한다. 원문 토큰은 이 시점에 새로 만들어 메일로만 내보내고
 * DB 에는 해시만 갱신한다 — 결제 전에 만들어 둔 해시로는 아무도 수락할 수 없다.
 */
export async function sendPendingInvites(orgId: string): Promise<void> {
  const supa = createServiceClient();

  const { data: org } = await supa
    .from('enterprise_orgs')
    .select('company_name')
    .eq('id', orgId)
    .maybeSingle();

  const { data: invites } = await supa
    .from('enterprise_org_invites')
    .select('id, email')
    .eq('org_id', orgId)
    .eq('status', 'pending')
    .is('sent_at', null);

  if (!invites?.length) return;

  const expiresAt = inviteExpiresAt().toISOString();

  for (const invite of invites) {
    const { token, tokenHash } = createInviteToken();

    const { error: updateError } = await supa
      .from('enterprise_org_invites')
      .update({ token_hash: tokenHash, expires_at: expiresAt, sent_at: new Date().toISOString() })
      .eq('id', invite.id)
      .is('sent_at', null);

    // sent_at 조건이 걸려 있어 동시에 두 경로가 들어와도 메일은 한 번만 나간다.
    if (updateError) {
      console.error('[enterprise-billing] invite token rotation failed:', updateError.message);
      continue;
    }

    try {
      await sendOrgInviteEmail(invite.email, org?.company_name ?? '기업', token);
    } catch (e) {
      console.error('[enterprise-billing] invite email failed:', invite.email, e);
    }
  }
}
