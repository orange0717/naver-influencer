import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser, getCookieUser } from '@/lib/auth';
import { notificationLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await notificationLimiter.check(ip)) return rateLimitResponse();

  const supabase = createServiceClient();

  // 인증: 가입자 또는 데모 유저
  let recipientCol: string;
  let recipientId: string;

  const auth = await getAuthUser(request);
  if (auth) {
    recipientCol = 'user_id';
    recipientId = auth.userId;
  } else {
    const cookie = await getCookieUser();
    if (cookie?.type === 'influencer') {
      // 데모 세션 조회
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

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  // 알림 목록 조회
  const { data: notifications, count } = await supabase
    .from('notifications')
    .select('id, notification_type, title, body, metadata, is_read, created_at', { count: 'exact' })
    .eq(recipientCol, recipientId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // 읽지 않은 수
  const { count: unreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq(recipientCol, recipientId)
    .eq('is_read', false);

  return NextResponse.json({
    notifications: notifications || [],
    total: count || 0,
    unreadCount: unreadCount || 0,
    page,
    limit,
  });
}
