import { NextRequest, NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** GET /api/google-indexing/bulk-status — "전체 포스트 등록" 백그라운드 잡 진행 상황 */
export async function GET(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bulk_index_jobs')
    .select('status, total_count, registered_count, updated_at, error_message')
    .eq('user_id', paid.authUser.userId)
    .maybeSingle();

  if (error) {
    console.error('[google-indexing/bulk-status] error:', error.message);
    return NextResponse.json({ error: '조회 중 오류가 발생했어요.' }, { status: 500 });
  }

  return NextResponse.json({ job: data ?? null });
}
