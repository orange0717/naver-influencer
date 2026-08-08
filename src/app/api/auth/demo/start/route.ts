import { NextRequest, NextResponse } from 'next/server';

/**
 * POST/GET /api/auth/demo/start — 2026-08-08 프리미엄 모델 전환으로 폐지.
 * 회원가입 없이도 하루 5회 무료(src/lib/free-quota.ts)로 체험 가능해져
 * naver_id 기반 7일 데모 세션 자가발급 플로우는 더 이상 필요 없다.
 * GET은 기존 링크가 브라우저 내비게이션(window.location.href)으로 호출했으므로 홈으로 리다이렉트,
 * POST는 API 클라이언트 호출 대비 410로 응답한다.
 */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/', request.url));
}

export async function POST() {
  return NextResponse.json(
    { error: '데모 체험이 종료되었습니다. 로그인 없이도 하루 5회 무료로 이용할 수 있습니다.' },
    { status: 410 },
  );
}
