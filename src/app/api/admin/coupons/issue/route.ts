import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

function generateCouponCode(durationDays: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `FREE${durationDays}-${suffix}`;
}

/**
 * POST /api/admin/coupons/issue
 *
 * 관리자 전용: 특정 회원 이메일 대상 1회용 무료 체험 쿠폰 발급
 *
 * Body: { targetEmail: string, durationDays?: number (기본 7), plan?: 'BLOGGER'|'INFLUENCER' (기본 INFLUENCER), name?: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  let body: { targetEmail?: string; durationDays?: number; plan?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const targetEmail = String(body.targetEmail || '').trim().toLowerCase();
  const durationDays = Math.max(1, Math.min(365, parseInt(String(body.durationDays ?? 7), 10) || 7));
  const plan = body.plan === 'BLOGGER' ? 'BLOGGER' : 'INFLUENCER';
  const name = String(body.name || `${durationDays}일 무료 체험 쿠폰`).slice(0, 100);

  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return NextResponse.json({ error: '올바른 대상 회원 이메일을 입력하세요.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCouponCode(durationDays);
    const { data, error } = await supabase
      .from('coupons')
      .insert({ code, name, target_email: targetEmail, plan, duration_days: durationDays, created_by: auth.authUser.userId })
      .select()
      .single();

    if (!error) {
      return NextResponse.json({ coupon: data });
    }
    if (error.code !== '23505') { // unique_violation 이외의 오류는 즉시 중단
      console.error('[admin/coupons/issue] insert error:', error);
      return NextResponse.json({ error: '쿠폰 발급 실패' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: '쿠폰 코드 생성에 반복 실패했습니다. 다시 시도해주세요.' }, { status: 500 });
}
