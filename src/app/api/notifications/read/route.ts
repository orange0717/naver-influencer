import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser, getCookieUser } from '@/lib/auth';
import { notificationLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export async function PUT(request: NextRequest) {
  const ip = getClientIp(request);
  if (await notificationLimiter.check(ip)) return rateLimitResponse();

  const supabase = createServiceClient();

  // 인증
  let recipientCol: string;
  let recipientId: string;

  const auth = await getAuthUser(request);
  if (auth) {
    recipientCol = 'user_id';
    recipientId = auth.userId;
  } else {
    const cookie = await getCookieUser();
    if (cookie?.type === 'influencer') {
      const { data: demo } = await supabase
        .from('demo_sessions')
        .select('id')
        .eq('naver_id', cookie.id)
        .not('verified_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!demo) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      recipientCol = 'demo_session_id';
      recipientId = demo.id;
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const { id, notice_id } = body as { id?: string; notice_id?: string };
  const now = new Date().toISOString();

  if (id) {
    // 개별 읽음 처리
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq('id', id)
      .eq(recipientCol, recipientId);
  } else if (notice_id) {
    // 특정 공지사항 알림만 읽음 처리 (notice 상세 페이지 진입 시)
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq(recipientCol, recipientId)
      .eq('notification_type', 'new_notice')
      .eq('metadata->>notice_id', notice_id)
      .eq('is_read', false);
  } else {
    // 전체 읽음 처리
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq(recipientCol, recipientId)
      .eq('is_read', false);
  }

  return NextResponse.json({ success: true });
}
