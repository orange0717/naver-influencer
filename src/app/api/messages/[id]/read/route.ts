import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * 쪽지 읽음 처리
 * PATCH /api/messages/[id]/read
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;

  const supabase = createServiceClient();

  // 수신자 naver_id 조회
  let receiverNaverId: string | null = null;
  if (auth.user.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id')
      .eq('id', auth.user.linked_influencer_id)
      .single();
    receiverNaverId = inf?.naver_id || null;
  }

  if (!receiverNaverId) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('messages')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('receiver_naver_id', receiverNaverId);

  if (error) {
    return NextResponse.json({ error: '읽음 처리 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
