import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-consultant/conversations
 * "N인플 AI" 좌측 대화 목록 (최근 30개, 보관 제외)
 */
export async function GET(request: NextRequest) {
  let authUser;
  try {
    authUser = await getAuthUser(request);
  } catch {
    authUser = null;
  }
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ai_consultant_conversations')
    .select('id, title, message_count, updated_at, created_at')
    .eq('user_id', authUser.userId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[ai-consultant] conversations list failed:', error.message);
    return NextResponse.json({ error: '대화 목록을 불러오지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ conversations: data || [] });
}

/**
 * POST /api/ai-consultant/conversations
 * body: {} → 빈 새 대화 생성 (첫 메시지 전송 시 제목이 자동으로 채워짐)
 */
export async function POST(request: NextRequest) {
  let authUser;
  try {
    authUser = await getAuthUser(request);
  } catch {
    authUser = null;
  }
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (await isRestrictedByUserId(authUser.userId)) {
    return NextResponse.json({ error: '이용이 제한된 계정입니다.' }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ai_consultant_conversations')
    .insert({ user_id: authUser.userId, title: '새 분석' })
    .select('id, title, message_count, updated_at, created_at')
    .single();

  if (error || !data) {
    console.error('[ai-consultant] create conversation failed:', error?.message);
    return NextResponse.json({ error: '대화를 생성하지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ conversation: data });
}
