import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** 블로거 순위 Top N 조회 */
export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get('category') || null;
    const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 50, 200);
    const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset')) || 0);

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('get_top_bloggers', {
      p_category: category,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 전체 활성 블로거 수 (표시용)
    const { count: totalActive } = await supabase
      .from('bloggers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    return NextResponse.json({
      rankings: data || [],
      total_active: totalActive || 0,
      category,
      limit,
      offset,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
