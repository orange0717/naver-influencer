import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser, getCookieUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notices/[id]/like — 좋아요 상태 확인
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ liked: false, like_count: 0 });
    }

    const supabase = createServiceClient();

    const { data: notice } = await supabase
      .from('notices')
      .select('like_count')
      .eq('id', id)
      .single();

    const { data: existing } = await supabase
      .from('notice_likes')
      .select('id')
      .eq('notice_id', id)
      .eq('user_id', userId)
      .single();

    return NextResponse.json({
      liked: !!existing,
      like_count: notice?.like_count || 0,
    });
  } catch {
    return NextResponse.json({ liked: false, like_count: 0 });
  }
}

/**
 * POST /api/notices/[id]/like — 좋아요 토글
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // 이미 좋아요했는지 확인
    const { data: existing } = await supabase
      .from('notice_likes')
      .select('id')
      .eq('notice_id', id)
      .eq('user_id', userId)
      .single();

    if (existing) {
      // 좋아요 취소
      const { error: delError } = await supabase
        .from('notice_likes')
        .delete()
        .eq('notice_id', id)
        .eq('user_id', userId);
      if (delError) {
        console.error('[notice-like] delete error:', delError);
        return NextResponse.json({ error: '좋아요 취소에 실패했습니다.' }, { status: 500 });
      }

      const { data: newCount, error: rpcError } = await supabase.rpc('decrement_notice_like_count', { p_notice_id: id });
      if (rpcError) {
        console.error('[notice-like] decrement RPC 실패:', rpcError.message);
        return NextResponse.json({ error: '좋아요 집계 중 오류가 발생했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ liked: false, like_count: newCount ?? 0 });
    }

    // 좋아요
    const { error: likeError } = await supabase
      .from('notice_likes')
      .insert({ notice_id: id, user_id: userId });

    if (likeError) {
      if (likeError.code === '23505') {
        return NextResponse.json({ error: '이미 좋아요했습니다.' }, { status: 409 });
      }
      console.error('[notice-like] insert error:', likeError);
      return NextResponse.json({ error: '좋아요 등록에 실패했습니다.' }, { status: 500 });
    }

    const { data: newCount, error: rpcError } = await supabase.rpc('increment_notice_like_count', { p_notice_id: id });
    if (rpcError) {
      console.error('[notice-like] increment RPC 실패:', rpcError.message);
      return NextResponse.json({ error: '좋아요 집계 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ liked: true, like_count: newCount ?? 0 });
  } catch (err) {
    console.error('[notice-like] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/** Supabase Auth 또는 Cookie 기반 유저 ID 추출 */
async function resolveUserId(req: NextRequest): Promise<string | null> {
  // 1. Supabase Auth (Bearer token)
  const authUser = await getAuthUser(req);
  if (authUser) return authUser.userId;

  // 2. Cookie 기반
  const cookieUser = await getCookieUser();
  if (cookieUser) return cookieUser.id;

  return null;
}
