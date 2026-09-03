import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import { generateCouponCode } from '@/lib/coupons';
import { planLabel, toPlanKey } from '@/lib/plans';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/coupons/grant-now
 *
 * 관리자 전용: 특정 회원에게 무료 체험 이용권을 고객 액션 없이 즉시 지급.
 * 기존 coupons 테이블을 그대로 로그로 재사용하되, used=true 상태로 즉시 생성해
 * /api/coupons/redeem(고객 코드 등록) 경로 없이 users.subscription_plan/expires_at을 바로 갱신한다.
 *
 * Body: { targetEmail: string, durationDays?: number (기본 7), plan?: 'BLOGGER'|'INFLUENCER' (기본 INFLUENCER) }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  let body: { targetEmail?: string; durationDays?: number; plan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const targetEmail = String(body.targetEmail || '').trim().toLowerCase();
  const durationDays = Math.max(1, Math.min(365, parseInt(String(body.durationDays ?? 7), 10) || 7));
  const plan = body.plan === 'BLOGGER' ? 'BLOGGER' : 'INFLUENCER';

  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return NextResponse.json({ error: '올바른 대상 회원 이메일을 입력하세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, email, subscription_plan, subscription_expires_at')
    .eq('email', targetEmail)
    .maybeSingle();

  if (userError) {
    console.error('[admin/coupons/grant-now] user lookup error:', userError);
    return NextResponse.json({ error: '회원 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
  if (!userRow) {
    return NextResponse.json({ error: '해당 이메일의 회원을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 중복 지급 방지: 동일 대상으로 이미 활성화(사용됨 + 미만료)된 지급 이력이 있으면 새로 만들지 않음
  const { data: existing, error: existingError } = await supabase
    .from('coupons')
    .select('used_at, duration_days')
    .eq('target_email', targetEmail)
    .eq('used', true);

  if (existingError) {
    console.error('[admin/coupons/grant-now] existing lookup error:', existingError);
    return NextResponse.json({ error: '기존 지급 이력 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }

  const now = Date.now();
  const hasActiveGrant = (existing || []).some(c => {
    if (!c.used_at) return false;
    return new Date(c.used_at).getTime() + c.duration_days * 24 * 60 * 60 * 1000 > now;
  });
  if (hasActiveGrant) {
    return NextResponse.json({ error: '이미 활성화된 이용권이 있습니다.' }, { status: 409 });
  }

  const nowIso = new Date(now).toISOString();
  let coupon = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCouponCode(durationDays);
    const { data, error } = await supabase
      .from('coupons')
      .insert({
        code,
        name: `${planLabel(toPlanKey(plan))} ${durationDays}일 체험 (즉시지급)`,
        target_email: targetEmail,
        plan,
        duration_days: durationDays,
        used: true,
        used_at: nowIso,
        used_by_user_id: userRow.id,
        created_by: auth.authUser.userId,
      })
      .select()
      .single();

    if (!error) {
      coupon = data;
      break;
    }
    if (error.code !== '23505') { // unique_violation 이외의 오류는 즉시 중단
      console.error('[admin/coupons/grant-now] insert error:', error);
      return NextResponse.json({ error: '이용권 지급 실패' }, { status: 500 });
    }
  }
  if (!coupon) {
    return NextResponse.json({ error: '쿠폰 코드 생성에 반복 실패했습니다. 다시 시도해주세요.' }, { status: 500 });
  }

  // 기존 만료일이 미래면 그 시점부터 연장, 아니면 지금부터 durationDays 부여 (redeem 경로와 동일 정책)
  const currentExpiry = userRow.subscription_expires_at ? new Date(userRow.subscription_expires_at).getTime() : 0;
  const baseTime = currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(baseTime + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await supabase
    .from('users')
    .update({ subscription_plan: plan, subscription_expires_at: newExpiry })
    .eq('id', userRow.id);

  if (updateError) {
    console.error('[admin/coupons/grant-now] user update error:', updateError);
    return NextResponse.json({ error: '지급 기록은 저장됐지만 이용권 반영 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    expiresAt: newExpiry,
    durationDays,
    plan,
    coupon,
  });
}
