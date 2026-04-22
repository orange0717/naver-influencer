import { NextResponse } from 'next/server';
import { getCookieUser } from '@/lib/auth';
import {
  getCompetitorDailyLimit,
  getCompetitorUsage,
  getPlanTierByCookieUser,
} from '@/lib/competitor-quota';

export const dynamic = 'force-dynamic';

/**
 * GET /api/competitor/quota — 오늘 경쟁자 분석 사용 현황
 * { plan, limit, used, remaining, unlimited }
 */
export async function GET() {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const plan = await getPlanTierByCookieUser(cookieUser);
  const limit = getCompetitorDailyLimit(plan);
  const unlimited = !isFinite(limit);
  const { count } = unlimited
    ? { count: 0 }
    : await getCompetitorUsage(cookieUser.id);

  return NextResponse.json({
    plan,
    limit: unlimited ? null : limit,
    used: count,
    remaining: unlimited ? null : Math.max(0, limit - count),
    unlimited,
  });
}
