import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getClaudeFeedbackUser } from '@/lib/claude-feedback';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/claude/conversations
 * 사이드바용 대화 목록 (최근 30개)
 */
export async function GET(request: NextRequest) {
  const user = await getClaudeFeedbackUser(request);
  if (!user) {
    return NextResponse.json({ error: 'INFLUENCER 플랜이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('claude_conversations')
    .select('id, title, message_count, updated_at, created_at')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[claude-feedback] conversations list failed:', error.message);
    return NextResponse.json({ error: '대화 목록을 불러오지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ conversations: data || [] });
}

/**
 * POST /api/dashboard/claude/conversations
 * body: {} → 빈 새 대화 생성
 */
export async function POST(request: NextRequest) {
  const user = await getClaudeFeedbackUser(request);
  if (!user) {
    return NextResponse.json({ error: 'INFLUENCER 플랜이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('claude_conversations')
    .insert({ user_id: user.id, title: '새 대화' })
    .select('id, title, message_count, updated_at, created_at')
    .single();

  if (error || !data) {
    console.error('[claude-feedback] create conversation failed:', error?.message);
    return NextResponse.json({ error: '대화를 생성하지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ conversation: data });
}
