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

  const { data: order, error: orderError } = await supabase
    .from('enterprise_orders')
    .select('id, org_id, kind, plan_id, seat_count, seat_price, amount, currency, status')
    .eq('id', orderId)
    .maybeSingle();

  // ⚠️ 조회 실패도 data 는 null 이다. '주문을 찾을 수 없습니다'로 흘리면 결제 직전 화면에서
  //    주문이 사라진 것처럼 보인다. 단 22P02(UUID 형식 아님)는 주소가 틀린 것이므로 404 가 맞다.
  if (orderError && orderError.code !== '22P02') {
    console.error('[org/orders] order lookup error:', orderError);
    return orgError('INTERNAL_ERROR', '주문 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }
  if (!order) return orgError('NOT_FOUND', '주문을 찾을 수 없습니다.', 404);

  const { data: org, error: orgFetchError } = await supabase
    .from('enterprise_orgs')
    .select('id, company_name, owner_user_id')
    .eq('id', order.org_id)
    .maybeSingle();

  // 조회 실패를 아래 권한 분기로 흘리면 본인 주문인데 '볼 권한이 없습니다'가 뜬다.
  // 결제 직전에 나오는 문구라 사용자는 자기 계정이 잘못됐다고 판단하게 된다.
  if (orgFetchError) {
    console.error('[org/orders] org lookup error:', orgFetchError);
    return orgError('INTERNAL_ERROR', '기업 계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }

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
