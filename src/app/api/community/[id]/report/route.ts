import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { validateBody } from '@/lib/validations';
import { reportSchema } from '@/lib/validations/community';

export const dynamic = 'force-dynamic';

/**
 * POST /api/community/[id]/report — 게시글 또는 댓글 신고
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: post_id } = await params;

  try {
    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await req.json();
    const v = validateBody(reportSchema, body);
    if (!v.success) return v.response;

    const { reason, target_type, comment_id, description } = v.data;

    const supabase = createServiceClient();

    // 게시글 존재 확인
    const { data: post } = await supabase
      .from('community_posts')
      .select('id')
      .eq('id', post_id)
      .eq('is_deleted', false)
      .single();

    if (!post) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 자기 글/댓글 신고 방지
    if (target_type === 'post') {
      const { data: myPost } = await supabase
        .from('community_posts')
        .select('author_id')
        .eq('id', post_id)
        .single();

      if (myPost?.author_id === cookieUser.id) {
        return NextResponse.json({ error: '본인의 글은 신고할 수 없습니다.' }, { status: 400 });
      }
    }

    // 신고 저장
    const reportData: Record<string, unknown> = {
      reporter_id: cookieUser.id,
      reporter_type: cookieUser.type,
      reason,
      description: description || null,
    };

    if (target_type === 'comment' && comment_id) {
      reportData.comment_id = comment_id;
    } else {
      reportData.post_id = post_id;
    }

    const { error } = await supabase
      .from('community_reports')
      .insert(reportData);

    if (error) {
      // 중복 신고
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 신고한 게시글/댓글입니다.' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, message: '신고가 접수되었습니다.' }, { status: 201 });
  } catch (err) {
    console.error('[community/report] error:', err);
    return NextResponse.json({ error: '신고 처리에 실패했습니다.' }, { status: 500 });
  }
}
