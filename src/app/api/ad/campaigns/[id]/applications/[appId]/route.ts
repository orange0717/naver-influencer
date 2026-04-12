import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAdvertiserUser } from '@/lib/ad-auth';
import { validateBody } from '@/lib/validations';
import { applicationActionSchema } from '@/lib/validations/advertiser';
import { campaignLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; appId: string }> };

/** 신청 수락/거절 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id, appId } = await params;
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAdvertiserUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const v = validateBody(applicationActionSchema, body);
  if (!v.success) return v.response;

  const supabase = createServiceClient();

  // 캠페인 소유권 확인
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, max_participants, fee_per_post')
    .eq('id', id)
    .eq('advertiser_id', auth.advertiserId)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 신청 확인
  const { data: application } = await supabase
    .from('campaign_applications')
    .select('id, status, naver_id')
    .eq('id', appId)
    .eq('campaign_id', id)
    .single();

  if (!application) {
    return NextResponse.json({ error: '신청을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (application.status !== 'pending') {
    return NextResponse.json({ error: '이미 처리된 신청입니다.' }, { status: 400 });
  }

  const newStatus = v.data.status;
  const updateData: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'accepted') {
    // 수락 인원 체크
    const { data: acceptedApps } = await supabase
      .from('campaign_applications')
      .select('id')
      .eq('campaign_id', id)
      .eq('status', 'accepted');

    const acceptedCount = acceptedApps?.length || 0;
    if (acceptedCount >= campaign.max_participants) {
      return NextResponse.json({ error: '모집 인원이 가득 찼습니다.' }, { status: 400 });
    }

    updateData.accepted_at = new Date().toISOString();

    // 정산 레코드 자동 생성
    await supabase.from('ad_settlements').insert({
      naver_id: application.naver_id,
      campaign_id: id,
      advertiser_id: auth.advertiserId,
      client_name: auth.advertiser.company_name,
      fee: campaign.fee_per_post,
      commission: 0,
      net_amount: campaign.fee_per_post,
      settled_date: new Date().toISOString().split('T')[0],
    });
  }

  const { error } = await supabase
    .from('campaign_applications')
    .update(updateData)
    .eq('id', appId);

  if (error) {
    console.error('[ad/campaigns/applications] update error:', error.message);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
