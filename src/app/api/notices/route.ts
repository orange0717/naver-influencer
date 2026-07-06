import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isAdminFromProfile } from '@/lib/admin';
import { validateBody, validateSearchParams, paginationSchema } from '@/lib/validations';
import { createNoticeSchema } from '@/lib/validations/notice';
import { communityLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createNoticeNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

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
      .select('id, title, tag, author_name, view_count, comment_count, like_count, is_pinned, created_at')
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

    if (!isAdminFromProfile(authUser.user)) {
      return NextResponse.json({ error: '관리자만 공지를 작성할 수 있습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const v = validateBody(createNoticeSchema, body);
    if (!v.success) return v.response;

    const { title, content, tag, showOnBanner } = v.data;

    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from('notices')
      .insert({
        title,
        content,
        tag,
        author_id: authUser.userId,
        author_name: authUser.user.nickname || '관리자',
        show_on_banner: !!showOnBanner,
      })
      .select('id')
      .single();

    if (error) throw error;

    // 투표 데이터가 함께 전달되면 저장 (선택적)
    const rawPoll = body?.poll;
    if (rawPoll && typeof rawPoll === 'object') {
      const question = typeof rawPoll.question === 'string' ? rawPoll.question.trim() : '';
      const options = Array.isArray(rawPoll.options)
        ? rawPoll.options.map((o: unknown) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
        : [];
      const isMultiple = !!rawPoll.is_multiple;

      if (question.length >= 1 && question.length <= 200 && options.length >= 2 && options.length <= 5 && options.every((o: string) => o.length <= 100)) {
        const { data: poll, error: pollErr } = await supabase
          .from('notice_polls')
          .insert({ notice_id: data.id, question, is_multiple: isMultiple })
          .select('id')
          .single();

        if (!pollErr && poll) {
          const optionsRows = options.map((label: string, idx: number) => ({
            poll_id: poll.id,
            label,
            sort_order: idx,
          }));
          const { error: optsErr } = await supabase.from('notice_poll_options').insert(optionsRows);
          if (optsErr) {
            console.error('[notices] poll options insert error:', optsErr);
          }
        } else if (pollErr) {
          console.error('[notices] poll insert error:', pollErr);
        }
      }
    }

    // 전체 사용자에게 공지 알림 (비동기, 실패해도 공지 생성은 성공)
    createNoticeNotification(supabase, data.id, title).catch(err =>
      console.error('[notices] 알림 생성 실패:', err)
    );

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (err) {
    console.error('[notices] POST error:', err);
    return NextResponse.json({ error: '공지 작성에 실패했습니다.' }, { status: 500 });
  }
}
