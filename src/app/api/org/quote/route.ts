import { NextRequest, NextResponse } from 'next/server';
import { BILLING_CYCLE, CURRENCY, MIN_SEATS, PLANS, calcPrice, invitableSeats, isPlanId } from '@/lib/pricing';
import { orgError } from '@/lib/enterprise-org';

/**
 * POST /api/org/quote — 좌석 수에 따른 월 청구액 계산.
 *
 * 계산 전용이라 부수효과도 인증도 없다. 화면이 표시하는 금액과 주문 생성 금액이
 * 같은 산식에서 나오도록 하는 것이 목적이며, 실제 청구액은 주문 생성 시 서버가
 * 다시 계산해 검증한다(여기 응답을 신뢰하지 않는다).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return orgError('INVALID_PLAN', '잘못된 요청입니다.', 400);
  }

  const { planId, seatCount } = (body ?? {}) as { planId?: unknown; seatCount?: unknown };

  if (!isPlanId(planId)) {
    return orgError('INVALID_PLAN', '요금제를 선택해주세요.', 400);
  }
  if (typeof seatCount !== 'number' || !Number.isInteger(seatCount) || seatCount < MIN_SEATS) {
    return orgError('INVALID_SEATS', `이용 인원은 ${MIN_SEATS}명 이상이어야 합니다.`, 400);
  }

  return NextResponse.json({
    planId,
    seatCount,
    seatPrice: PLANS[planId].seatPrice,
    amount: calcPrice(planId, seatCount),
    currency: CURRENCY,
    cycle: BILLING_CYCLE,
    invitableSeats: invitableSeats(seatCount),
  });
}
