import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/ai-consultant/queries/[id]
 * 홈 "N인플 AI" 대화목록에서 저장된 질문 이력(ai_consultant_queries) 1건 삭제.
 * 본인 소유 행만 삭제 가능 (user_id 대조).
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
    .from('ai_consultant_queries')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.user_id !== authUser.userId) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('ai_consultant_queries')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('[ai-consultant] query delete failed:', error.message);
    return NextResponse.json({ error: '대화를 삭제하지 못했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
