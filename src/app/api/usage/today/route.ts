import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { hasActivePaidPlanByUserId } from '@/lib/admin';
import { getFreeDailyUsage } from '@/lib/free-quota';

export const dynamic = 'force-dynamic';

/**
 * GET /api/usage/today — 헤더 배지("오늘 무료 사용 X/5회") 표시용 조회 전용 엔드포인트.
 * 소모하지 않는다 (읽기만). 비회원도 호출 가능.
 */
export async function GET(request: NextRequest) {
  let authUser;
  try {
    authUser = await getAuthUser(request);
  } catch {
    authUser = null;
  }

  const isPro = authUser ? await hasActivePaidPlanByUserId(authUser.userId) : false;
  const usage = await getFreeDailyUsage({
    request,
    isPro,
    userId: authUser?.userId ?? null,
  });

  return NextResponse.json({
    isPro,
    loggedIn: !!authUser,
    used: usage.used,
    limit: Number.isFinite(usage.limit) ? usage.limit : null,
  });
}
