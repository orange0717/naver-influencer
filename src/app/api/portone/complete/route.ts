import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { paymentLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { verifyAndGrantLicense } from '@/lib/portone';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portone/complete
 * 결제 완료 검증 — PortOne API 조회 + 라이선스 발급
 *
 * Body: { paymentId: string }
 */
export async function POST(req: NextRequest) {
  try {
    // Rate Limiting
    const ip = getClientIp(req);
    if (await paymentLimiter.check(ip)) return rateLimitResponse();

    // 인증 확인 (Supabase Auth만 허용)
    const authResult = await getAuthUser(req);
    if (!authResult?.userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const userId = authResult.userId;

    // paymentId 확인
    const body = await req.json();
    const paymentId = (body.paymentId || '').trim();

    if (!paymentId || !/^pay-\d{13,}-[a-f0-9]{12}$/i.test(paymentId)) {
      return NextResponse.json({ error: '유효하지 않은 paymentId입니다.' }, { status: 400 });
    }

    // 검증 + 라이선스 발급
    const result = await verifyAndGrantLicense(paymentId, userId);

    if (!result.verified) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[PortOne] complete error:', error);
    return NextResponse.json(
      { error: '결제 확인 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
