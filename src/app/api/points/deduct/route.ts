import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { target_id, view_type, cost } = body;

  if (!target_id || !view_type || !cost) {
    return NextResponse.json({ error: '필수 파라미터가 누락되었습니다' }, { status: 400 });
  }

  // MVP: mock deduction (always succeed)
  return NextResponse.json({
    success: true,
    deducted: cost,
    balance: 1200 - cost,
    cached: false,
  });
}
