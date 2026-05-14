import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { userOwnsBlogId } from '@/lib/blog-access';
import { validateBody } from '@/lib/validations';
import { blogKeywordSchema, deleteBlogKeywordSchema } from '@/lib/validations/blog';

export const dynamic = 'force-dynamic';

async function requireOwnBlog(request: NextRequest, blogId: string) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return {
      error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }),
    };
  }

  if (auth.user.is_admin === true || isAdmin(auth.userId)) {
    return { auth };
  }

  if (await userOwnsBlogId(auth.userId, blogId)) {
    return { auth };
  }

  return {
    error: NextResponse.json({ error: '본인 블로그의 키워드만 관리할 수 있습니다.' }, { status: 403 }),
  };
}

/**
 * POST /api/blog/keywords — 블로거 키워드를 DB에 저장
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const v = validateBody(blogKeywordSchema, body);
    if (!v.success) return v.response;

    const { blog_id, keyword, is_auto } = v.data;

    const ownBlog = await requireOwnBlog(req, blog_id);
    if (ownBlog.error) return ownBlog.error;

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

  const ownBlog = await requireOwnBlog(req, blogId);
  if (ownBlog.error) return ownBlog.error;

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
    const v = validateBody(deleteBlogKeywordSchema, body);
    if (!v.success) return v.response;

    const { blog_id, keyword } = v.data;

    const ownBlog = await requireOwnBlog(req, blog_id);
    if (ownBlog.error) return ownBlog.error;

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
