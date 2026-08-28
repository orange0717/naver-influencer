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

  const { data: invite } = await supabase
    .from('enterprise_org_invites')
    .select('id, org_id, email, status, expires_at')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle();

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

  const { data: org } = await supabase
    .from('enterprise_orgs')
    .select('company_name, plan_id, status, seat_limit')
    .eq('id', invite.org_id)
    .maybeSingle();

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
