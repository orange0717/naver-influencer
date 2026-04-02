import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** GET: 광고 프로필 조회 */
export async function GET() {
  const cookieStore = await cookies();
  const naverId = cookieStore.get('naver_id')?.value;

  if (!naverId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: inf } = await supabase
    .from('influencers')
    .select('ad_fee_amount, ad_fee_text, ad_process')
    .eq('naver_id', naverId)
    .single();

  return NextResponse.json({
    ad_fee_amount: inf?.ad_fee_amount ?? null,
    ad_fee_text: inf?.ad_fee_text ?? '',
    ad_process: inf?.ad_process ?? '',
  });
}

/** PATCH: 광고 프로필 저장 */
export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const naverId = cookieStore.get('naver_id')?.value;

  if (!naverId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { ad_fee_amount, ad_fee_text, ad_process } = body;

  // 유효성 검사
  if (ad_fee_amount !== undefined && ad_fee_amount !== null) {
    if (typeof ad_fee_amount !== 'number' || ad_fee_amount < 0 || ad_fee_amount > 99999999) {
      return NextResponse.json({ error: '원고료 금액이 올바르지 않습니다.' }, { status: 400 });
    }
  }
  if (ad_fee_text !== undefined && typeof ad_fee_text === 'string' && ad_fee_text.length > 200) {
    return NextResponse.json({ error: '원고료 설명은 200자 이내입니다.' }, { status: 400 });
  }
  if (ad_process !== undefined && typeof ad_process === 'string' && ad_process.length > 1000) {
    return NextResponse.json({ error: '진행방법은 1000자 이내입니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const updates: Record<string, unknown> = {};

  if (ad_fee_amount !== undefined) updates.ad_fee_amount = ad_fee_amount;
  if (ad_fee_text !== undefined) updates.ad_fee_text = ad_fee_text || null;
  if (ad_process !== undefined) updates.ad_process = ad_process || null;

  const { error } = await supabase
    .from('influencers')
    .update(updates)
    .eq('naver_id', naverId);

  if (error) {
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
