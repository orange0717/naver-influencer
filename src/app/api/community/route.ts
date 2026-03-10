import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/community — 게시글 목록
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') || '';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  try {
    const supabase = createServiceClient();

    // 전체 개수 조회
    let countQuery = supabase
      .from('community_posts')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);

    if (category) countQuery = countQuery.eq('category', category);
    const { count } = await countQuery;

    // 게시글 조회 (고정글 우선, 최신순)
    let query = supabase
      .from('community_posts')
      .select('id, category, title, author_id, author_name, author_type, view_count, comment_count, like_count, created_at, is_pinned')
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) query = query.eq('category', category);
    const { data: posts, error } = await query;

    if (error) throw error;

    return NextResponse.json({
      posts: posts || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error('[community] GET error:', err);
    return NextResponse.json({ posts: [], total: 0, page: 1, totalPages: 1 });
  }
}

/**
 * POST /api/community — 게시글 작성
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { category, title, content, author_id, author_type, author_name } = body;

    if (!title?.trim() || !content?.trim() || !author_id || !author_type) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 });
    }

    // 스팸 방지: 같은 사용자가 1분 내 중복 글 방지
    const supabase = createServiceClient();
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recent } = await supabase
      .from('community_posts')
      .select('id')
      .eq('author_id', author_id)
      .gte('created_at', oneMinAgo)
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json({ error: '너무 빠르게 글을 작성하고 있습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
    }

    const { data, error } = await supabase
      .from('community_posts')
      .insert({
        category: category || 'free',
        title: title.trim().slice(0, 100),
        content: content.trim().slice(0, 5000),
        author_id,
        author_type,
        author_name: (author_name || author_id).slice(0, 50),
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[community] POST error:', err);
    return NextResponse.json({ error: '글 작성에 실패했습니다.' }, { status: 500 });
  }
}
