import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { isAdminFromProfile } from '@/lib/admin';
import { validateBody } from '@/lib/validations';
import { editMessageSchema } from '@/lib/validations/chat';
import { detectProfanity } from '@/lib/profanity';
import { checkChatAccess } from '@/lib/chat-access';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/chat/messages/[id]
 * 본인 메시지 수정 (전송 후 10분 이내)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const access = await checkChatAccess(cookieUser);
  if (!access.allowed) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await req.json();
  const v = validateBody(editMessageSchema, body);
  if (!v.success) return v.response;

  const supabase = createServiceClient();

  const { data: msg } = await supabase
    .from('chat_messages')
    .select('author_id, created_at, is_deleted')
    .eq('id', id)
    .maybeSingle();

  if (!msg || msg.is_deleted) {
    return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (msg.author_id !== cookieUser.id) {
    return NextResponse.json({ error: '본인의 메시지만 수정할 수 있습니다.' }, { status: 403 });
  }

  const ageMs = Date.now() - new Date(msg.created_at).getTime();
  if (ageMs > 10 * 60 * 1000) {
    return NextResponse.json({ error: '10분이 지난 메시지는 수정할 수 없습니다.' }, { status: 403 });
  }

  const scan = detectProfanity(v.data.content);
  if (scan.severity === 'severe') {
    return NextResponse.json({ error: '부적절한 표현이 감지되어 수정할 수 없습니다.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('chat_messages')
    .update({
      content: scan.cleaned,
      has_profanity: scan.severity === 'mild',
      is_edited: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('[chat] PATCH error:', error.message);
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/chat/messages/[id]
 * 본인 메시지 삭제 또는 관리자 강제 삭제 (soft)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: msg } = await supabase
    .from('chat_messages')
    .select('author_id, is_deleted')
    .eq('id', id)
    .maybeSingle();

  if (!msg) {
    return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (msg.is_deleted) {
    return NextResponse.json({ success: true });
  }

  // 관리자 권한 확인 (users.id 기준)
  const orClause = cookieUser.type === 'blogger'
    ? `blog_id.eq.${cookieUser.id}`
    : `naver_id.eq.${cookieUser.id}`;
  const { data: userRow } = await supabase
    .from('users')
    .select('id, is_admin')
    .or(orClause)
    .limit(1)
    .maybeSingle();
  const userIsAdmin = userRow?.id ? isAdminFromProfile(userRow) : false;

  if (msg.author_id !== cookieUser.id && !userIsAdmin) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('chat_messages')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[chat] DELETE error:', error.message);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
