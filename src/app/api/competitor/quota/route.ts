import { NextResponse } from 'next/server';
import { getCookieUser } from '@/lib/auth';
import { competitorAllowed, getPlanTierByCookieUser } from '@/lib/competitor-quota';

export const dynamic = 'force-dynamic';

/**
 * GET /api/competitor/quota — 경쟁자 분석 이용 가능 여부
 * 이용권 보유자는 무제한, 무료 회원은 이용 불가라 셀 횟수가 없다.
 */
export async function GET() {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const plan = await getPlanTierByCookieUser(cookieUser);
  const unlimited = competitorAllowed(plan);

  return NextResponse.json({
    plan,
    limit: unlimited ? null : 0,
    used: 0,
    remaining: unlimited ? null : 0,
    unlimited,
  });
}
