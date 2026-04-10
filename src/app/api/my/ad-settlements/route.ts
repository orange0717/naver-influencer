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

/** GET: 정산내역 목록 조회 */
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
    .select('id, settled_date, client_name, fee, commission, net_amount')
    .eq('naver_id', naverId)
    .order('settled_date', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[ad-settlements] GET error:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  return NextResponse.json({ settlements: data || [] });
}
