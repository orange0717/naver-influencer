import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ snapshotDate: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  const { snapshotDate } = await context.params;
  if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    return NextResponse.json({ error: 'snapshotDate(YYYY-MM-DD) 형식이 아님' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error, count } = await supabase
    .from('naver_official_rankings')
    .delete({ count: 'exact' })
    .eq('snapshot_date', snapshotDate);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ snapshotDate, deleted: count ?? 0 });
}
