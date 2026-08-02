import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/coupons/list
 * 발급된 쿠폰 전체 목록 (최신순)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200')));

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, name, target_email, plan, duration_days, used, used_at, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin/coupons/list] error:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}
