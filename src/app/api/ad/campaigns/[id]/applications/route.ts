import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAdvertiserUser } from '@/lib/ad-auth';
import { campaignLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** 캠페인 신청 목록 (광고주용) */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAdvertiserUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const supabase = createServiceClient();

  // 캠페인 소유권 확인
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id')
    .eq('id', id)
    .eq('advertiser_id', auth.advertiserId)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';

  let query = supabase
    .from('campaign_applications')
    .select('id, naver_id, message, status, applied_at, accepted_at')
    .eq('campaign_id', id)
    .order('applied_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: applications, error } = await query;

  if (error) {
    console.error('[ad/campaigns/applications] list error:', error.message);
    return NextResponse.json({ error: '신청 목록 조회 실패' }, { status: 500 });
  }

  // 인플루언서 정보 JOIN
  const naverIds = (applications || []).map(a => a.naver_id);
  let influencerMap: Record<string, { display_name: string; subscriber_count: number; category: string; image_url: string | null }> = {};

  if (naverIds.length > 0) {
    const { data: influencers } = await supabase
      .from('influencers')
      .select('naver_id, display_name, subscriber_count, category, image_url')
      .in('naver_id', naverIds);

    if (influencers) {
      influencerMap = Object.fromEntries(
        influencers.map(i => [i.naver_id, i])
      );
    }
  }

  const result = (applications || []).map(a => ({
    ...a,
    influencer: influencerMap[a.naver_id] || null,
  }));

  return NextResponse.json({ applications: result });
}
