import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { createServiceClient } from '@/lib/supabase-server';
import { inspectAndUpdate } from '@/lib/google-indexing-poll';
import { googleIndexingRecheckLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** POST /api/google-indexing/urls/[id]/recheck — 수동 재확인/재등록 (GSC 쿼터 보호를 위해 강하게 제한) */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const paid = await requireFeature(request, 'google.indexing');
  if ('error' in paid) return paid.error;

  const { id } = await params;
  const limiterKey = `${getClientIp(request)}:${id}`;
  if (await googleIndexingRecheckLimiter.check(limiterKey)) return rateLimitResponse();

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from('indexed_urls')
    .select('id, user_id, url, check_count')
    .eq('id', id)
    .eq('user_id', paid.authUser.userId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: '등록된 URL을 찾을 수 없습니다.' }, { status: 404 });
  }

  await supabase
    .from('indexed_urls')
    .update({ status: 'checking', progress_stage: 'checking', updated_at: new Date().toISOString() })
    .eq('id', id);

  await inspectAndUpdate(row);

  const { data: updated } = await supabase.from('indexed_urls').select('*').eq('id', id).single();

  return NextResponse.json({ success: true, url: updated });
}
