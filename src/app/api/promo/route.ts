import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 프로모션 코드 목록 (하드코딩 — 추후 DB로 이동 가능)
const PROMO_CODES: Record<string, { plan: 'blogger' | 'influencer'; days: number; label: string }> = {
  'NINFL7': { plan: 'blogger', days: 7, label: '블로거 7일 무료' },
  'NINFL30': { plan: 'blogger', days: 30, label: '블로거 30일 무료' },
  'NINFL90': { plan: 'blogger', days: 90, label: '블로거 90일 무료' },
  'INFLU7': { plan: 'influencer', days: 7, label: '인플루언서 7일 무료' },
  'INFLU30': { plan: 'influencer', days: 30, label: '인플루언서 30일 무료' },
  'INFLU90': { plan: 'influencer', days: 90, label: '인플루언서 90일 무료' },
  'WELCOME': { plan: 'blogger', days: 30, label: '웰컴 블로거 30일 무료' },
};

/**
 * POST /api/promo — 프로모션 코드 적용
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const code = (body.code || '').trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: '코드를 입력해주세요.' }, { status: 400 });
    }

    const promo = PROMO_CODES[code];
    if (!promo) {
      return NextResponse.json({ error: '유효하지 않은 코드입니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 이미 사용한 코드인지 확인
    const { data: existing } = await supabase
      .from('promo_usage')
      .select('id')
      .eq('user_id', user.userId)
      .eq('code', code)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: '이미 사용한 코드입니다.' }, { status: 400 });
    }

    // 만료일 계산
    const now = new Date();
    const expiresAt = new Date(now.getTime() + promo.days * 24 * 60 * 60 * 1000);

    // 현재 구독 정보 확인
    const { data: currentSub } = await supabase
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', user.userId)
      .single();

    // 기존 만료일이 미래이면 거기에 추가
    let finalExpiry = expiresAt;
    if (currentSub?.subscription_expires_at) {
      const currentExpiry = new Date(currentSub.subscription_expires_at);
      if (currentExpiry > now) {
        finalExpiry = new Date(currentExpiry.getTime() + promo.days * 24 * 60 * 60 * 1000);
      }
    }

    // 구독 업데이트
    await supabase
      .from('users')
      .update({
        subscription_plan: promo.plan,
        subscription_expires_at: finalExpiry.toISOString(),
      })
      .eq('id', user.userId);

    // 사용 기록 저장
    await supabase
      .from('promo_usage')
      .insert({
        user_id: user.userId,
        code,
        plan: promo.plan,
        days: promo.days,
      });

    return NextResponse.json({
      success: true,
      plan: promo.plan,
      days: promo.days,
      label: promo.label,
      expires_at: finalExpiry.toISOString(),
    });
  } catch {
    return NextResponse.json({ error: '코드 적용 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
