import { NextResponse } from 'next/server';

/**
 * POST /api/trial/start — 2026-08-08 프리미엄 모델 전환으로 폐지.
 * 자가발급 7일 무료체험 대신, 로그인 없이도 하루 3회 무료(src/lib/free-quota.ts)로
 * 체험 가능하고 유료 전환은 기간제 PRO 이용권(/subscribe)으로만 진행한다.
 */
export async function POST() {
  return NextResponse.json(
    { error: '무료체험이 종료되었습니다. 로그인 없이도 하루 3회 무료로 이용할 수 있고, 계속 이용하려면 이용권을 구매해주세요.' },
    { status: 410 },
  );
}
