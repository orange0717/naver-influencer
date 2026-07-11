import { NextResponse } from 'next/server';
import { logger } from './logger';

/** 클라이언트에 안전한 JSON 에러 응답 */
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** 내부 오류 로깅 후 일반 메시지 반환 (DB/스택 정보 노출 방지) */
export function internalError(module: string, err: unknown, userMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.') {
  logger.error(module, userMessage, {
    err: err instanceof Error ? err.message : String(err),
  });
  return NextResponse.json({ error: userMessage }, { status: 500 });
}

/** Supabase PostgREST 오류 로깅 후 일반 메시지 반환 */
export function dbError(module: string, err: { message?: string } | null, userMessage = '데이터 처리 중 오류가 발생했습니다.') {
  if (err?.message) {
    logger.error(module, 'Database error', { err: err.message });
  }
  return NextResponse.json({ error: userMessage }, { status: 500 });
}
