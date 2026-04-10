/**
 * 포트원 V2 결제 검증 + 라이선스 발급 공용 함수
 * /api/portone/complete 및 /api/portone/webhook에서 공유
 */

import { createServiceClient } from './supabase-server';
import { PAYMENT_PLANS } from './payment-config';

const PORTONE_API_BASE = 'https://api.portone.io';

interface VerifyResult {
  verified: boolean;
  licenseGranted?: boolean;
  durationDays?: number;
  alreadyProcessed?: boolean;
  extended?: boolean;
  error?: string;
}

/**
 * PortOne API에서 결제 상세 정보 조회
 */
async function getPaymentFromPortOne(paymentId: string) {
  const apiSecret = process.env.PORTONE_API_SECRET;
  if (!apiSecret) throw new Error('PORTONE_API_SECRET 미설정');

  const res = await fetch(`${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `PortOne ${apiSecret}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PortOne API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * 결제 검증 + 라이선스 발급
 * complete API와 webhook에서 공용으로 사용
 */
export async function verifyAndGrantLicense(
  paymentId: string,
  userId?: string,
): Promise<VerifyResult> {
  // 1. PortOne API에서 결제 조회
  const payment = await getPaymentFromPortOne(paymentId);

  // 2. 결제 상태 확인
  if (payment.status !== 'PAID') {
    return { verified: false, error: '결제가 완료되지 않았습니다.' };
  }

  // 3. customData에서 userId + planKey 추출
  let customData: { userId?: string; planKey?: string } = {};
  try {
    customData = JSON.parse(payment.customData || '{}');
  } catch { /* ignore */ }

  const buyerId = userId || customData.userId;
  const planKey = customData.planKey || 'PRO_ANNUAL';

  if (!buyerId) {
    return { verified: false, error: '사용자 정보를 확인할 수 없습니다.' };
  }

  // 4. 플랜 확인 + 금액 검증
  const plan = PAYMENT_PLANS[planKey];
  if (!plan) {
    return { verified: false, error: '유효하지 않은 플랜입니다.' };
  }

  const paidAmount = payment.amount?.total;
  if (paidAmount !== plan.amount) {
    return { verified: false, error: `결제 금액이 일치하지 않습니다. (${paidAmount} != ${plan.amount})` };
  }

  // 5. 중복 처리 방지
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('payment_transactions')
    .select('id')
    .eq('order_id', paymentId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { verified: true, alreadyProcessed: true };
  }

  // 6. 트랜잭션 기록
  const { error: txError } = await supabase
    .from('payment_transactions')
    .insert({
      user_id: buyerId,
      order_id: paymentId,
      payment_key: payment.pgTxId || null,
      amount: plan.amount,
      plan_name: plan.planName,
      duration_days: plan.durationDays,
      status: 'PAID',
    });

  if (txError) {
    console.error('[PortOne] 트랜잭션 기록 실패:', txError);
    return { verified: false, error: '트랜잭션 기록에 실패했습니다.' };
  }

  // 7. 기존 활성 라이선스 확인 (연장 처리)
  const now = new Date();
  const { data: existingActive } = await supabase
    .from('licenses')
    .select('*')
    .eq('buyer_id', buyerId)
    .eq('is_used', true)
    .gt('expires_at', now.toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single();

  const baseDate = existingActive ? new Date(existingActive.expires_at) : now;
  const expiresAt = new Date(baseDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  // 8. 라이선스 생성
  const licenseCode = `PORT-${paymentId.slice(-12).toUpperCase()}`;

  const { error: licenseError } = await supabase
    .from('licenses')
    .insert({
      license_code: licenseCode,
      plan_name: plan.planName,
      duration_days: plan.durationDays,
      price: plan.amount,
      buyer_id: buyerId,
      buyer_name: buyerId,
      buyer_type: 'influencer',
      is_used: true,
      activated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      order_id: paymentId,
    });

  if (licenseError) {
    console.error('[PortOne] 라이선스 생성 실패:', licenseError);
    return { verified: true, licenseGranted: false, error: '라이선스 생성에 실패했습니다.' };
  }

  return {
    verified: true,
    licenseGranted: true,
    durationDays: plan.durationDays,
    extended: !!existingActive,
  };
}

/**
 * Standard Webhooks 서명 검증
 */
export function verifyWebhookSignature(
  body: string,
  headers: { id: string; timestamp: string; signature: string },
): boolean {
  const secret = process.env.PORTONE_WEBHOOK_SECRET;
  if (!secret) return false;

  // 타임스탬프 유효성 (±5분)
  const ts = parseInt(headers.timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  // HMAC-SHA256 서명 검증
  const crypto = require('crypto');
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${headers.id}.${headers.timestamp}.${body}`;
  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  const signatures = headers.signature.split(' ');
  return signatures.some((sig: string) => {
    const sigValue = sig.replace(/^v1,/, '');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(sigValue),
      );
    } catch {
      return false;
    }
  });
}
