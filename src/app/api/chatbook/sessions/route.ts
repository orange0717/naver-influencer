import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getChatbookUser } from '@/lib/chatbook';

export const dynamic = 'force-dynamic';

/**
 * GET /api/chatbook/sessions
 * 현재 사용자의 활성 세션 목록
 */
export async function GET(request: NextRequest) {
  const user = await getChatbookUser(request);
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('chatbook_sessions')
    .select('id, character_id, title, message_count, updated_at, created_at')
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[chatbook] sessions list failed:', error.message);
    return NextResponse.json({ error: '대화 목록을 불러오지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ sessions: data || [] });
}

/**
 * POST /api/chatbook/sessions
 * body: { characterId }
 * 새 세션을 만들거나 기존 활성 세션을 반환.
 */
export async function POST(request: NextRequest) {
  const user = await getChatbookUser(request);
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { characterId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const characterId = (body.characterId || '').trim();
  if (!characterId) {
    return NextResponse.json({ error: '캐릭터 정보가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 캐릭터 유효성 + 플랫폼 확인
  const { data: character } = await supabase
    .from('chatbook_characters')
    .select('id, name, platform, is_active')
    .eq('id', characterId)
    .maybeSingle();
  if (!character || !character.is_active || (character.platform !== 'both' && character.platform !== 'ninfl')) {
    return NextResponse.json({ error: '사용할 수 없는 캐릭터입니다.' }, { status: 404 });
  }

  // 기존 활성 세션이 있으면 재사용
  const { data: existing } = await supabase
    .from('chatbook_sessions')
    .select('id, message_count')
    .eq('user_id', user.id)
    .eq('character_id', characterId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ session: existing, created: false });
  }

  const { data: inserted, error: insErr } = await supabase
    .from('chatbook_sessions')
    .insert({ user_id: user.id, character_id: characterId, title: character.name })
    .select('id, message_count')
    .single();

  if (insErr || !inserted) {
    console.error('[chatbook] session create failed:', insErr?.message);
    return NextResponse.json({ error: '세션을 생성하지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ session: inserted, created: true });
}
