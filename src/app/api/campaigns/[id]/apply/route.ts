import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { campaignLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** 캠페인 신청 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const supabase = createServiceClient();

  // 인플루언서 연결 확인
  const naverId = auth.user.linked_influencer_id;
  if (!naverId) {
    return NextResponse.json({ error: '인플루언서 연결이 필요합니다.' }, { status: 400 });
  }

  // 인플루언서 naver_id 조회
  const { data: inf } = await supabase
    .from('influencers')
    .select('naver_id')
    .eq('id', naverId)
    .single();

  if (!inf) {
    return NextResponse.json({ error: '인플루언서 정보를 찾을 수 없습니다.' }, { status: 400 });
  }

  // 캠페인 확인
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, status, deadline, max_participants')
    .eq('id', id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (campaign.status !== 'active') {
    return NextResponse.json({ error: '모집중인 캠페인이 아닙니다.' }, { status: 400 });
  }

  if (campaign.deadline) {
    const today = new Date().toISOString().split('T')[0];
    if (today > campaign.deadline) {
      return NextResponse.json({ error: '모집 마감일이 지났습니다.' }, { status: 400 });
    }
  }

  // 중복 신청 확인
  const { data: existing } = await supabase
    .from('campaign_applications')
    .select('id')
    .eq('campaign_id', id)
    .eq('naver_id', inf.naver_id)
    .single();

  if (existing) {
    return NextResponse.json({ error: '이미 신청한 캠페인입니다.' }, { status: 400 });
  }

  // 정원 확인
  const { data: acceptedApps } = await supabase
    .from('campaign_applications')
    .select('id')
    .eq('campaign_id', id)
    .eq('status', 'accepted');

  if ((acceptedApps?.length || 0) >= campaign.max_participants) {
    return NextResponse.json({ error: '모집 인원이 가득 찼습니다.' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));

  const { error } = await supabase
    .from('campaign_applications')
    .insert({
      campaign_id: id,
      naver_id: inf.naver_id,
      message: (body.message || '').slice(0, 500),
    });

  if (error) {
    console.error('[campaigns/apply] error:', error.message);
    return NextResponse.json({ error: '신청에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** 캠페인 신청 취소 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const supabase = createServiceClient();

  const naverId = auth.user.linked_influencer_id;
  if (!naverId) return NextResponse.json({ error: '인플루언서 연결이 필요합니다.' }, { status: 400 });

  const { data: inf } = await supabase
    .from('influencers')
    .select('naver_id')
    .eq('id', naverId)
    .single();

  if (!inf) return NextResponse.json({ error: '인플루언서 정보를 찾을 수 없습니다.' }, { status: 400 });

  const { data: application } = await supabase
    .from('campaign_applications')
    .select('id, status')
    .eq('campaign_id', id)
    .eq('naver_id', inf.naver_id)
    .single();

  if (!application) {
    return NextResponse.json({ error: '신청 내역을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (application.status !== 'pending') {
    return NextResponse.json({ error: '대기중 상태에서만 취소할 수 있습니다.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('campaign_applications')
    .update({ status: 'canceled' })
    .eq('id', application.id);

  if (error) {
    console.error('[campaigns/apply] cancel error:', error.message);
    return NextResponse.json({ error: '취소에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
