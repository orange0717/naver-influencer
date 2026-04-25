import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { validateBody, validateSearchParams, paginationSchema } from '@/lib/validations';
import { createStorySchema } from '@/lib/validations/stories';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stories — 승인된 후기 목록 (공개)
 */
export async function GET(req: NextRequest) {
  const v = validateSearchParams(paginationSchema, new URL(req.url).searchParams);
  if (!v.success) return v.response;

  const { page, limit } = v.data;
  const offset = (page - 1) * limit;

  try {
    const supabase = createServiceClient();

    const { count } = await supabase
      .from('growth_stories')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('is_deleted', false);

    const { data: stories, error } = await supabase
      .from('growth_stories')
      .select('id, title, short_excerpt, author_name, is_anonymous, metric_before, metric_after, period, view_count, like_count, is_featured, created_at')
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      stories: stories || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error('[stories] GET error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ stories: [], total: 0, page: 1, totalPages: 1 });
  }
}

/**
 * POST /api/stories — 후기 작성 (로그인 필수, pending 상태로 저장)
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (await communityLimiter.check(ip)) return rateLimitResponse();

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const v = validateBody(createStorySchema, body);
    if (!v.success) return v.response;

    const supabase = createServiceClient();

    // 1분 내 연속 작성 방지
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recent } = await supabase
      .from('growth_stories')
      .select('id')
      .eq('author_id', authUser.userId)
      .gte('created_at', oneMinAgo)
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json({ error: '너무 빠르게 글을 작성하고 있습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
    }

    const { title, content, short_excerpt, is_anonymous, metric_before, metric_after, period, author_name, images } = v.data;
    const displayName = is_anonymous ? '익명' : (author_name || authUser.user.nickname || '회원');

    const { data, error } = await supabase
      .from('growth_stories')
      .insert({
        title,
        content,
        short_excerpt: short_excerpt || null,
        author_id: authUser.userId,
        author_name: displayName.slice(0, 50),
        is_anonymous,
        metric_before: metric_before || null,
        metric_after: metric_after || null,
        period: period || null,
        status: 'pending',
        images: Array.isArray(images) ? images.slice(0, 6) : [],
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ id: data.id, status: 'pending' }, { status: 201 });
  } catch (err) {
    console.error('[stories] POST error:', err);
    return NextResponse.json({ error: '후기 작성에 실패했습니다.' }, { status: 500 });
  }
}
