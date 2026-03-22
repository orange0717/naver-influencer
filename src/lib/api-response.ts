import { NextResponse } from 'next/server';

/**
 * API 에러 응답 표준 포맷.
 * 모든 API 라우트에서 이 헬퍼를 사용하여 일관된 에러 응답을 반환한다.
 */
export function errorResponse(error: string, status: number = 500) {
  return NextResponse.json({ error }, { status });
}

/**
 * API 성공 응답 표준 포맷.
 */
export function successResponse<T extends Record<string, unknown>>(data?: T) {
  return NextResponse.json({ success: true, ...data });
}
