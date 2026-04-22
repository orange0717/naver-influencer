import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/read
 * 현재 시각을 last_read_at 으로 upsert
 */
export async function POST() {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('chat_last_read')
    .upsert({ user_id: cookieUser.id, last_read_at: new Date().toISOString() }, { onConflict: 'user_id' });

  if (error) {
    console.error('[chat read] error:', error.message);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
