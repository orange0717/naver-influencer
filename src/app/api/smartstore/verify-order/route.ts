import { NextRequest, NextResponse } from 'next/server';
import { getCookieUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { getProductOrder, searchOrderByOrderId, isValidOrder } from '@/lib/smartstore-api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/smartstore/verify-order
 * 스마트스토어 주문번호를 검증하고 라이선스를 자동 활성화
 *
 * Body: { orderId: string }
 * - orderId: 스마트스토어 주문번호 또는 상품주문번호
 */
export async function POST(req: NextRequest) {
  try {
    // 1. 인증 확인
    const user = await getCookieUser();
    if (!user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 },
      );
    }

    // 2. 주문번호 추출
    const body = await req.json();
    const orderId = (body.orderId || '').trim();

    if (!orderId) {
      return NextResponse.json(
        { error: '주문번호를 입력해주세요.' },
        { status: 400 },
      );
    }

    // 3. 이미 사용된 주문번호인지 확인
    const supabase = createServiceClient();
    const { data: existingLicense } = await supabase
      .from('licenses')
      .select('id, buyer_id')
      .eq('order_id', orderId)
      .eq('is_used', true)
      .single();

    if (existingLicense) {
      return NextResponse.json(
        { error: '이미 사용된 주문번호입니다.' },
        { status: 409 },
      );
    }

    // 4. Commerce API 환경변수 확인
    const hasApiKeys = !!(process.env.SMARTSTORE_CLIENT_ID && process.env.SMARTSTORE_CLIENT_SECRET);

    let orderValid = false;
    let productOrderId = orderId;
    let orderAmount = 9900;

    if (hasApiKeys) {
      // 5a. Commerce API로 주문 검증
      try {
        // 상품주문번호로 직접 조회 시도
        let orderData = await getProductOrder(orderId);

        // 못 찾으면 주문번호로 검색 시도
        if (!orderData) {
          const searchResult = await searchOrderByOrderId(orderId);
          if (searchResult?.data?.length > 0) {
            const firstProductOrder = searchResult.data[0];
            productOrderId = firstProductOrder.productOrderId || orderId;
            orderData = await getProductOrder(productOrderId);
          }
        }

        if (!orderData) {
          return NextResponse.json(
            { error: '주문을 찾을 수 없습니다. 주문번호를 확인해주세요.' },
            { status: 404 },
          );
        }

        // 유효성 검증
        const validation = isValidOrder(orderData);
        if (!validation.valid) {
          return NextResponse.json(
            { error: validation.reason || '유효하지 않은 주문입니다.' },
            { status: 400 },
          );
        }

        orderValid = true;
        if (validation.productOrderId) productOrderId = validation.productOrderId;
        if (validation.orderAmount) orderAmount = validation.orderAmount;

      } catch (apiError) {
        console.error('Smart Store API error:', apiError);
        return NextResponse.json(
          { error: '스마트스토어 주문 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
          { status: 503 },
        );
      }
    } else {
      // 5b. API 키 없을 때 — 수동 승인 모드 (주문번호만 기록)
      // 관리자가 나중에 확인 가능하도록
      orderValid = true;
      console.log(`[SmartStore] Manual mode - order ${orderId} for user ${user.id}`);
    }

    if (!orderValid) {
      return NextResponse.json(
        { error: '주문 검증에 실패했습니다.' },
        { status: 400 },
      );
    }

    // 6. 기존 활성 라이선스 확인 (연장 처리를 위해)
    const now = new Date();
    const { data: existingActive } = await supabase
      .from('licenses')
      .select('*')
      .eq('buyer_id', user.id)
      .eq('is_used', true)
      .gt('expires_at', now.toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .single();

    // 7. 만료일 계산 (기존 라이선스가 있으면 연장)
    const durationDays = 30;
    const baseDate = existingActive
      ? new Date(existingActive.expires_at)
      : now;
    const expiresAt = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // 8. 라이선스 생성
    const licenseCode = `STORE-${productOrderId.slice(-12).toUpperCase()}`;

    const { data: newLicense, error: insertError } = await supabase
      .from('licenses')
      .insert({
        license_code: licenseCode,
        plan_name: 'PRO',
        duration_days: durationDays,
        price: orderAmount,
        buyer_id: user.id,
        buyer_name: user.id,
        buyer_type: user.type,
        is_used: true,
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        order_id: orderId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('License creation error:', insertError);
      return NextResponse.json(
        { error: '라이선스 생성 중 오류가 발생했습니다.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      license: {
        plan_name: newLicense.plan_name,
        duration_days: newLicense.duration_days,
        activated_at: newLicense.activated_at,
        expires_at: newLicense.expires_at,
      },
      extended: !!existingActive,
    });

  } catch (error) {
    console.error('SmartStore verify-order error:', error);
    return NextResponse.json(
      { error: '주문 확인 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
