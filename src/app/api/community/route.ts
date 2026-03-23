import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { validateBody, validateSearchParams, paginationSchema } from '@/lib/validations';
import { createPostSchema } from '@/lib/validations/community';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const communityQuerySchema = paginationSchema.extend({
  category: z.string().optional(),
});

/**
 * GET /api/community — 게시글 목록
 */
export async function GET(req: NextRequest) {
  const v = validateSearchParams(communityQuerySchema, new URL(req.url).searchParams);
  if (!v.success) return v.response;

  const { page, limit, category } = v.data;
  const offset = (page - 1) * limit;

  try {
    const supabase = createServiceClient();

    let countQuery = supabase
      .from('community_posts')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);

    if (category) countQuery = countQuery.eq('category', category);
    const { count } = await countQuery;

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
    const ip = getClientIp(req);
    if (await communityLimiter.check(ip)) return rateLimitResponse();

    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const v = validateBody(createPostSchema, body);
    if (!v.success) return v.response;

    const { category, title, content, author_name } = v.data;

    const supabase = createServiceClient();
    const oneMinAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recent } = await supabase
      .from('community_posts')
      .select('id')
      .eq('author_id', cookieUser.id)
      .gte('created_at', oneMinAgo)
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json({ error: '너무 빠르게 글을 작성하고 있습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
    }

    const { data, error } = await supabase
      .from('community_posts')
      .insert({
        category,
        title,
        content,
        author_id: cookieUser.id,
        author_type: cookieUser.type,
        author_name: (author_name || cookieUser.id).slice(0, 50),
      })
      .select('id')
      .single();

    if (error) throw error;

    // 투표가 있으면 함께 저장
    const { poll } = v.data;
    if (poll) {
      const { data: pollData, error: pollError } = await supabase
        .from('community_polls')
        .insert({
          post_id: data.id,
          question: poll.question,
          is_multiple: poll.is_multiple,
        })
        .select('id')
        .single();

      if (!pollError && pollData) {
        const optionRows = poll.options.map((opt, idx) => ({
          poll_id: pollData.id,
          label: opt.label,
          sort_order: idx,
        }));
        await supabase.from('community_poll_options').insert(optionRows);
      }
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[community] POST error:', err);
    return NextResponse.json({ error: '글 작성에 실패했습니다.' }, { status: 500 });
  }
}
