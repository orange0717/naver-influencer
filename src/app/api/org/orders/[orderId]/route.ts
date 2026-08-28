import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { orgError } from '@/lib/enterprise-org';

/** GET /api/org/orders/[orderId] — 결제 화면이 보여줄 주문 요약. OWNER 본인만 읽는다. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const authUser = await getAuthUser(request).catch(() => null);
  if (!authUser) {
    return orgError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
  }

  const { orderId } = await params;
  const supabase = createServiceClient();

  const { data: order } = await supabase
    .from('enterprise_orders')
    .select('id, org_id, kind, plan_id, seat_count, seat_price, amount, currency, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) return orgError('NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const { data: org } = await supabase
    .from('enterprise_orgs')
    .select('id, company_name, owner_user_id')
    .eq('id', order.org_id)
    .maybeSingle();

  if (!org || org.owner_user_id !== authUser.userId) {
    return orgError('FORBIDDEN', '이 주문을 볼 권한이 없습니다.', 403);
  }

  return NextResponse.json({
    orderId: order.id,
    orgId: org.id,
    companyName: org.company_name,
    kind: order.kind,
    planId: order.plan_id,
    seatCount: order.seat_count,
    seatPrice: order.seat_price,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
  });
}
