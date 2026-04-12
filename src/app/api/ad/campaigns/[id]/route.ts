import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAdvertiserUser } from '@/lib/ad-auth';
import { validateBody } from '@/lib/validations';
import { campaignUpdateSchema } from '@/lib/validations/advertiser';
import { campaignLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** 캠페인 상세 조회 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAdvertiserUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const supabase = createServiceClient();

  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('advertiser_id', auth.advertiserId)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 });
  }

  // 신청 통계
  const { data: apps } = await supabase
    .from('campaign_applications')
    .select('status')
    .eq('campaign_id', id);

  const stats = {
    total: apps?.length || 0,
    pending: apps?.filter(a => a.status === 'pending').length || 0,
    accepted: apps?.filter(a => a.status === 'accepted').length || 0,
    rejected: apps?.filter(a => a.status === 'rejected').length || 0,
    completed: apps?.filter(a => a.status === 'completed').length || 0,
  };

  return NextResponse.json({ campaign, stats });
}

/** 캠페인 수정 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAdvertiserUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await request.json();
  const v = validateBody(campaignUpdateSchema, body);
  if (!v.success) return v.response;

  const supabase = createServiceClient();

  // 소유권 + 상태 확인
  const { data: existing } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('id', id)
    .eq('advertiser_id', auth.advertiserId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (['completed', 'canceled'].includes(existing.status)) {
    return NextResponse.json({ error: '완료/취소된 캠페인은 수정할 수 없습니다.' }, { status: 400 });
  }

  const d = v.data;
  const updateData: Record<string, unknown> = {};
  if (d.title !== undefined) updateData.title = d.title;
  if (d.description !== undefined) updateData.description = d.description;
  if (d.category !== undefined) updateData.category = d.category;
  if (d.region !== undefined) updateData.region = d.region;
  if (d.campaignType !== undefined) updateData.campaign_type = d.campaignType;
  if (d.budget !== undefined) updateData.budget = d.budget;
  if (d.feePerPost !== undefined) updateData.fee_per_post = d.feePerPost;
  if (d.maxParticipants !== undefined) updateData.max_participants = d.maxParticipants;
  if (d.deadline !== undefined) updateData.deadline = d.deadline || null;
  if (d.postingDeadline !== undefined) updateData.posting_deadline = d.postingDeadline || null;
  if (d.requirements !== undefined) updateData.requirements = d.requirements;
  if (d.status !== undefined) updateData.status = d.status;

  const { error } = await supabase
    .from('campaigns')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('[ad/campaigns] update error:', error.message);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/** 캠페인 삭제 (draft 상태만) */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const ip = getClientIp(request);
  if (await campaignLimiter.check(ip)) return rateLimitResponse();

  const auth = await getAdvertiserUser(request);
  if (!auth) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('id', id)
    .eq('advertiser_id', auth.advertiserId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: '캠페인을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (existing.status !== 'draft') {
    return NextResponse.json({ error: '임시저장 상태의 캠페인만 삭제할 수 있습니다.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[ad/campaigns] delete error:', error.message);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
