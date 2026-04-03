import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/community/[id] — 게시글 상세 + 댓글
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const supabase = createServiceClient();

    // 게시글 조회
    const { data: post, error } = await supabase
      .from('community_posts')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 조회수 증가: 클라이언트가 X-Count-View 헤더를 보낸 경우만 (첫 조회)
    let newViewCount = null;
    const shouldCount = _req.headers.get('x-count-view') === '1';
    if (shouldCount) {
      const ua = _req.headers.get('user-agent') || '';
      const isBot = /bot|crawl|spider|preview|headless|phantom|puppeteer|playwright/i.test(ua);
      if (!isBot) {
        const { data } = await supabase.rpc('increment_view_count', { post_id: id });
        newViewCount = data;
      }
    }

    // 댓글 조회
    const { data: comments } = await supabase
      .from('community_comments')
      .select('id, content, author_id, author_name, author_type, created_at')
      .eq('post_id', id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    // 투표 조회
    let poll = null;
    const { data: pollData } = await supabase
      .from('community_polls')
      .select('id, question, is_multiple, ends_at')
      .eq('post_id', id)
      .single();

    if (pollData) {
      const { data: options } = await supabase
        .from('community_poll_options')
        .select('id, label, vote_count, sort_order')
        .eq('poll_id', pollData.id)
        .order('sort_order', { ascending: true });

      // 현재 사용자의 투표 여부
      const cookieUser = await getCookieUser();
      let userVoteOptionId: string | null = null;
      if (cookieUser) {
        const { data: vote } = await supabase
          .from('community_poll_votes')
          .select('option_id')
          .eq('poll_id', pollData.id)
          .eq('user_id', cookieUser.id)
          .single();
        userVoteOptionId = vote?.option_id || null;
      }

      const totalVotes = (options || []).reduce((sum, o) => sum + (o.vote_count || 0), 0);

      poll = {
        ...pollData,
        options: options || [],
        totalVotes,
        userVoteOptionId,
      };
    }

    return NextResponse.json({
      post: { ...post, view_count: newViewCount ?? post.view_count },
      comments: comments || [],
      poll,
    });
  } catch (err) {
    console.error('[community] GET detail error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * DELETE /api/community/[id] — 게시글 삭제 (작성자만)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    // 쿠키에서 인증된 유저 확인
    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = createServiceClient();

    // 작성자 확인 (쿠키의 유저 ID와 게시글 작성자 비교)
    const { data: post } = await supabase
      .from('community_posts')
      .select('author_id')
      .eq('id', id)
      .single();

    if (!post || post.author_id !== cookieUser.id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 소프트 삭제
    await supabase
      .from('community_posts')
      .update({ is_deleted: true })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[community] DELETE error:', err);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
