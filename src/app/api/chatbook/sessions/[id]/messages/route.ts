import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import { getChatbookUser, trimContext, CHATBOOK_SAFETY_SUFFIX, CHATBOOK_MESSAGE_LIMIT } from '@/lib/chatbook';
import { chatbookMessageLimiter, getClientIp } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODEL = 'claude-haiku-4-5-20251001';

/**
 * GET /api/chatbook/sessions/[id]/messages
 * 세션의 메시지 이력 (오래된 순)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getChatbookUser(request);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { id } = await params;
  const supabase = createServiceClient();

  // 세션 소유권 확인
  const { data: session } = await supabase
    .from('chatbook_sessions')
    .select('id, user_id, character_id')
    .eq('id', id)
    .maybeSingle();
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('chatbook_messages')
    .select('id, role, content, created_at')
    .eq('session_id', id)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[chatbook] messages list failed:', error.message);
    return NextResponse.json({ error: '메시지를 불러오지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({
    session: { id: session.id, character_id: session.character_id },
    messages: data || [],
  });
}

/**
 * POST /api/chatbook/sessions/[id]/messages
 * body: { content }
 * 사용자 메시지 저장 → Claude 호출 → assistant 응답 저장 → 반환
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (AI_DISABLED) return aiDisabledResponse();
  const user = await getChatbookUser(request);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  // Rate limit
  const ip = getClientIp(request);
  if (await chatbookMessageLimiter.check(`chatbook:${user.id}:${ip}`)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  const { id } = await params;

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const content = (body.content || '').trim();
  if (!content) return NextResponse.json({ error: '메시지를 입력해주세요.' }, { status: 400 });
  if (content.length > CHATBOOK_MESSAGE_LIMIT) {
    return NextResponse.json({ error: `메시지는 ${CHATBOOK_MESSAGE_LIMIT}자 이내로 입력해주세요.` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 세션 + 캐릭터 조회
  const { data: session } = await supabase
    .from('chatbook_sessions')
    .select('id, user_id, character_id')
    .eq('id', id)
    .maybeSingle();
  if (!session || session.user_id !== user.id) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: character } = await supabase
    .from('chatbook_characters')
    .select('system_prompt, is_active')
    .eq('id', session.character_id)
    .maybeSingle();
  if (!character || !character.is_active) {
    return NextResponse.json({ error: '사용할 수 없는 캐릭터입니다.' }, { status: 404 });
  }

  // 기존 이력 로드
  const { data: prior } = await supabase
    .from('chatbook_messages')
    .select('role, content')
    .eq('session_id', id)
    .order('created_at', { ascending: true })
    .limit(100);

  const contextMessages = trimContext([
    ...((prior || []) as Array<{ role: string; content: string }>),
    { role: 'user', content },
  ]);

  if (contextMessages.length === 0 || contextMessages[contextMessages.length - 1].role !== 'user') {
    return NextResponse.json({ error: '메시지 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  // 사용자 메시지 저장 (Claude 호출 전에 먼저)
  await supabase.from('chatbook_messages').insert({
    session_id: id,
    role: 'user',
    content,
  });

  // Claude 호출
  let replyText = '';
  let usageIn: number | null = null;
  let usageOut: number | null = null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: character.system_prompt + CHATBOOK_SAFETY_SUFFIX,
      messages: contextMessages,
    });
    const block = result.content?.[0];
    if (block && block.type === 'text') replyText = block.text;
    usageIn = result.usage?.input_tokens ?? null;
    usageOut = result.usage?.output_tokens ?? null;
  } catch (err) {
    console.error('[chatbook] Claude call failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }

  if (!replyText) {
    return NextResponse.json({ error: '응답을 받지 못했습니다.' }, { status: 502 });
  }

  // assistant 메시지 저장
  const { data: saved } = await supabase
    .from('chatbook_messages')
    .insert({
      session_id: id,
      role: 'assistant',
      content: replyText,
      tokens_in: usageIn,
      tokens_out: usageOut,
    })
    .select('id, role, content, created_at')
    .single();

  return NextResponse.json({
    reply: saved || { role: 'assistant', content: replyText, created_at: new Date().toISOString() },
  });
}
