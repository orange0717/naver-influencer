import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** 내 캠페인 신청 목록 (인플루언서용) */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await dashboardLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const supabase = createServiceClient();

  const naverId = auth.user.linked_influencer_id;
  if (!naverId) {
    return NextResponse.json({ applications: [] });
  }

  // naver_id 조회
  const { data: inf } = await supabase
    .from('influencers')
    .select('naver_id')
    .eq('id', naverId)
    .single();

  if (!inf) return NextResponse.json({ applications: [] });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';

  let query = supabase
    .from('campaign_applications')
    .select('id, campaign_id, status, message, applied_at, accepted_at, completed_at')
    .eq('naver_id', inf.naver_id)
    .order('applied_at', { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: applications, error } = await query;

  if (error) {
    console.error('[my/campaigns] error:', error.message);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  // 캠페인 정보 JOIN
  const campaignIds = (applications || []).map(a => a.campaign_id);
  let campaignMap: Record<string, { title: string; category: string; campaign_type: string; fee_per_post: number; deadline: string | null; posting_deadline: string | null; advertiser_id: string }> = {};

  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, title, category, campaign_type, fee_per_post, deadline, posting_deadline, advertiser_id')
      .in('id', campaignIds);

    if (campaigns) {
      // 광고주 정보
      const advIds = [...new Set(campaigns.map(c => c.advertiser_id))];
      let advMap: Record<string, string> = {};
      if (advIds.length > 0) {
        const { data: advertisers } = await supabase
          .from('advertisers')
          .select('id, company_name')
          .in('id', advIds);
        if (advertisers) {
          advMap = Object.fromEntries(advertisers.map(a => [a.id, a.company_name]));
        }
      }

      campaignMap = Object.fromEntries(campaigns.map(c => [c.id, {
        ...c,
        advertiser_company: advMap[c.advertiser_id] || '',
      }]));
    }
  }

  const result = (applications || []).map(a => ({
    ...a,
    campaign: campaignMap[a.campaign_id] || null,
  }));

  return NextResponse.json({ applications: result });
}
