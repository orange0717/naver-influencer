import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { hasRecentView, deductAndRecord } from '@/lib/points';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { target_id, view_type, cost } = body;

  if (!target_id || !view_type || !cost) {
    return NextResponse.json({ error: '필수 파라미터가 누락되었습니다' }, { status: 400 });
  }

  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  // 24시간 내 열람 기록 확인 (캐시)
  const cached = await hasRecentView(auth.userId, target_id, view_type);
  if (cached) {
    return NextResponse.json({
      success: true,
      deducted: 0,
      balance: auth.user.point_balance,
      cached: true,
    });
  }

  // 포인트 차감 + 열람 기록
  const result = await deductAndRecord(auth.userId, target_id, view_type, cost);

  if (!result.success) {
    return NextResponse.json({
      success: false,
      error: result.error,
      balance: result.balance,
    }, { status: 402 });
  }

  return NextResponse.json({
    success: true,
    deducted: cost,
    balance: result.balance,
    cached: false,
  });
}
