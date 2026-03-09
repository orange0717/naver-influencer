import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const auth = await getAuthUser(request);

  if (!auth) {
    // 미인증 시 기본값 반환 (비로그인 상태에서도 에러 안 나도록)
    return NextResponse.json({ balance: 0, total_charged: 0, total_used: 0 });
  }

  return NextResponse.json({
    balance: auth.user.point_balance,
    total_charged: auth.user.total_charged,
    total_used: auth.user.total_used,
  });
}
