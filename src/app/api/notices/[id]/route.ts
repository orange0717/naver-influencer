import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notices/[id] — 공지 상세 + 댓글
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const supabase = createServiceClient();

    const { data: notice, error } = await supabase
      .from('notices')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !notice) {
      return NextResponse.json({ error: '공지를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 조회수 증가: 클라이언트가 X-Count-View 헤더를 보낸 경우만 (첫 조회)
    let viewCount = notice.view_count;
    const shouldCount = _req.headers.get('x-count-view') === '1';

    if (shouldCount) {
      const ua = _req.headers.get('user-agent') || '';
      const isBot = /bot|crawl|spider|preview|headless|phantom|puppeteer|playwright/i.test(ua);
      if (!isBot) {
        const { data: newViewCount } = await supabase.rpc('increment_notice_view_count', { notice_id: id });
        viewCount = newViewCount ?? notice.view_count + 1;
      }
    }

    // 댓글 조회
    const { data: comments } = await supabase
      .from('notice_comments')
      .select('id, content, author_id, author_name, author_type, created_at')
      .eq('notice_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      notice: { ...notice, view_count: viewCount },
      comments: comments || [],
    });
  } catch (err) {
    console.error('[notices] GET detail error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * PATCH /api/notices/[id] — 공지 수정 (관리자만)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isAdmin(authUser.userId)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (title.length < 2 || title.length > 100) {
        return NextResponse.json({ error: '제목은 2~100자로 입력해주세요.' }, { status: 400 });
      }
      updates.title = title;
    }
    if (body.content !== undefined) {
      const content = String(body.content).trim();
      if (content.length < 5 || content.length > 5000) {
        return NextResponse.json({ error: '내용은 5~5000자로 입력해주세요.' }, { status: 400 });
      }
      updates.content = content;
    }
    if (body.tag !== undefined) {
      if (!['notice', 'update', 'event'].includes(body.tag)) {
        return NextResponse.json({ error: '유효하지 않은 태그입니다.' }, { status: 400 });
      }
      updates.tag = body.tag;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const supabase = createServiceClient();
    const { error } = await supabase
      .from('notices')
      .update(updates)
      .eq('id', id)
      .eq('is_deleted', false);

    if (error) {
      console.error('[notices] PATCH error:', error);
      return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notices] PATCH error:', err);
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/notices/[id] — 공지 삭제 (관리자만)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    if (!isAdmin(authUser.userId)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const supabase = createServiceClient();
    await supabase
      .from('notices')
      .update({ is_deleted: true })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[notices] DELETE error:', err);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
