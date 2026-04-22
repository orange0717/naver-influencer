import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { validateBody } from '@/lib/validations';
import { chatReportSchema } from '@/lib/validations/chat';
import { chatReportLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/chat/messages/[id]/report
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

  const ip = getClientIp(req);
  if (await chatReportLimiter.check(`chatreport:${cookieUser.id}:${ip}`)) {
    return rateLimitResponse();
  }

  const body = await req.json();
  const v = validateBody(chatReportSchema, body);
  if (!v.success) return v.response;

  const supabase = createServiceClient();

  const { data: msg } = await supabase
    .from('chat_messages')
    .select('id, author_id')
    .eq('id', messageId)
    .maybeSingle();
  if (!msg) {
    return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (msg.author_id === cookieUser.id) {
    return NextResponse.json({ error: '본인 메시지는 신고할 수 없습니다.' }, { status: 400 });
  }

  const { error } = await supabase.from('chat_reports').insert({
    message_id: messageId,
    reporter_id: cookieUser.id,
    reason: v.data.reason,
    description: v.data.description || null,
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 신고한 메시지입니다.' }, { status: 409 });
    }
    console.error('[chat] report error:', error.message);
    return NextResponse.json({ error: '신고 처리 실패' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
