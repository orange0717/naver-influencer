import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stories/[id]/like — 좋아요 토글 (이미 누른 상태면 해제)
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // 글 존재 + 승인 상태 확인
    const { data: story } = await supabase
      .from('growth_stories')
      .select('id, status, is_deleted')
      .eq('id', id)
      .single();

    if (!story || story.is_deleted || story.status !== 'approved') {
      return NextResponse.json({ error: '후기를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 기존 좋아요 확인
    const { data: existing } = await supabase
      .from('story_likes')
      .select('id')
      .eq('story_id', id)
      .eq('user_id', authUser.userId)
      .maybeSingle();

    if (existing) {
      // 해제
      await supabase.from('story_likes').delete().eq('id', existing.id);
      const { data: count } = await supabase.rpc('decrement_story_like_count', {
        p_story_id: id,
      });
      return NextResponse.json({ liked: false, like_count: count ?? 0 });
    }

    // 등록
    const { error: insertErr } = await supabase
      .from('story_likes')
      .insert({ story_id: id, user_id: authUser.userId });

    if (insertErr && insertErr.code !== '23505') {
      console.error('[stories/like] insert error:', insertErr);
      return NextResponse.json({ error: '좋아요에 실패했습니다.' }, { status: 500 });
    }

    const { data: count } = await supabase.rpc('increment_story_like_count', {
      p_story_id: id,
    });

    return NextResponse.json({ liked: true, like_count: count ?? 0 });
  } catch (err) {
    console.error('[stories/like] error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
