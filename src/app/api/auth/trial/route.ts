import { NextResponse } from 'next/server';

/**
 * POST /api/auth/trial — 2026-08-08 프리미엄 모델 전환으로 폐지 (구 /trial 페이지 전용 API).
 * /trial 페이지 자체가 홈으로 리다이렉트되므로 더 이상 호출되지 않는다.
 */
export async function POST() {
  return NextResponse.json(
    { error: '무료체험이 종료되었습니다. 로그인 없이도 하루 5회 무료로 이용할 수 있습니다.' },
    { status: 410 },
  );
}
