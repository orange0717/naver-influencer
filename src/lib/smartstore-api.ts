/**
 * 네이버 스마트스토어 Commerce API 유틸리티
 * - OAuth 토큰 발급 (client_credentials + BCrypt 서명)
 * - 주문 조회
 * - 주문 유효성 검증
 *
 * 필요 환경변수:
 * - SMARTSTORE_CLIENT_ID: Commerce API 애플리케이션 ID
 * - SMARTSTORE_CLIENT_SECRET: Commerce API 애플리케이션 시크릿
 */

import bcrypt from 'bcryptjs';

const COMMERCE_API_BASE = 'https://api.commerce.naver.com/external';
const TOKEN_URL = `${COMMERCE_API_BASE}/v1/oauth2/token`;

// 토큰 캐시
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Commerce API OAuth 2.0 액세스 토큰 발급
 * BCrypt 서명 방식 (client_credentials)
 */
async function getAccessToken(): Promise<string> {
  // 캐시된 토큰이 아직 유효하면 재사용
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientId = process.env.SMARTSTORE_CLIENT_ID;
  const clientSecret = process.env.SMARTSTORE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SMARTSTORE_CLIENT_ID and SMARTSTORE_CLIENT_SECRET are required');
  }

  // 타임스탬프 (밀리초)
  const timestamp = Date.now();

  // BCrypt 서명: client_id + "_" + timestamp 를 client_secret으로 해싱
  const signaturePayload = `${clientId}_${timestamp}`;
  const clientSecretSign = await bcrypt.hash(signaturePayload, clientSecret);

  // 토큰 요청
  const params = new URLSearchParams({
    client_id: clientId,
    timestamp: String(timestamp),
    client_secret_sign: clientSecretSign,
    grant_type: 'client_credentials',
    type: 'SELF',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('Smart Store token error:', res.status, err);
    throw new Error(`Smart Store 인증 실패 (${res.status})`);
  }

  const data = await res.json();
  const token = data.access_token;
  const expiresIn = data.expires_in || 3600; // 기본 1시간

  // 캐시 저장
  cachedToken = {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return token;
}

/**
 * 상품주문 상세 조회
 * @param productOrderId 상품주문번호
 */
export async function getProductOrder(productOrderId: string) {
  const token = await getAccessToken();

  const res = await fetch(
    `${COMMERCE_API_BASE}/v1/pay-order/seller/product-orders/${productOrderId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.text().catch(() => '');
    console.error('Smart Store order query error:', res.status, err);
    throw new Error(`주문 조회 실패 (${res.status})`);
  }

  return res.json();
}

/**
 * 주문번호로 주문 검색 (주문번호 기반)
 * @param orderId 주문번호
 */
export async function searchOrderByOrderId(orderId: string) {
  const token = await getAccessToken();

  const res = await fetch(
    `${COMMERCE_API_BASE}/v1/pay-order/seller/orders/${orderId}/product-orders`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    },
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.text().catch(() => '');
    console.error('Smart Store order search error:', res.status, err);
    throw new Error(`주문 검색 실패 (${res.status})`);
  }

  return res.json();
}

/**
 * 주문 유효성 검증
 * - 결제 완료 상태인지 확인
 * - 디지털 상품(이용권)인지 확인
 */
export function isValidOrder(orderData: Record<string, unknown>): {
  valid: boolean;
  reason?: string;
  productOrderId?: string;
  orderAmount?: number;
} {
  if (!orderData) {
    return { valid: false, reason: '주문을 찾을 수 없습니다.' };
  }

  // 상품주문 정보
  const productOrder = (orderData as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (!productOrder) {
    return { valid: false, reason: '주문 정보가 올바르지 않습니다.' };
  }

  // 주문 상태 확인 (PAYED, DELIVERED, PURCHASE_DECIDED 등이 유효)
  const validStatuses = ['PAYED', 'DELIVERING', 'DELIVERED', 'PURCHASE_DECIDED', 'EXCHANGED', 'COLLECTING'];
  const status = String(productOrder.productOrderStatus || productOrder.lastProductOrderStatus || '');

  if (!validStatuses.includes(status)) {
    return { valid: false, reason: `주문 상태가 유효하지 않습니다. (${status || '알 수 없음'})` };
  }

  return {
    valid: true,
    productOrderId: String(productOrder.productOrderId || ''),
    orderAmount: Number(productOrder.totalPaymentAmount || productOrder.unitPrice || 0),
  };
}
