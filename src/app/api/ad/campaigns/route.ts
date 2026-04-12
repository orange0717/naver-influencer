import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAdvertiserUser } from '@/lib/ad-auth';
import { validateBody } from '@/lib/validations';
import { campaignCreateSchema } from '@/lib/validations/advertiser';
import { campaignLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** 캠페인 목록 조회 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAdvertiserUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  let query = supabase
    .from('campaigns')
    .select('*', { count: 'exact' })
    .eq('advertiser_id', auth.advertiserId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: campaigns, error, count } = await query;

  if (error) {
    console.error('[ad/campaigns] list error:', error.message);
    return NextResponse.json({ error: '목록 조회 실패' }, { status: 500 });
  }

  // 각 캠페인의 신청 수 조회
  const campaignIds = (campaigns || []).map(c => c.id);
  let applicationCounts: Record<string, number> = {};

  if (campaignIds.length > 0) {
    const { data: counts } = await supabase
      .from('campaign_applications')
      .select('campaign_id')
      .in('campaign_id', campaignIds);

    if (counts) {
      applicationCounts = counts.reduce((acc: Record<string, number>, row: { campaign_id: string }) => {
        acc[row.campaign_id] = (acc[row.campaign_id] || 0) + 1;
        return acc;
      }, {});
    }
  }

  const result = (campaigns || []).map(c => ({
    ...c,
    applicationCount: applicationCounts[c.id] || 0,
  }));

  return NextResponse.json({ campaigns: result, total: count || 0, page, limit });
}

/** 캠페인 생성 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAdvertiserUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const v = validateBody(campaignCreateSchema, body);
  if (!v.success) return v.response;

  const d = v.data;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      advertiser_id: auth.advertiserId,
      title: d.title,
      description: d.description || '',
      category: d.category || '',
      region: d.region || '',
      campaign_type: d.campaignType,
      budget: d.budget || 0,
      fee_per_post: d.feePerPost || 0,
      max_participants: d.maxParticipants,
      deadline: d.deadline || null,
      posting_deadline: d.postingDeadline || null,
      requirements: d.requirements || '',
      status: d.status || 'draft',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[ad/campaigns] create error:', error.message);
    return NextResponse.json({ error: '캠페인 생성 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true, campaignId: data.id });
}
