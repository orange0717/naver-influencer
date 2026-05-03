/**
 * POST /api/portone/webhook
 * PortOne V2 Standard Webhooks 수신.
 *
 * 처리 이벤트:
 *   - Transaction.Paid              : 결제 성공 (자동청구 결과 비동기 동기화)
 *   - Transaction.Cancelled         : 환불·취소
 *   - Transaction.Failed            : 결제 실패
 *   - BillingKey.Deleted            : 빌링키 삭제
 *
 * 모든 응답은 200 OK 로 반환 (재전송 폭주 방지). 검증 실패 시만 4xx.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/portone';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[PortOne webhook] PORTONE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const valid = await verifyWebhookSignature(
    rawBody,
    {
      id: req.headers.get('webhook-id') || '',
      timestamp: req.headers.get('webhook-timestamp') || '',
      signature: req.headers.get('webhook-signature') || '',
    },
    secret
  );
  if (!valid) {
    return new NextResponse('Invalid signature', { status: 400 });
  }

  let payload: { type?: string; data?: { paymentId?: string; transactionId?: string; billingKey?: string } } = {};
  try { payload = JSON.parse(rawBody); } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const type = payload.type || '';
  const supa = createServiceClient();

  try {
    switch (type) {
      case 'Transaction.Cancelled': {
        // 환불/취소 → payment_transactions.status 갱신
        const pid = payload.data?.paymentId;
        if (pid) {
          await supa.from('payment_transactions').update({ status: 'CANCELLED' }).eq('payment_id', pid);
        }
        break;
      }
      case 'Transaction.Failed': {
        const pid = payload.data?.paymentId;
        if (pid) {
          await supa.from('payment_transactions').update({ status: 'FAILED' }).eq('payment_id', pid);
        }
        break;
      }
      case 'BillingKey.Deleted': {
        const bk = payload.data?.billingKey;
        if (bk) {
          await supa
            .from('subscriptions')
            .update({
              status: 'cancelled',
              billing_key: null,
              cancelled_at: new Date().toISOString(),
              next_charge_at: null,
            })
            .eq('billing_key', bk);
        }
        break;
      }
      // Transaction.Paid 는 chargePlan() 흐름에서 이미 동기 처리됨 — 로깅만.
      case 'Transaction.Paid':
        console.log('[PortOne webhook] Paid:', payload.data?.paymentId);
        break;
      default:
        console.log('[PortOne webhook] unhandled event:', type);
    }
  } catch (e) {
    console.error('[PortOne webhook] handler error:', e);
    // 재전송 폭주 방지: 200 OK 반환
  }

  return NextResponse.json({ ok: true });
}
