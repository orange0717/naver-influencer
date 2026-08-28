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

  // ⚠️ 조회가 실패해도 data 는 null 이다. error 를 안 보면 DB 장애·테이블 미생성이
  //    전부 '소속된 기업 계정이 없습니다'(404)로 둔갑한다 — 좌석·결제 화면에서 그건
  //    '기업 계정이 해지됐다'로 읽힌다. 못 읽은 것과 없는 것을 반드시 가른다.
  const { data: membership, error: membershipError } = await supabase
    .from('enterprise_org_members')
    .select('org_id, role')
    .eq('user_id', authUser.userId)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) {
    console.error('[org/subscription] membership error:', membershipError);
    return orgError('INTERNAL_ERROR', '기업 계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }
  if (!membership) {
    return orgError('NOT_FOUND', '소속된 기업 계정이 없습니다.', 404);
  }
  if (membership.role !== 'OWNER') {
    return orgError('FORBIDDEN', '기업 계정의 결제·좌석 정보는 대표 계정만 확인하실 수 있습니다.', 403);
  }

  const { data: org, error: orgFetchError } = await supabase
    .from('enterprise_orgs')
    .select('id, company_name, plan_id, seat_limit, pending_seat_limit, status, current_period_end')
    .eq('id', membership.org_id)
    .maybeSingle();

  if (orgFetchError) {
    console.error('[org/subscription] org error:', orgFetchError);
    return orgError('INTERNAL_ERROR', '기업 계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }
  if (!org) {
    return orgError('NOT_FOUND', '기업 계정 정보를 찾을 수 없습니다.', 404);
  }
  // 좌석은 배정돼 있는데 플랜 값이 정의 밖이면 데이터가 깨진 것이다. '없음'(404)으로
  // 뭉개면 대표가 해지된 줄 알고 재가입하러 간다 → 장애로 알리고 로그를 남긴다.
  if (!isPlanId(org.plan_id)) {
    console.error('[org/subscription] unknown plan_id:', { orgId: org.id, planId: org.plan_id });
    return orgError('INTERNAL_ERROR', '기업 계정의 요금제 정보를 확인할 수 없습니다. 고객센터로 문의해 주세요.', 500);
  }

  // 좌석 사용량의 근거다. 실패를 [] 로 받으면 '아무도 좌석을 안 쓴다'가 되어
  // 멤버 명단이 통째로 사라진 화면이 된다.
  const { data: members, error: membersError } = await supabase
    .from('enterprise_org_members')
    .select('email, role, joined_at')
    .eq('org_id', org.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (membersError) {
    console.error('[org/subscription] members error:', membersError);
    return orgError('INTERNAL_ERROR', '멤버 명단을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }

  // 아직 수락하지 않은 초대. 좌석은 수락 시점에만 차지하므로 usedSeats 에는 넣지 않는다 —
  // 여기 따로 보여주지 않으면 "초대했는데 명단에 없다"로 읽힌다.
  // 바로 그 오해를 막으려고 넣은 값이므로, 조회 실패를 [] 로 뭉개면 목적이 뒤집힌다.
  const { data: pendingInvites, error: invitesError } = await supabase
    .from('enterprise_org_invites')
    .select('email, expires_at')
    .eq('org_id', org.id)
    .eq('status', 'pending')
    .not('sent_at', 'is', null)
    .order('created_at', { ascending: true });

  if (invitesError) {
    console.error('[org/subscription] pending invites error:', invitesError);
    return orgError('INTERNAL_ERROR', '초대 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }

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
