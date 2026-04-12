import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** 활성 캠페인 목록 (인플루언서용 공개) */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await searchLimiter.check(ip)) return rateLimitResponse();

  const supabase = createServiceClient();

  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, title, description, category, region, campaign_type, fee_per_post, max_participants, deadline, posting_deadline, requirements, advertiser_id, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[campaigns] list error:', error.message);
    return NextResponse.json({ error: '목록 조회 실패' }, { status: 500 });
  }

  // 광고주 정보 JOIN
  const advertiserIds = [...new Set((campaigns || []).map(c => c.advertiser_id))];
  let advertiserMap: Record<string, { company_name: string }> = {};

  if (advertiserIds.length > 0) {
    const { data: advertisers } = await supabase
      .from('advertisers')
      .select('id, company_name')
      .in('id', advertiserIds);

    if (advertisers) {
      advertiserMap = Object.fromEntries(advertisers.map(a => [a.id, { company_name: a.company_name }]));
    }
  }

  // 수락된 인원 수
  const campaignIds = (campaigns || []).map(c => c.id);
  let acceptedMap: Record<string, number> = {};

  if (campaignIds.length > 0) {
    const { data: apps } = await supabase
      .from('campaign_applications')
      .select('campaign_id')
      .in('campaign_id', campaignIds)
      .eq('status', 'accepted');

    if (apps) {
      acceptedMap = apps.reduce((acc: Record<string, number>, row: { campaign_id: string }) => {
        acc[row.campaign_id] = (acc[row.campaign_id] || 0) + 1;
        return acc;
      }, {});
    }
  }

  // 로그인한 인플루언서의 신청 현황
  let appliedCampaignIds: string[] = [];
  const auth = await getAuthUser(request).catch(() => null);

  if (auth?.user.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id')
      .eq('id', auth.user.linked_influencer_id)
      .single();

    if (inf && campaignIds.length > 0) {
      const { data: myApps } = await supabase
        .from('campaign_applications')
        .select('campaign_id')
        .eq('naver_id', inf.naver_id)
        .in('campaign_id', campaignIds)
        .neq('status', 'canceled');

      if (myApps) {
        appliedCampaignIds = myApps.map(a => a.campaign_id);
      }
    }
  }

  const result = (campaigns || []).map(c => ({
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    region: c.region,
    campaign_type: c.campaign_type,
    fee_per_post: c.fee_per_post,
    max_participants: c.max_participants,
    deadline: c.deadline,
    posting_deadline: c.posting_deadline,
    requirements: c.requirements,
    advertiser: advertiserMap[c.advertiser_id] || null,
    acceptedCount: acceptedMap[c.id] || 0,
  }));

  return NextResponse.json({ campaigns: result, appliedCampaignIds });
}
