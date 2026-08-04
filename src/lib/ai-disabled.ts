/**
 * AI 기능 전면 차단 게이트.
 *
 * 외부 AI API 잔액 부족으로 모든 Claude 호출 라우트를 즉시 차단할 때 사용.
 * 복구 시 AI_DISABLED 를 false 로 바꾸면 끝.
 */
import { NextResponse } from 'next/server';

export const AI_DISABLED = false;

const AI_DISABLED_MSG =
  'AI 기능이 일시 중단되었습니다. 외부 AI API 잔액이 소진되어 충전 후 빠르게 복구할 예정입니다.';

export function aiDisabledResponse() {
  return NextResponse.json(
    { error: AI_DISABLED_MSG, code: 'AI_DISABLED' },
    { status: 503 }
  );
}
