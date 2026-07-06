import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { couponLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

/**
 * POST /api/coupons/redeem
 *
 * 로그인한 회원이 쿠폰 코드를 등록. 서버에서 인증된 유저의 users.email 을
 * 직접 조회해 coupons.target_email 과 대조하므로 클라이언트 입력은 신뢰하지 않는다.
 * 동시 요청 시 UPDATE ... WHERE used = false 원자적 클레임으로 1회만 성공한다.
 *
 * Body: { code: string }
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await couponLimiter.check(ip)) return rateLimitResponse();

  const authUser = await getAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const code = String(body.code || '').trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: '쿠폰 코드를 입력해주세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, email, subscription_plan, subscription_expires_at')
    .eq('id', authUser.userId)
    .single();

  if (userError || !userRow?.email) {
    return NextResponse.json({ error: '사용자 정보를 확인할 수 없습니다.' }, { status: 400 });
  }

  const { data: coupon, error: couponError } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (couponError) {
    console.error('[coupons/redeem] coupon lookup error:', couponError);
    return NextResponse.json({ error: '쿠폰 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
  if (!coupon) {
    return NextResponse.json({ error: '유효하지 않은 쿠폰 코드입니다.' }, { status: 400 });
  }
  if (coupon.used) {
    return NextResponse.json({ error: '이미 사용된 쿠폰입니다.' }, { status: 400 });
  }
  if (coupon.target_email.toLowerCase() !== userRow.email.toLowerCase()) {
    return NextResponse.json({ error: '사용할 수 없는 쿠폰입니다.' }, { status: 403 });
  }

  // 원자적 클레임: used=false 조건이 매치되는 요청만 성공 (동시 요청 안전)
  const { data: claimed, error: claimError } = await supabase
    .from('coupons')
    .update({ used: true, used_at: new Date().toISOString(), used_by_user_id: userRow.id })
    .eq('id', coupon.id)
    .eq('used', false)
    .select()
    .maybeSingle();

  if (claimError) {
    console.error('[coupons/redeem] claim error:', claimError);
    return NextResponse.json({ error: '쿠폰 등록 중 오류가 발생했습니다.' }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json({ error: '이미 사용된 쿠폰입니다.' }, { status: 400 });
  }

  const now = Date.now();
  const currentExpiry = userRow.subscription_expires_at ? new Date(userRow.subscription_expires_at).getTime() : 0;
  const baseTime = currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(baseTime + claimed.duration_days * 24 * 60 * 60 * 1000).toISOString();

  const { error: updateError } = await supabase
    .from('users')
    .update({ subscription_plan: claimed.plan, subscription_expires_at: newExpiry })
    .eq('id', userRow.id);

  if (updateError) {
    console.error('[coupons/redeem] user update error:', updateError);
    return NextResponse.json({ error: '쿠폰은 등록됐지만 이용권 반영 중 오류가 발생했습니다. 관리자에게 문의해주세요.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    expiresAt: newExpiry,
    durationDays: claimed.duration_days,
    plan: claimed.plan,
    name: claimed.name,
  });
}
