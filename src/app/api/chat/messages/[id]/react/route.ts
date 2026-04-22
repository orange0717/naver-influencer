import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { validateBody } from '@/lib/validations';
import { reactSchema } from '@/lib/validations/chat';
import { chatReactionLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { checkChatAccess } from '@/lib/chat-access';

export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/messages/[id]/react
 * 이모지 리액션 토글 (이미 존재하면 제거, 없으면 추가)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: messageId } = await params;

  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const access = await checkChatAccess(cookieUser);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const ip = getClientIp(req);
  if (await chatReactionLimiter.check(`chatreact:${cookieUser.id}:${ip}`)) {
    return rateLimitResponse();
  }

  const body = await req.json();
  const v = validateBody(reactSchema, body);
  if (!v.success) return v.response;

  const { emoji } = v.data;
  const supabase = createServiceClient();

  const { data: msg } = await supabase
    .from('chat_messages')
    .select('id, is_deleted')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg || msg.is_deleted) {
    return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('chat_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', cookieUser.id)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    await supabase.from('chat_reactions').delete().eq('id', existing.id);
    return NextResponse.json({ action: 'removed' });
  }

  const { error } = await supabase.from('chat_reactions').insert({
    message_id: messageId,
    user_id: cookieUser.id,
    emoji,
  });
  if (error) {
    console.error('[chat] react error:', error.message);
    return NextResponse.json({ error: '리액션 처리 실패' }, { status: 500 });
  }
  return NextResponse.json({ action: 'added' });
}
