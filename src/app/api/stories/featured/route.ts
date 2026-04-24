import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stories/featured — 랜딩페이지용 하이라이트 후기 (최대 5개)
 * - status = 'approved' AND is_featured = true
 * - featured_order ASC NULLS LAST, created_at DESC
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('growth_stories')
      .select('id, title, short_excerpt, content, author_name, is_anonymous, metric_before, metric_after, period, created_at')
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .eq('is_featured', true)
      .order('featured_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    // short_excerpt 없으면 content 앞부분으로 대체
    const stories = (data || []).map((s) => ({
      ...s,
      short_excerpt: s.short_excerpt || (s.content || '').slice(0, 140),
      content: undefined,
    }));

    return NextResponse.json({ stories });
  } catch (err) {
    console.error('[stories/featured] GET error:', err);
    return NextResponse.json({ stories: [] });
  }
}
