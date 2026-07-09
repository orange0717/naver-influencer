/**
 * portone.ts — PortOne V2 API 서버 wrapper
 *
 * 환경변수:
 *   - PORTONE_API_SECRET (V2 API 시크릿, 'PortOne ${secret}' 헤더로 사용)
 *   - PORTONE_WEBHOOK_SECRET (Standard Webhooks 서명 검증용)
 *
 * 공식 문서: https://developers.portone.io/api/rest-v2
 */

const PORTONE_API_BASE = 'https://api.portone.io';

function getApiSecret(): string {
  const s = process.env.PORTONE_API_SECRET;
  if (!s) throw new Error('PORTONE_API_SECRET is not set');
  return s;
}

function authHeader(): { Authorization: string } {
  return { Authorization: 'PortOne ' + getApiSecret() };
}

/* ── 결제 사전등록 ─────────────────────────────────────────────────────
   금액·통화를 PortOne 측에 미리 잠금. 클라이언트가 결제창을 띄울 때
   이 paymentId 를 그대로 사용해야 변조 검증이 작동한다. */
export async function preRegisterPayment(
  paymentId: string,
  totalAmount: number
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}/pre-register`,
    {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalAmount, taxFreeAmount: 0, currency: 'KRW' }),
    }
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[PortOne] pre-register failed:', res.status, err);
    return { ok: false, error: err };
  }
  return { ok: true };
}

/* ── 결제 조회 (paymentId 기준) ─────────────────────────────────────── */
export interface PortOnePayment {
  id: string;
  status: 'READY' | 'PAID' | 'PARTIAL_CANCELLED' | 'CANCELLED' | 'VIRTUAL_ACCOUNT_ISSUED' | 'PAY_PENDING' | 'FAILED';
  amount?: { total: number };
  transactionId?: string;
  method?: { type: string };
  customer?: { id?: string; email?: string; name?: { full?: string } };
  customData?: string;
  paidAt?: string;
}

export async function getPayment(paymentId: string): Promise<PortOnePayment | null> {
  const res = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    { headers: authHeader() }
  );
  if (!res.ok) {
    console.error('[PortOne] getPayment failed:', res.status, await res.text().catch(() => ''));
    return null;
  }
  return (await res.json()) as PortOnePayment;
}

/* ── 빌링키 조회 ─────────────────────────────────────────────────────── */
export interface PortOneBillingKey {
  billingKey: string;
  status: 'ISSUED' | 'DELETED';
  channels?: Array<{ key: string }>;
  methods?: Array<{ type: string; card?: { issuer?: string; number?: string } }>;
  issuedAt?: string;
  deletedAt?: string;
}

export async function getBillingKey(billingKey: string): Promise<PortOneBillingKey | null> {
  const res = await fetch(
    `${PORTONE_API_BASE}/billing-keys/${encodeURIComponent(billingKey)}`,
    { headers: authHeader() }
  );
  if (!res.ok) {
    console.error('[PortOne] getBillingKey failed:', res.status, await res.text().catch(() => ''));
    return null;
  }
  return (await res.json()) as PortOneBillingKey;
}

/* ── 빌링키로 즉시 결제 (구독 자동청구) ──────────────────────────────────
   POST /payments/{paymentId}/billing-key
   body: { billingKey, orderName, amount: { total }, currency } */
export interface BillingChargeResult {
  ok: boolean;
  status?: string;
  transactionId?: string;
  raw?: unknown;
  error?: string;
}

export async function chargeWithBillingKey(opts: {
  paymentId: string;
  billingKey: string;
  orderName: string;
  totalAmount: number;
  customer?: { id?: string; email?: string };
}): Promise<BillingChargeResult> {
  const res = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(opts.paymentId)}/billing-key`,
    {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billingKey: opts.billingKey,
        orderName: opts.orderName,
        amount: { total: opts.totalAmount },
        currency: 'KRW',
        customer: opts.customer,
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[PortOne] billing charge failed:', res.status, data);
    return { ok: false, error: (data as { message?: string })?.message || `HTTP ${res.status}`, raw: data };
  }
  return { ok: true, status: (data as { status?: string }).status, transactionId: (data as { transactionId?: string }).transactionId, raw: data };
}

/* ── 빌링키 삭제 (구독 취소 시) ───────────────────────────────────────── */
export async function deleteBillingKey(billingKey: string): Promise<boolean> {
  const res = await fetch(
    `${PORTONE_API_BASE}/billing-keys/${encodeURIComponent(billingKey)}`,
    { method: 'DELETE', headers: authHeader() }
  );
  if (!res.ok) {
    console.error('[PortOne] deleteBillingKey failed:', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}

/* ── Standard Webhooks 서명 검증 ───────────────────────────────────── */
export async function verifyWebhookSignature(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  webhookSecret: string
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  // timestamp 5분 허용 (재전송 공격 방지)
  const now = Math.floor(Date.now() / 1000);
  const tsInt = parseInt(headers.timestamp, 10);
  if (!tsInt || Math.abs(now - tsInt) > 300) return false;

  const secretRaw = webhookSecret.startsWith('whsec_') ? webhookSecret.slice(6) : webhookSecret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = Uint8Array.from(atob(secretRaw), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const signedPayload = new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${rawBody}`);
  const key = await crypto.subtle.importKey(
    'raw', secretBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, signedPayload as BufferSource);
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  const received = headers.signature.split(' ')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .map((s) => s.slice(3));
  return received.reduce((matched, sig) => timingSafeEqualStr(sig, expected) || matched, false);
}

/** 상수 시간 문자열 비교 (타이밍 공격 방지) */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
