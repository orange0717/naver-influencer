import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 프로모션 코드 — 환경변수에서 로드 (형식: CODE:plan:days:label,CODE2:plan:days:label)
// 예: PROMO_CODES_CONFIG="NINFL7:blogger:7:블로거7일,WELCOME:blogger:30:웰컴"
function loadPromoCodes(): Record<string, { plan: 'blogger' | 'influencer'; days: number; label: string }> {
  const config = process.env.PROMO_CODES_CONFIG || '';
  const codes: Record<string, { plan: 'blogger' | 'influencer'; days: number; label: string }> = {};
  if (!config) return codes;
  config.split(',').forEach(entry => {
    const [code, plan, days, label] = entry.split(':');
    if (code && plan && days && label) {
      codes[code.trim().toUpperCase()] = {
        plan: plan.trim() as 'blogger' | 'influencer',
        days: parseInt(days.trim(), 10),
        label: label.trim(),
      };
    }
  });
  return codes;
}
const PROMO_CODES = loadPromoCodes();

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

    // 쪽지로 적용 결과 알림 (인플루언서 연결된 경우)
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('linked_influencer_id')
        .eq('id', user.userId)
        .single();

      if (userData?.linked_influencer_id) {
        const { data: inf } = await supabase
          .from('influencers')
          .select('naver_id')
          .eq('id', userData.linked_influencer_id)
          .single();

        if (inf?.naver_id) {
          await supabase.from('messages').insert({
            sender_id: user.userId,
            sender_name: 'N인플 시스템',
            receiver_naver_id: inf.naver_id,
            receiver_name: inf.naver_id,
            content: `[프로모션 코드 적용] ${promo.label}\n\n코드: ${code}\n플랜: ${promo.plan === 'blogger' ? '블로거' : '인플루언서'}\n기간: ${promo.days}일\n만료일: ${finalExpiry.toLocaleDateString('ko-KR')}\n\n유료 기능을 자유롭게 이용하세요!`,
          });
        }
      }
    } catch { /* 쪽지 발송 실패해도 코드 적용은 성공 */ }

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
