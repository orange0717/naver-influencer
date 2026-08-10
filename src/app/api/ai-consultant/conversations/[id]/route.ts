import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const TITLE_LIMIT = 80;

/**
 * PATCH /api/ai-consultant/conversations/[id]
 * body: { title }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authUser;
  try {
    authUser = await getAuthUser(request);
  } catch {
    authUser = null;
  }
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  const title = (body.title || '').trim();
  if (!title) {
    return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 });
  }
  if (title.length > TITLE_LIMIT) {
    return NextResponse.json({ error: `제목은 ${TITLE_LIMIT}자 이내로 입력해주세요.` }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('ai_consultant_conversations')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.user_id !== authUser.userId) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('ai_consultant_conversations')
    .update({ title })
    .eq('id', id);
  if (error) {
    console.error('[ai-consultant] rename failed:', error.message);
    return NextResponse.json({ error: '제목을 수정하지 못했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/ai-consultant/conversations/[id]
 * 소프트 삭제 (is_archived = true)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authUser;
  try {
    authUser = await getAuthUser(request);
  } catch {
    authUser = null;
  }
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('ai_consultant_conversations')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.user_id !== authUser.userId) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('ai_consultant_conversations')
    .update({ is_archived: true })
    .eq('id', id);
  if (error) {
    console.error('[ai-consultant] delete failed:', error.message);
    return NextResponse.json({ error: '대화를 삭제하지 못했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
