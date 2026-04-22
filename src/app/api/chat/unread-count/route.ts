import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/unread-count
 * last_read_at 이후에 들어온 메시지 수 (본인 제외, 100까지만 세고 99+ 표시)
 */
export async function GET() {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ count: 0 });
  }

  const supabase = createServiceClient();
  const { data: lr } = await supabase
    .from('chat_last_read')
    .select('last_read_at')
    .eq('user_id', cookieUser.id)
    .maybeSingle();

  const lastReadAt = lr?.last_read_at || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('is_deleted', false)
    .neq('author_id', cookieUser.id)
    .gt('created_at', lastReadAt);

  return NextResponse.json({ count: Math.min(count || 0, 99) });
}
