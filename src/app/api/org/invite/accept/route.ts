import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { orgError } from '@/lib/enterprise-org';
import { hashInviteToken } from '@/lib/enterprise-invite';
import { syncOrgSeatEntitlements } from '@/lib/enterprise-billing';

/**
 * POST /api/org/invite/accept — 초대를 수락해 좌석을 차지한다.
 *
 * 토큰만으로는 부족하다. 메일이 전달·유출될 수 있으므로 로그인한 계정의 이메일이
 * 초대받은 주소와 같을 때만 좌석을 준다(오렌지 확정 정책: 초대받은 이메일 본인만 수락).
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthUser(request).catch(() => null);
  if (!authUser) {
    return orgError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
  }

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return orgError('NOT_FOUND', '잘못된 요청입니다.', 400);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return orgError('NOT_FOUND', '유효하지 않은 초대 링크입니다.', 404);

  const supabase = createServiceClient();

  const { data: invite } = await supabase
    .from('enterprise_org_invites')
    .select('id, org_id, email, role, status, expires_at')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle();

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
    .select('id, company_name, status, seat_limit')
    .eq('id', invite.org_id)
    .maybeSingle();

  if (!org || org.status !== 'active') {
    return orgError('INVITE_EXPIRED', '기업 계정이 현재 이용 중이 아닙니다. 담당자에게 문의해주세요.', 410);
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', authUser.userId)
    .maybeSingle();

  if (profileError || !profile?.email) {
    console.error('[org/invite/accept] user lookup failed:', profileError?.message);
    return orgError('INTERNAL_ERROR', '계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
  }

  if (profile.email.toLowerCase() !== invite.email.toLowerCase()) {
    return orgError(
      'INVITE_EMAIL_MISMATCH',
      `이 초대는 ${invite.email} 계정으로만 수락하실 수 있습니다. 해당 주소로 로그인한 뒤 다시 시도해주세요.`,
      403,
    );
  }

  // 한 사람이 두 조직의 좌석을 동시에 차지할 수 없다(DB 부분 유니크와 같은 규칙).
  const { data: existingSeat } = await supabase
    .from('enterprise_org_members')
    .select('org_id')
    .eq('user_id', authUser.userId)
    .eq('status', 'active')
    .maybeSingle();

  if (existingSeat) {
    return existingSeat.org_id === org.id
      ? NextResponse.json({ ok: true, orgId: org.id, companyName: org.company_name })
      : orgError('ORG_ALREADY_ACTIVE', '이미 다른 기업 계정에 소속되어 있습니다.', 409);
  }

  // 좌석은 결제한 수를 넘길 수 없다. OWNER 도 한 자리를 쓰므로 active 멤버 전체를 센다.
  const { count: usedSeats, error: countError } = await supabase
    .from('enterprise_org_members')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', org.id)
    .eq('status', 'active');

  if (countError || usedSeats === null) {
    console.error('[org/invite/accept] seat count failed:', countError?.message);
    return orgError('INTERNAL_ERROR', '좌석 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
  }

  if (usedSeats >= org.seat_limit) {
    return orgError('SEAT_LIMIT_EXCEEDED', '남은 좌석이 없습니다. 기업 담당자에게 문의해주세요.', 409);
  }

  const { error: memberError } = await supabase.from('enterprise_org_members').insert({
    org_id: org.id,
    user_id: authUser.userId,
    role: 'MEMBER',
    status: 'active',
    email: profile.email.toLowerCase(),
  });

  if (memberError) {
    console.error('[org/invite/accept] seat insert failed:', memberError.message);
    return orgError('INTERNAL_ERROR', '좌석을 배정하지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
  }

  // status 조건을 걸어 같은 링크가 두 번 눌려도 수락은 한 번만 기록된다.
  const { error: inviteUpdateError } = await supabase
    .from('enterprise_org_invites')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: authUser.userId,
    })
    .eq('id', invite.id)
    .eq('status', 'pending');

  if (inviteUpdateError) {
    // 좌석은 이미 들어갔다. 되돌리면 사용자는 권한을 잃고, 두면 초대만 pending 으로 남는다.
    // 후자가 덜 나쁘므로 로그만 남긴다(관리 화면에서 정리 가능).
    console.error('[org/invite/accept] invite status update failed:', inviteUpdateError.message);
  }

  await syncOrgSeatEntitlements(org.id);

  return NextResponse.json({ ok: true, orgId: org.id, companyName: org.company_name });
}
