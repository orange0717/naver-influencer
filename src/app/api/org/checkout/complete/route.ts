import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { orgError } from '@/lib/enterprise-org';
import { activateOrgOrder } from '@/lib/enterprise-billing';

const PAYMENT_ID_REGEX = /^p[a-f0-9]{24}$/;

/**
 * POST /api/org/checkout/complete — 결제창이 성공으로 닫힌 뒤 클라이언트가 부르는 확정 요청.
 *
 * 웹훅과 같은 일을 하지만 사용자를 기다리게 하지 않으려고 둔 경로다. 둘 중 무엇이 먼저
 * 도착하든 결과는 같아야 하므로 실제 확정은 멱등한 activateOrgOrder 한 곳에서만 한다.
 * 클라이언트가 보낸 건 paymentId 뿐이고, 승인 여부·금액은 PG 에 다시 물어본다.
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthUser(request).catch(() => null);
  if (!authUser) {
    return orgError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
  }

  let body: { paymentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return orgError('NOT_FOUND', '잘못된 요청입니다.', 400);
  }

  const paymentId = typeof body.paymentId === 'string' ? body.paymentId : '';
  if (!PAYMENT_ID_REGEX.test(paymentId)) {
    return orgError('NOT_FOUND', '결제 정보를 찾을 수 없습니다.', 404);
  }

  const result = await activateOrgOrder(paymentId);
  if (!result.ok) {
    return orgError('PAYMENT_VERIFY_FAILED', result.error, 402);
  }

  return NextResponse.json({ ok: true, orgId: result.orgId });
}
