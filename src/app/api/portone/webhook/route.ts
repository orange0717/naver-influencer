import { NextRequest, NextResponse } from 'next/server';
import { verifyAndGrantLicense, verifyWebhookSignature } from '@/lib/portone';

export const dynamic = 'force-dynamic';

/**
 * POST /api/portone/webhook
 * 포트원 웹훅 수신 — 결제 완료 시 라이선스 발급 (안전망)
 * Standard Webhooks 서명 검증
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    // 서명 검증
    const webhookId = req.headers.get('webhook-id') || '';
    const webhookTimestamp = req.headers.get('webhook-timestamp') || '';
    const webhookSignature = req.headers.get('webhook-signature') || '';

    if (!webhookId || !webhookTimestamp || !webhookSignature) {
      return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 });
    }

    const isValid = verifyWebhookSignature(body, {
      id: webhookId,
      timestamp: webhookTimestamp,
      signature: webhookSignature,
    });

    if (!isValid) {
      console.error('[PortOne Webhook] 서명 검증 실패');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 이벤트 파싱
    const event = JSON.parse(body);

    // Transaction.Paid 이벤트만 처리
    if (event.type !== 'Transaction.Paid') {
      return NextResponse.json({ ok: true });
    }

    const paymentId = event.data?.paymentId;
    if (!paymentId) {
      return NextResponse.json({ ok: true });
    }

    // 검증 + 라이선스 발급 (userId는 customData에서 추출)
    const result = await verifyAndGrantLicense(paymentId);

    if (!result.verified) {
      console.error('[PortOne Webhook] 검증 실패:', result.error);
    }

    // 웹훅은 항상 200 반환 (재시도 방지)
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PortOne Webhook] error:', error);
    // 웹훅은 항상 200 반환
    return NextResponse.json({ ok: true });
  }
}
