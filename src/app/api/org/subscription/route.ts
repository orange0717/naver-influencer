import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { orgError } from '@/lib/enterprise-org';
import { CURRENCY, PLANS, calcPrice, isPlanId } from '@/lib/pricing';

/**
 * GET /api/org/subscription — 기업 구독·멤버 관리 화면(S8)이 읽는 현황.
 *
 * 좌석·결제 정보는 OWNER 만 본다(MEMBER 는 결제 화면에 접근할 수 없다는 역할 정의).
 */
export async function GET(request: NextRequest) {
  const authUser = await getAuthUser(request).catch(() => null);
  if (!authUser) {
    return orgError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
  }

  const supabase = createServiceClient();

  const { data: membership } = await supabase
    .from('enterprise_org_members')
    .select('org_id, role')
    .eq('user_id', authUser.userId)
    .eq('status', 'active')
    .maybeSingle();

  if (!membership) {
    return orgError('NOT_FOUND', '소속된 기업 계정이 없습니다.', 404);
  }
  if (membership.role !== 'OWNER') {
    return orgError('FORBIDDEN', '기업 계정의 결제·좌석 정보는 대표 계정만 확인하실 수 있습니다.', 403);
  }

  const { data: org } = await supabase
    .from('enterprise_orgs')
    .select('id, company_name, plan_id, seat_limit, pending_seat_limit, status, current_period_end')
    .eq('id', membership.org_id)
    .maybeSingle();

  if (!org || !isPlanId(org.plan_id)) {
    return orgError('NOT_FOUND', '기업 계정 정보를 찾을 수 없습니다.', 404);
  }

  const { data: members } = await supabase
    .from('enterprise_org_members')
    .select('email, role, joined_at')
    .eq('org_id', org.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  // 아직 수락하지 않은 초대. 좌석은 수락 시점에만 차지하므로 usedSeats 에는 넣지 않는다 —
  // 여기 따로 보여주지 않으면 "초대했는데 명단에 없다"로 읽힌다.
  const { data: pendingInvites } = await supabase
    .from('enterprise_org_invites')
    .select('email, expires_at')
    .eq('org_id', org.id)
    .eq('status', 'pending')
    .not('sent_at', 'is', null)
    .order('created_at', { ascending: true });

  const seatCount = org.seat_limit;
  const usedSeats = members?.length ?? 0;

  return NextResponse.json({
    orgId: org.id,
    companyName: org.company_name,
    status: org.status,
    planId: org.plan_id,
    seatPrice: PLANS[org.plan_id].seatPrice,
    seatCount,
    usedSeats,
    pendingSeatCount: org.pending_seat_limit,
    amount: calcPrice(org.plan_id, seatCount),
    currency: CURRENCY,
    nextBillingDate: org.current_period_end,
    members: members ?? [],
    pendingInvites: pendingInvites ?? [],
  });
}
