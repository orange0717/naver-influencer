import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** 블로그 이름으로 블로거 검색 (부분일치) */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get('q') || '').trim();
    if (!q || q.length < 1 || q.length > 50) {
      return NextResponse.json({ error: 'invalid query' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('search_bloggers_by_name', {
      p_query: q,
      p_limit: 20,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count: totalActive } = await supabase
      .from('bloggers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    return NextResponse.json({
      results: data || [],
      total_active: totalActive || 0,
      query: q,
    });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
