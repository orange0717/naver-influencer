import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { orgError } from '@/lib/enterprise-org';
import { hashInviteToken } from '@/lib/enterprise-invite';
import { PLAN_LABEL, isPlanId } from '@/lib/pricing';

/**
 * GET /api/org/invite?token=... — 초대 수락 화면이 보여줄 초대 정보.
 *
 * 로그인 전에도 "어느 회사가, 어느 주소로 불렀는지"를 보여줘야 로그인할 계정을 고를 수 있으므로
 * 인증을 요구하지 않는다. 토큰 자체가 비밀이고, 실제 좌석 배정은 accept 에서 이메일까지 대조한다.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  if (!token) return orgError('NOT_FOUND', '초대 정보를 찾을 수 없습니다.', 404);

  const supabase = createServiceClient();

  const { data: invite, error: inviteError } = await supabase
    .from('enterprise_org_invites')
    .select('id, org_id, email, status, expires_at')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle();

  // ⚠️ 조회 실패도 data 는 null 이다. 아래 '유효하지 않은 초대 링크입니다'로 흘려보내면
  //    정상 초대를 받은 사람이 링크가 가짜라고 믿고 담당자에게 재발송을 요청하게 된다.
  //    (토큰 유효성과 DB 장애는 무관하므로 여기서 갈라도 탐색자에게 주는 정보가 없다.)
  if (inviteError) {
    console.error('[org/invite] invite lookup error:', inviteError);
    return orgError('INTERNAL_ERROR', '초대 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }

  // 토큰이 틀렸는지 이미 쓴 초대인지 구분해 주지 않는다. 남의 초대 링크를 찍어 보는 쪽에
  // 정보를 주지 않으려는 것이고, 정상 수신자에게는 어차피 같은 안내다.
  if (!invite) return orgError('NOT_FOUND', '유효하지 않은 초대 링크입니다.', 404);

  if (invite.status === 'accepted') {
    return orgError('INVITE_ALREADY_ACCEPTED', '이미 수락한 초대입니다.', 409);
  }
  if (invite.status !== 'pending') {
    return orgError('INVITE_EXPIRED', '만료되었거나 취소된 초대입니다. 담당자에게 재발송을 요청해주세요.', 410);
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return orgError('INVITE_EXPIRED', '초대 유효기간이 지났습니다. 담당자에게 재발송을 요청해주세요.', 410);
  }

  const { data: org, error: orgFetchError } = await supabase
    .from('enterprise_orgs')
    .select('company_name, plan_id, status, seat_limit')
    .eq('id', invite.org_id)
    .maybeSingle();

  // 조회 실패를 아래 분기로 흘리면 멀쩡히 이용 중인 기업 계정을 '이용 중이 아니다'라고
  // 단언하게 된다. 초대받은 사람은 회사가 해지된 줄 알게 되므로 장애로 알린다.
  if (orgFetchError) {
    console.error('[org/invite] org lookup error:', orgFetchError);
    return orgError('INTERNAL_ERROR', '기업 계정 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 500);
  }

  // 결제 확정 후에만 초대가 나가므로 정상 흐름에서는 active 다. 만료된 조직의 초대로
  // 좌석을 받으면 권한 없는 계정이 생기므로 여기서 막는다.
  if (!org || org.status !== 'active') {
    return orgError('INVITE_EXPIRED', '기업 계정이 현재 이용 중이 아닙니다. 담당자에게 문의해주세요.', 410);
  }

  return NextResponse.json({
    companyName: org.company_name,
    email: invite.email,
    planLabel: isPlanId(org.plan_id) ? PLAN_LABEL[org.plan_id] : null,
    expiresAt: invite.expires_at,
  });
}
