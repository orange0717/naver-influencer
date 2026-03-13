import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/blog/keywords — 블로거 키워드를 DB에 저장
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { blog_id, keyword, is_auto } = body;

    if (!blog_id || !keyword) {
      return NextResponse.json({ error: 'blog_id와 keyword가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from('blog_keywords')
      .upsert(
        {
          blog_id,
          keyword,
          is_auto: is_auto || false,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'blog_id,keyword' },
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[blog/keywords] POST error:', err);
    return NextResponse.json({ error: '키워드 저장 실패' }, { status: 500 });
  }
}

/**
 * GET /api/blog/keywords?blogId=xxx — 블로거의 활성 키워드 목록 조회
 */
export async function GET(req: NextRequest) {
  const blogId = new URL(req.url).searchParams.get('blogId');
  if (!blogId) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('blog_keywords')
      .select('*')
      .eq('blog_id', blogId)
      .eq('is_active', true)
      .order('created_at');

    if (error) throw error;

    return NextResponse.json({ keywords: data || [] });
  } catch (err) {
    console.error('[blog/keywords] GET error:', err);
    return NextResponse.json({ error: '키워드 조회 실패' }, { status: 500 });
  }
}

/**
 * DELETE /api/blog/keywords — 키워드 비활성화
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { blog_id, keyword } = body;

    if (!blog_id || !keyword) {
      return NextResponse.json({ error: 'blog_id와 keyword가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from('blog_keywords')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('blog_id', blog_id)
      .eq('keyword', keyword);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[blog/keywords] DELETE error:', err);
    return NextResponse.json({ error: '키워드 삭제 실패' }, { status: 500 });
  }
}
