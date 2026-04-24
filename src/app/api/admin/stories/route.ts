import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import { z } from 'zod';
import { validateSearchParams } from '@/lib/validations';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * GET /api/admin/stories — 관리자: 상태별 전체 목록 조회
 */
export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin(req);
  if (adminCheck.error) return adminCheck.error;

  const v = validateSearchParams(querySchema, new URL(req.url).searchParams);
  if (!v.success) return v.response;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('growth_stories')
      .select('id, title, content, short_excerpt, author_id, author_name, metric_before, metric_after, period, status, is_featured, featured_order, view_count, created_at, reject_reason')
      .eq('status', v.data.status)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(v.data.limit);

    if (error) throw error;

    return NextResponse.json({ stories: data || [] });
  } catch (err) {
    console.error('[admin/stories] GET error:', err);
    return NextResponse.json({ stories: [], error: '목록을 불러올 수 없습니다.' }, { status: 500 });
  }
}
