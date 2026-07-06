import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';

/**
 * GET /api/coupons/available
 *
 * 로그인한 회원의 이메일로 발급된 미사용 쿠폰 목록.
 * 마이페이지에서 코드 입력 없이 바로 등록할 수 있도록 노출용.
 */
export async function GET(request: NextRequest) {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('email')
    .eq('id', authUser.userId)
    .single();

  if (userError || !userRow?.email) {
    return NextResponse.json({ error: '사용자 정보를 확인할 수 없습니다.' }, { status: 400 });
  }

  const { data: coupons, error } = await supabase
    .from('coupons')
    .select('code, name, plan, duration_days')
    .eq('target_email', userRow.email.toLowerCase())
    .eq('used', false)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[coupons/available] error:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  return NextResponse.json({ items: coupons || [] });
}
