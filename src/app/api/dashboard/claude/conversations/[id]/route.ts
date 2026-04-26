import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import {
  getClaudeFeedbackUser,
  CLAUDE_FEEDBACK_TITLE_LIMIT,
} from '@/lib/claude-feedback';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/dashboard/claude/conversations/[id]
 * body: { title }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getClaudeFeedbackUser(request);
  if (!user) {
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
  if (title.length > CLAUDE_FEEDBACK_TITLE_LIMIT) {
    return NextResponse.json(
      { error: `제목은 ${CLAUDE_FEEDBACK_TITLE_LIMIT}자 이내로 입력해주세요.` },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('claude_conversations')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('claude_conversations')
    .update({ title })
    .eq('id', id);
  if (error) {
    console.error('[claude-feedback] rename failed:', error.message);
    return NextResponse.json({ error: '제목을 수정하지 못했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/dashboard/claude/conversations/[id]
 * 소프트 삭제 (is_archived = true)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getClaudeFeedbackUser(request);
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: existing } = await supabase
    .from('claude_conversations')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('claude_conversations')
    .update({ is_archived: true })
    .eq('id', id);
  if (error) {
    console.error('[claude-feedback] delete failed:', error.message);
    return NextResponse.json({ error: '대화를 삭제하지 못했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
