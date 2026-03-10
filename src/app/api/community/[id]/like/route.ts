import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/community/[id]/like — 좋아요
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const supabase = createServiceClient();

    // like_count 증가
    const { data: post } = await supabase
      .from('community_posts')
      .select('like_count')
      .eq('id', id)
      .single();

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    await supabase
      .from('community_posts')
      .update({ like_count: (post.like_count || 0) + 1 })
      .eq('id', id);

    return NextResponse.json({ like_count: post.like_count + 1 });
  } catch (err) {
    console.error('[community] LIKE error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
