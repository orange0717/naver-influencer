import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** 인증된 유저의 linked_influencer_id로 naver_id 조회 */
async function getLinkedNaverId(request: Request) {
  const auth = await getAuthUser(request);
  if (!auth) return null;

  const linkedId = auth.user.linked_influencer_id;
  if (!linkedId) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('influencers')
    .select('naver_id')
    .eq('id', linkedId)
    .single();

  return data?.naver_id ?? null;
}

/** GET: 정산내역 목록 조회 (최근 12개월) */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const naverId = await getLinkedNaverId(request);
  if (!naverId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ad_settlements')
    .select('id, year_month, count, amount, memo')
    .eq('naver_id', naverId)
    .order('year_month', { ascending: false })
    .limit(24);

  if (error) {
    console.error('[ad-settlements] GET error:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  return NextResponse.json({ settlements: data || [] });
}

/** POST: 정산내역 추가/수정 (year_month 기준 upsert) */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const naverId = await getLinkedNaverId(request);
  if (!naverId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = await request.json();
  const yearMonth = (body.year_month || '').trim();
  const count = Number(body.count) || 0;
  const amount = Number(body.amount) || 0;
  const memo = (body.memo || '').trim().slice(0, 500);

  // year_month 형식 검증
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
    return NextResponse.json({ error: '올바른 연월 형식이 아닙니다. (YYYY-MM)' }, { status: 400 });
  }

  if (count < 0 || count > 9999) {
    return NextResponse.json({ error: '건수는 0~9999 사이여야 합니다.' }, { status: 400 });
  }

  if (amount < 0 || amount > 999999999) {
    return NextResponse.json({ error: '금액이 범위를 초과합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('ad_settlements')
    .upsert(
      { naver_id: naverId, year_month: yearMonth, count, amount, memo },
      { onConflict: 'naver_id,year_month' },
    );

  if (error) {
    console.error('[ad-settlements] POST error:', error);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** DELETE: 정산내역 삭제 */
export async function DELETE(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) {
    return rateLimitResponse();
  }

  const naverId = await getLinkedNaverId(request);
  if (!naverId) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('ad_settlements')
    .delete()
    .eq('id', id)
    .eq('naver_id', naverId);

  if (error) {
    console.error('[ad-settlements] DELETE error:', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
