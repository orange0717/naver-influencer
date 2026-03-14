import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/community/[id]/like — 좋아요
 */
export async function POST(
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

    // like_count atomic 증가
    const { data: newLikeCount, error } = await supabase.rpc('increment_like_count', { post_id: id });

    if (error) {
      return NextResponse.json({ error: '게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ like_count: newLikeCount });
  } catch (err) {
    console.error('[community] LIKE error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
