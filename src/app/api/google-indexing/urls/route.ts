import { NextRequest, NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/** GET /api/google-indexing/urls?page=0 — 내 등록 URL 목록 (최신순) */
export async function GET(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const page = Math.max(0, Number(new URL(request.url).searchParams.get('page') ?? '0') || 0);
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = createServiceClient();
  const { data, error, count } = await supabase
    .from('indexed_urls')
    .select('*', { count: 'exact' })
    .eq('user_id', paid.authUser.userId)
    .order('registered_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.error('[google-indexing/urls] select error:', error.message);
    return NextResponse.json({ error: '목록을 불러올 수 없습니다.' }, { status: 500 });
  }

  return NextResponse.json({ urls: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}

/** DELETE /api/google-indexing/urls — body: { id } */
export async function DELETE(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

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
  const { error } = await supabase
    .from('indexed_urls')
    .delete()
    .eq('id', body.id)
    .eq('user_id', paid.authUser.userId);

  if (error) {
    console.error('[google-indexing/urls] delete error:', error.message);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
