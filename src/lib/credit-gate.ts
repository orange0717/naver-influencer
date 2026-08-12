/**
 * credit-gate.ts — 라우트에서 크레딧 과금을 "안전하게" 배선하기 위한 얇은 게이트.
 *
 * ⚠️ 기본값 OFF: CREDITS_ENABLED 가 'true' 가 아니면 아래 두 함수는 모두 no-op 이다.
 *    즉 이 게이트를 라우트에 심어도 현행 동작(구독 권한 + 무료 하루 한도 + Sonnet 상한)이
 *    그대로 유지된다. 크레딧 "충전(구매)" 흐름이 라이브가 되어 사용자가 실제로 크레딧을 보유할 수
 *    있게 된 뒤에 CREDITS_ENABLED=true 로 활성화한다. (활성 전에 켜면 잔액 0인 사용자가 전부
 *    막히므로 반드시 충전 흐름 라이브 이후 활성화)
 *
 * 사용 패턴(명세 STEP 5→7):
 *   const denied = await assertCreditFor(userId, 'ai_body'); if (denied) return denied; // 실행 전 확인
 *   ... 실제 고비용 작업 ...
 *   await chargeCreditIfEnabled(userId, 'ai_body');                                     // 성공 후 차감
 */
import { NextResponse } from 'next/server';
import { hasEnoughCredit, chargeCredit } from './credits';
import { CREDIT_FEATURE_LABELS, type CreditFeature } from './credit-config';

/** 크레딧 과금 활성 여부. 기본 OFF. */
export const CREDITS_ENABLED = process.env.CREDITS_ENABLED === 'true';

/**
 * 고비용 작업 실행 "전" 잔액 확인. 미활성이면 통과(null). 부족하면 402 응답을 반환하므로
 * 호출부는 `const denied = await assertCreditFor(...); if (denied) return denied;` 로 쓴다.
 */
export async function assertCreditFor(
  authUserId: string,
  feature: CreditFeature,
): Promise<NextResponse | null> {
  if (!CREDITS_ENABLED) return null;
  const { ok, balance, required } = await hasEnoughCredit(authUserId, feature);
  if (!ok) {
    return NextResponse.json(
      {
        error: `크레딧이 부족합니다. (${CREDIT_FEATURE_LABELS[feature]} ${required} 필요 · 보유 ${balance})`,
        code: 'INSUFFICIENT_CREDITS',
        balance,
        required,
      },
      { status: 402 },
    );
  }
  return null;
}

/**
 * API 성공 "후" 크레딧 차감. 미활성이면 no-op. 차감 실패는 이미 성공한 응답을 막지 않는다
 * (credits.chargeCredit 이 fail-open + 원장 보정 전제). referenceId 로 중복차감 방지 가능.
 */
export async function chargeCreditIfEnabled(
  authUserId: string,
  feature: CreditFeature,
  referenceId?: string,
): Promise<void> {
  if (!CREDITS_ENABLED) return;
  try {
    await chargeCredit(authUserId, feature, { referenceId });
  } catch (e) {
    console.error('[credit-gate] charge failed:', e, { authUserId, feature });
  }
}
