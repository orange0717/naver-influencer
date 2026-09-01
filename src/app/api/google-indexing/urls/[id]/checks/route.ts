import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** GET /api/google-indexing/urls/[id]/checks — 해당 URL의 상태확인 이력(Raw Response 포함) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const paid = await requireFeature(request, 'google.indexing');
  if ('error' in paid) return paid.error;

  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: urlRow } = await supabase
    .from('indexed_urls')
    .select('id')
    .eq('id', id)
    .eq('user_id', paid.authUser.userId)
    .maybeSingle();

  if (!urlRow) {
    return NextResponse.json({ error: '등록된 URL을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('indexed_url_checks')
    .select('id, checked_at, verdict, coverage_state, raw_response, api_call_success, error_message')
    .eq('indexed_url_id', id)
    .order('checked_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[google-indexing/urls/[id]/checks] select error:', error.message);
    return NextResponse.json({ error: '이력을 불러올 수 없습니다.' }, { status: 500 });
  }

  return NextResponse.json({ checks: data ?? [] });
}
