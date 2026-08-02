import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { inspectAndUpdate } from '@/lib/google-indexing-poll';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** POST /api/admin/google-indexing/retry — body: { id } — 관리자가 실패건을 강제 재확인 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: row, error } = await supabase
    .from('indexed_urls')
    .select('id, user_id, url, check_count')
    .eq('id', body.id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: '등록된 URL을 찾을 수 없습니다.' }, { status: 404 });
  }

  await supabase.from('indexed_urls').update({ status: 'checking', progress_stage: 'checking' }).eq('id', row.id);
  await inspectAndUpdate(row);

  const { data: updated } = await supabase
    .from('indexed_urls')
    .select('id, user_id, blog_id, url, title, status, failure_reason_code, error_code, http_status, retryable, error_message, updated_at')
    .eq('id', row.id)
    .single();
  return NextResponse.json({ success: true, url: updated });
}
