import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/** 특정 블로그의 순위 조회 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ blogId: string }> },
) {
  try {
    const { blogId } = await params;
    const cleanId = blogId.trim().toLowerCase();
    if (!cleanId || !/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
      return NextResponse.json({ error: 'invalid blog_id' }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('get_blogger_rank', { p_blog_id: cleanId });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || { found: false });
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
