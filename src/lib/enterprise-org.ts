/**
 * enterprise-org.ts — 기업(법인) 가입 API 공통 응답 규약
 *
 * 이 저장소의 다른 API는 `{ error: '문자열' }`을 쓰지만, 기업 가입 API만은
 * 클라이언트가 코드로 분기해야 하는 실패(금액 불일치·초대 만료 등)가 많아
 * `{ error: { code, message } }` 형태를 쓴다. 두 형태를 섞지 말 것.
 */

import { NextResponse } from 'next/server';

export const ORG_ERROR_CODES = [
  'PRICE_MISMATCH',
  'INVALID_PLAN',
  'INVALID_SEATS',
  'SEAT_LIMIT_EXCEEDED',
  'OWNER_IN_INVITES',
  'INVITE_EXPIRED',
  'INVITE_ALREADY_ACCEPTED',
  'INVITE_EMAIL_MISMATCH',
  'DUPLICATE_EMAIL',
  'ORG_ALREADY_ACTIVE',
  'PAYMENT_VERIFY_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INTERNAL_ERROR',
] as const;

export type OrgErrorCode = (typeof ORG_ERROR_CODES)[number];

export function orgError(code: OrgErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
