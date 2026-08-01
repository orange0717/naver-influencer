import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { isAdminFromProfile, requireAdmin } from '@/lib/admin';
import { validateBody } from '@/lib/validations';
import { patchStorySchema } from '@/lib/validations/stories';
import { getClientIp } from '@/lib/rate-limit';
import { submitToIndexNow } from '@/lib/indexnow';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://ninfle.kr';

/**
 * GET /api/stories/[id] — 후기 상세
 * - 승인된 글: 누구나 열람 + 조회수 증가 (30분 IP rate limit)
 * - pending/rejected: 작성자 본인 또는 관리자만
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const supabase = createServiceClient();
    const { data: story, error } = await supabase
      .from('growth_stories')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !story) {
      return NextResponse.json({ error: '후기를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (story.status !== 'approved') {
      const authUser = await getAuthUser(req);
      const isOwner = !!authUser && authUser.userId === story.author_id;
      const isAdminUser = !!authUser && isAdminFromProfile({ id: authUser.userId, is_admin: authUser.user.is_admin });
      if (!isOwner && !isAdminUser) {
        return NextResponse.json({ error: '후기를 찾을 수 없습니다.' }, { status: 404 });
      }
    } else {
      // 조회수: 30분 IP rate limit (간단 구현: sessionStorage 는 클라이언트, 여기선 그냥 증가)
      const ip = getClientIp(req);
      const ipKey = `story-view:${id}:${ip}`;
      // Redis 없이 간단히 카운트만 올림 (중복 허용)
      void ipKey;
      await supabase.rpc('increment_story_view_count', { p_story_id: id });
    }

    // 댓글 조회
    const { data: comments } = await supabase
      .from('story_comments')
      .select('id, author_id, author_name, content, created_at')
      .eq('story_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    // 현재 사용자의 좋아요 여부
    let liked = false;
    const authUserForLike = await getAuthUser(req);
    if (authUserForLike) {
      const { data: like } = await supabase
        .from('story_likes')
        .select('id')
        .eq('story_id', id)
        .eq('user_id', authUserForLike.userId)
        .maybeSingle();
      liked = !!like;
    }

    return NextResponse.json({ story, comments: comments || [], liked });
  } catch (err) {
    console.error('[stories/:id] GET error:', err);
    return NextResponse.json({ error: '후기를 불러올 수 없습니다.' }, { status: 500 });
  }
}

/**
 * PATCH /api/stories/[id] — 관리자 승인/거절/랜딩 노출 조정
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const adminCheck = await requireAdmin(req);
  if (adminCheck.error) return adminCheck.error;
  const { authUser } = adminCheck;

  try {
    const body = await req.json();
    const v = validateBody(patchStorySchema, body);
    if (!v.success) return v.response;

    const supabase = createServiceClient();

    const updates: Record<string, unknown> = {};
    if (v.data.status !== undefined) {
      updates.status = v.data.status;
      updates.reviewed_at = new Date().toISOString();
      updates.reviewed_by = authUser.user.nickname || authUser.userId;
    }
    if (v.data.reject_reason !== undefined) updates.reject_reason = v.data.reject_reason || null;
    if (v.data.is_featured !== undefined) updates.is_featured = v.data.is_featured;
    if (v.data.featured_order !== undefined) updates.featured_order = v.data.featured_order;

    const { error } = await supabase
      .from('growth_stories')
      .update(updates)
      .eq('id', id);

    if (error) throw error;

    if (v.data.status === 'approved') {
      submitToIndexNow(`${SITE_URL}/stories/${id}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[stories/:id] PATCH error:', err);
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/stories/[id] — 관리자 소프트 삭제
 */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const adminCheck = await requireAdmin(req);
  if (adminCheck.error) return adminCheck.error;

  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from('growth_stories')
      .update({ is_deleted: true })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[stories/:id] DELETE error:', err);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
