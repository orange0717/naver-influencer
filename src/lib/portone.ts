/**
 * 포트원 V2 결제 검증 + 라이선스 발급 공용 함수
 * /api/portone/complete 및 /api/portone/webhook에서 공유
 */

import crypto from 'crypto';
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
 * 암호학적으로 안전한 paymentId 생성
 */
export function generatePaymentId(): string {
  return `pay-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
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

  // 3. payment_intents 에서 서버가 저장한 진실 조회 (customData 변조 방지)
  const supabase = createServiceClient();
  const { data: intent } = await supabase
    .from('payment_intents')
    .select('user_id, plan_key, amount, expires_at')
    .eq('payment_id', paymentId)
    .single();

  if (!intent) {
    console.error('[PortOne] payment_intent 없음:', paymentId);
    return { verified: false, error: '결제 요청 기록을 찾을 수 없습니다.' };
  }

  // intent 만료 확인 (prepare 후 30분 내 complete)
  if (new Date(intent.expires_at) < new Date()) {
    return { verified: false, error: '결제 요청이 만료되었습니다.' };
  }

  const planKey = intent.plan_key as string;
  const storedUserId = intent.user_id as string;

  // 4. 소유권 검증 — complete 호출자와 intent 저장 시 userId 일치 확인
  if (userId && storedUserId !== userId) {
    console.error(`[PortOne] 소유권 불일치: caller=${userId}, intent=${storedUserId}`);
    return { verified: false, error: '결제 사용자 정보가 일치하지 않습니다.' };
  }

  const buyerId = storedUserId;

  // 5. 플랜 확인 + 금액 검증
  const plan = PAYMENT_PLANS[planKey];
  if (!plan) {
    return { verified: false, error: '유효하지 않은 플랜입니다.' };
  }

  // 0원 플랜 차단 (가격 미설정 상태에서 결제 방지)
  if (plan.amount <= 0) {
    return { verified: false, error: '아직 가격이 설정되지 않은 플랜입니다.' };
  }

  const paidAmount = payment.amount?.total;
  if (paidAmount !== plan.amount) {
    console.error(`[PortOne] 금액 불일치: paid=${paidAmount}, expected=${plan.amount}, paymentId=${paymentId}`);
    return { verified: false, error: '결제 금액이 일치하지 않습니다.' };
  }

  // 6. 트랜잭션 기록 (UNIQUE 제약으로 중복 방지 — TOCTOU 레이스 컨디션 해결)
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
    // UNIQUE 위반 (23505) = 이미 처리된 결제
    if (txError.code === '23505') {
      return { verified: true, alreadyProcessed: true };
    }
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

  // 8. 라이선스 생성 (암호학적 랜덤 코드)
  const licenseCode = `PORT-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

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

  // 9. users 테이블 구독 상태 업데이트
  const { error: userUpdateError } = await supabase
    .from('users')
    .update({
      subscription_plan: plan.planName,
      subscription_expires_at: expiresAt.toISOString(),
    })
    .eq('id', buyerId);

  if (userUpdateError) {
    console.error('[PortOne] 구독 상태 업데이트 실패:', userUpdateError);
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
