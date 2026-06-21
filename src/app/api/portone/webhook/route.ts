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
import { PAYMENT_ID_REGEX, completeBillingKeyIssue } from '@/lib/billing';

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
        // 멱등성: 이미 CANCELLED 인 행은 다시 갱신하지 않음 (재전송 중복 차단)
        const pid = payload.data?.paymentId;
        if (pid && PAYMENT_ID_REGEX.test(pid)) {
          await supa
            .from('payment_transactions')
            .update({ status: 'CANCELLED' })
            .eq('payment_id', pid)
            .neq('status', 'CANCELLED');
        } else if (pid) {
          console.warn('[PortOne webhook] Cancelled: 잘못된 paymentId 형식 무시', pid);
        }
        break;
      }
      case 'Transaction.Failed': {
        // 멱등성: 이미 FAILED 인 행은 무시
        const pid = payload.data?.paymentId;
        if (pid && PAYMENT_ID_REGEX.test(pid)) {
          await supa
            .from('payment_transactions')
            .update({ status: 'FAILED' })
            .eq('payment_id', pid)
            .neq('status', 'FAILED');
        } else if (pid) {
          console.warn('[PortOne webhook] Failed: 잘못된 paymentId 형식 무시', pid);
        }
        break;
      }
      case 'BillingKey.Deleted': {
        // 멱등성: 이미 cancelled 상태인 구독은 다시 갱신하지 않음 (cancelled_at 덮어쓰기 방지)
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
            .eq('billing_key', bk)
            .neq('status', 'cancelled');
        }
        break;
      }
      // Transaction.Paid: 정상 흐름(chargePlan / billing-complete 콜백)에서 이미 동기 처리되지만,
      // 클라이언트가 complete 콜백을 보내기 전에 브라우저가 닫히면 구독이 미활성으로 남는다.
      // 웹훅을 멱등 fallback 으로 사용해 결제 미반영을 막는다. completeBillingKeyIssue 는
      // payment_id UNIQUE + 기존 구독 정리로 멱등하며, 내부에서 PortOne PAID 를 재확인한다.
      case 'Transaction.Paid': {
        const pid = payload.data?.paymentId;
        console.log('[PortOne webhook] Paid:', pid);
        if (pid && PAYMENT_ID_REGEX.test(pid)) {
          const { data: existingTx } = await supa
            .from('payment_transactions')
            .select('id')
            .eq('payment_id', pid)
            .eq('status', 'PAID')
            .maybeSingle();
          if (!existingTx) {
            const { data: intent } = await supa
              .from('payment_intents')
              .select('user_id, plan_key')
              .eq('payment_id', pid)
              .maybeSingle();
            if (intent?.user_id && intent?.plan_key) {
              const r = await completeBillingKeyIssue({
                userId: intent.user_id,
                paymentId: pid,
                planKey: intent.plan_key,
              });
              if (!r.ok) console.error('[PortOne webhook] fallback activation failed:', pid, r.error);
              else console.log('[PortOne webhook] fallback activated subscription:', pid);
            }
          }
        }
        break;
      }
      default:
        console.log('[PortOne webhook] unhandled event:', type);
    }
  } catch (e) {
    console.error('[PortOne webhook] handler error:', e);
    // 재전송 폭주 방지: 200 OK 반환
  }

  return NextResponse.json({ ok: true });
}
