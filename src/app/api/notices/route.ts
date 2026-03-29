import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { validateBody, validateSearchParams, paginationSchema } from '@/lib/validations';
import { createNoticeSchema } from '@/lib/validations/notice';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * GET /api/notices — 공지 목록
 */
export async function GET(req: NextRequest) {
  const v = validateSearchParams(paginationSchema, new URL(req.url).searchParams);
  if (!v.success) return v.response;

  const { page, limit } = v.data;
  const offset = (page - 1) * limit;

  try {
    const supabase = createServiceClient();

    const { count } = await supabase
      .from('notices')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);

    const { data: notices, error } = await supabase
      .from('notices')
      .select('id, title, tag, author_name, view_count, comment_count, is_pinned, created_at')
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      notices: notices || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error('[notices] GET error:', err);
    return NextResponse.json({ notices: [], total: 0, page: 1, totalPages: 1 });
  }
}

/**
 * POST /api/notices — 공지 작성 (관리자만)
 */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    if (await communityLimiter.check(ip)) return rateLimitResponse();

    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!ADMIN_IDS.includes(authUser.userId)) {
      return NextResponse.json({ error: '관리자만 공지를 작성할 수 있습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const v = validateBody(createNoticeSchema, body);
    if (!v.success) return v.response;

    const { title, content, tag } = v.data;

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('notices')
      .insert({
        title,
        content,
        tag,
        author_id: authUser.userId,
        author_name: authUser.user.nickname || '관리자',
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[notices] POST error:', err);
    return NextResponse.json({ error: '공지 작성에 실패했습니다.' }, { status: 500 });
  }
}
