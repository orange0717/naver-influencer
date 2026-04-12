import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAdvertiserUser } from '@/lib/ad-auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await dashboardLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAdvertiserUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const supabase = createServiceClient();

  // 캠페인 통계
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, title, category, campaign_type, fee_per_post, max_participants, deadline, status, created_at')
    .eq('advertiser_id', auth.advertiserId)
    .order('created_at', { ascending: false });

  const allCampaigns = campaigns || [];
  const activeCampaigns = allCampaigns.filter(c => c.status === 'active').length;
  const campaignIds = allCampaigns.map(c => c.id);

  // 신청 통계
  let totalApplications = 0;
  let acceptedApplications = 0;
  let recentApplications: Array<{
    id: string;
    campaign_id: string;
    naver_id: string;
    status: string;
    applied_at: string;
    campaignTitle?: string;
  }> = [];

  if (campaignIds.length > 0) {
    const { data: apps } = await supabase
      .from('campaign_applications')
      .select('id, campaign_id, naver_id, status, applied_at')
      .in('campaign_id', campaignIds)
      .order('applied_at', { ascending: false })
      .limit(100);

    if (apps) {
      totalApplications = apps.length;
      acceptedApplications = apps.filter(a => a.status === 'accepted' || a.status === 'completed').length;

      // 최근 5개 신청
      const campaignMap = Object.fromEntries(allCampaigns.map(c => [c.id, c.title]));
      recentApplications = apps.slice(0, 5).map(a => ({
        ...a,
        campaignTitle: campaignMap[a.campaign_id] || '',
      }));
    }
  }

  // 정산 합계
  const { data: settlements } = await supabase
    .from('ad_settlements')
    .select('fee')
    .eq('advertiser_id', auth.advertiserId);

  const totalSpend = (settlements || []).reduce((sum, s) => sum + (s.fee || 0), 0);

  return NextResponse.json({
    stats: {
      activeCampaigns,
      totalCampaigns: allCampaigns.length,
      totalApplications,
      acceptedApplications,
      totalSpend,
    },
    recentCampaigns: allCampaigns.slice(0, 5),
    recentApplications,
  });
}
