import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { orgSignupSchema } from '@/lib/validations/enterprise-org';
import { orgError } from '@/lib/enterprise-org';
import { createInviteToken, inviteExpiresAt } from '@/lib/enterprise-invite';
import { CURRENCY, PLANS, calcPrice, invitableSeats } from '@/lib/pricing';

/**
 * POST /api/org/signup — 기업 조직과 최초 주문을 만든다. 아직 결제 전이다.
 *
 * 조직은 pending_payment 로 만들고 결제 확정(웹훅/complete)에서 active 로 넘어간다.
 * 초대 행도 여기서 만들지만 sent_at 은 NULL 이고 메일은 결제 확정 후에 나간다.
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthUser(request).catch(() => null);
  if (!authUser) {
    return orgError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return orgError('INVALID_PLAN', '잘못된 요청입니다.', 400);
  }

  // 어느 칸이 왜 틀렸는지 그대로 돌려준다 — "입력값이 올바르지 않습니다"만 보면 고칠 수가 없다.
  const parsed = orgSignupSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return orgError('INVALID_PLAN', first?.message || '입력값을 확인해주세요.', 400);
  }
  const data = parsed.data;

  // 대표가 좌석 하나를 쓰므로 초대 가능 인원은 항상 좌석 수보다 하나 적다.
  const invitable = invitableSeats(data.seatCount);
  if (data.memberEmails.length > invitable) {
    return orgError('SEAT_LIMIT_EXCEEDED', `대표 계정을 포함한 좌석이라 초대는 ${invitable}명까지 가능합니다.`, 409);
  }
  if (data.memberEmails.length < invitable) {
    return orgError('INVALID_SEATS', `초대할 ${invitable}명의 이메일을 모두 입력해주세요.`, 400);
  }

  // 클라이언트가 보낸 금액은 대조용일 뿐이다. 실제 청구는 항상 서버 계산값으로 한다.
  const amount = calcPrice(data.planId, data.seatCount);
  if (amount !== data.amount) {
    return orgError('PRICE_MISMATCH', '결제 금액이 변경되었습니다. 화면을 새로고침한 뒤 다시 시도해주세요.', 409);
  }

  const supabase = createServiceClient();

  const { data: owner, error: ownerError } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', authUser.userId)
    .maybeSingle();

  if (ownerError || !owner?.email) {
    console.error('[org/signup] owner lookup failed:', ownerError?.message);
    return orgError('INTERNAL_ERROR', '가입 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
  }

  const ownerEmail = owner.email.toLowerCase();
  if (data.memberEmails.includes(ownerEmail)) {
    return orgError('OWNER_IN_INVITES', '대표 계정은 이미 좌석을 사용합니다. 초대 목록에서 빼주세요.', 409);
  }

  // 한 사람이 두 조직의 좌석을 동시에 차지할 수 없다(DB 부분 유니크와 같은 규칙).
  const { data: existingSeat } = await supabase
    .from('enterprise_org_members')
    .select('org_id')
    .eq('user_id', authUser.userId)
    .eq('status', 'active')
    .maybeSingle();

  if (existingSeat) {
    return orgError('ORG_ALREADY_ACTIVE', '이미 기업 계정에 소속되어 있습니다.', 409);
  }

  const bizRegNo = data.bizRegNo;
  const { data: existingOrg } = await supabase
    .from('enterprise_orgs')
    .select('id')
    .eq('biz_reg_no', bizRegNo)
    .in('status', ['active', 'expired'])
    .maybeSingle();

  if (existingOrg) {
    return orgError('ORG_ALREADY_ACTIVE', '이미 등록된 사업자등록번호입니다. 기업 담당자에게 초대를 요청해주세요.', 409);
  }

  const agreedAt = new Date().toISOString();

  const { data: org, error: insertOrgError } = await supabase
    .from('enterprise_orgs')
    .insert({
      company_name: data.companyName,
      biz_reg_no: bizRegNo,
      ceo_name: data.ceoName,
      industry: data.industry,
      manager_name: data.managerName,
      manager_phone: data.managerPhone,
      manager_email: data.managerEmail,
      tax_invoice_email: data.taxInvoiceEmail,
      owner_user_id: authUser.userId,
      plan_id: data.planId,
      seat_limit: data.seatCount,
      status: 'pending_payment',
      tos_agreed_at: agreedAt,
      privacy_agreed_at: agreedAt,
    })
    .select('id')
    .single();

  if (insertOrgError || !org) {
    console.error('[org/signup] org insert failed:', insertOrgError?.message);
    return orgError('INTERNAL_ERROR', '가입 신청에 실패했습니다. 잠시 후 다시 시도해주세요.', 500);
  }

  // 여기서부터 실패하면 결제할 수 없는 빈 조직이 남으므로 되돌린다(CASCADE 로 자식도 함께 지워진다).
  const rollback = async () => {
    await supabase.from('enterprise_orgs').delete().eq('id', org.id);
  };

  const { error: memberError } = await supabase.from('enterprise_org_members').insert({
    org_id: org.id,
    user_id: authUser.userId,
    role: 'OWNER',
    status: 'active',
    email: ownerEmail,
  });

  if (memberError) {
    console.error('[org/signup] owner seat insert failed:', memberError.message);
    await rollback();
    return orgError('INTERNAL_ERROR', '가입 신청에 실패했습니다. 잠시 후 다시 시도해주세요.', 500);
  }

  if (data.memberEmails.length > 0) {
    const expiresAt = inviteExpiresAt().toISOString();
    // 지금 넣는 토큰의 원문은 아무도 갖고 있지 않다. 결제 확정 후 발송 시점에 새로 만들어 교체하므로
    // 결제 전에는 이 초대를 수락할 방법이 없다.
    const { error: inviteError } = await supabase.from('enterprise_org_invites').insert(
      data.memberEmails.map((email) => ({
        org_id: org.id,
        email,
        role: 'MEMBER',
        token_hash: createInviteToken().tokenHash,
        status: 'pending',
        expires_at: expiresAt,
      })),
    );

    if (inviteError) {
      console.error('[org/signup] invite insert failed:', inviteError.message);
      await rollback();
      return orgError('INTERNAL_ERROR', '초대 목록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.', 500);
    }
  }

  const { data: order, error: orderError } = await supabase
    .from('enterprise_orders')
    .insert({
      org_id: org.id,
      kind: 'initial',
      plan_id: data.planId,
      seat_count: data.seatCount,
      seat_price: PLANS[data.planId].seatPrice,
      amount,
      currency: CURRENCY,
      status: 'pending_payment',
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('[org/signup] order insert failed:', orderError?.message);
    await rollback();
    return orgError('INTERNAL_ERROR', '주문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', 500);
  }

  return NextResponse.json({
    orgId: org.id,
    orderId: order.id,
    planId: data.planId,
    seatCount: data.seatCount,
    amount,
    currency: CURRENCY,
  });
}
