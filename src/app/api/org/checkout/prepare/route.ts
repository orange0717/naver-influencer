import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { orgError } from '@/lib/enterprise-org';
import { activateOrgOrder, newOrgPaymentId } from '@/lib/enterprise-billing';
import { getPayment, preRegisterPayment } from '@/lib/portone';
import { CURRENCY, PLAN_LABEL, isPlanId } from '@/lib/pricing';

/**
 * POST /api/org/checkout/prepare — 결제창을 띄우기 직전 단계.
 *
 * 청구 금액은 저장된 주문에서만 읽는다. 클라이언트는 어떤 주문인지만 지목할 수 있다.
 * PortOne 사전등록으로 금액을 잠가 두면 결제창에서 금액을 바꿔도 승인이 거절된다.
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthUser(request).catch(() => null);
  if (!authUser) {
    return orgError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
  }

  let body: { orderId?: unknown };
  try {
    body = await request.json();
  } catch {
    return orgError('NOT_FOUND', '잘못된 요청입니다.', 400);
  }

  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  if (!orderId) return orgError('NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from('enterprise_orders')
    .select('id, org_id, plan_id, seat_count, amount, status, payment_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return orgError('NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const { data: org } = await supabase
    .from('enterprise_orgs')
    .select('id, company_name, owner_user_id')
    .eq('id', order.org_id)
    .maybeSingle();

  if (!org || org.owner_user_id !== authUser.userId) {
    return orgError('FORBIDDEN', '이 주문을 결제할 권한이 없습니다.', 403);
  }

  if (order.status === 'paid') {
    return orgError('ORG_ALREADY_ACTIVE', '이미 결제가 완료된 주문입니다.', 409);
  }
  if (order.status !== 'pending_payment') {
    return orgError('NOT_FOUND', '결제할 수 없는 주문입니다.', 409);
  }
  if (!isPlanId(order.plan_id)) {
    return orgError('INVALID_PLAN', '유효하지 않은 요금제입니다.', 409);
  }

  /**
   * 결제창을 닫았다 다시 여는 경우가 흔하다. 이때 무조건 새 paymentId 를 발급하면
   * 이전 건이 뒤늦게 승인됐을 때 주문에 남은 payment_id 와 달라 확정 경로가 그 결제를
   * 찾지 못한다 — 돈은 나가고 계정은 안 열린다. 그래서 PG 쪽 상태를 보고,
   * 아직 결제되지 않은 식별자는 그대로 재사용한다.
   */
  let paymentId = order.payment_id as string | null;
  if (paymentId) {
    const existing = await getPayment(paymentId);
    if (existing?.status === 'PAID') {
      const result = await activateOrgOrder(paymentId);
      return result.ok
        ? orgError('ORG_ALREADY_ACTIVE', '이미 결제가 완료된 주문입니다.', 409)
        : orgError('PAYMENT_VERIFY_FAILED', result.error, 409);
    }
    if (existing && existing.status !== 'READY') paymentId = null;
  }

  if (!paymentId) {
    paymentId = newOrgPaymentId();
    const { error: updateError } = await supabase
      .from('enterprise_orders')
      .update({ payment_id: paymentId })
      .eq('id', order.id)
      .eq('status', 'pending_payment');

    if (updateError) {
      console.error('[org/checkout/prepare] payment_id 저장 실패:', updateError.message);
      return orgError('INTERNAL_ERROR', '결제를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
    }
  }

  const pre = await preRegisterPayment(paymentId, order.amount);
  if (!pre.ok) {
    return orgError('PAYMENT_VERIFY_FAILED', '결제를 준비하지 못했습니다. 잠시 후 다시 시도해주세요.', 502);
  }

  return NextResponse.json({
    paymentId,
    orderName: `N인플 기업 ${PLAN_LABEL[order.plan_id]} ${order.seat_count}좌석`,
    amount: order.amount,
    currency: CURRENCY,
    companyName: org.company_name,
  });
}
