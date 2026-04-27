import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import {
  getClaudeFeedbackUser,
  incrementClaudeFreeTrial,
  trimClaudeContext,
  deriveConversationTitle,
  CLAUDE_FEEDBACK_SYSTEM_PROMPT,
  CLAUDE_FEEDBACK_MESSAGE_LIMIT,
} from '@/lib/claude-feedback';
import { chatbookMessageLimiter, getClientIp } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';

export const dynamic = 'force-dynamic';
export const maxDuration = 90; // Opus 응답이 더 느리므로 여유

const MODEL_FREE = 'claude-sonnet-4-6';
const MODEL_PAID = 'claude-opus-4-6';

/**
 * GET /api/dashboard/claude/conversations/[id]/messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getClaudeFeedbackUser(request);
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createServiceClient();

  const { data: conv } = await supabase
    .from('claude_conversations')
    .select('id, user_id, title')
    .eq('id', id)
    .maybeSingle();
  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('claude_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[claude-feedback] messages list failed:', error.message);
    return NextResponse.json({ error: '메시지를 불러오지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({
    conversation: { id: conv.id, title: conv.title },
    messages: data || [],
  });
}

/**
 * POST /api/dashboard/claude/conversations/[id]/messages
 * body: { content }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (AI_DISABLED) return aiDisabledResponse();
  const user = await getClaudeFeedbackUser(request);
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 무료 체험 한도 초과 차단 (admin/influencer 는 무제한)
  if (user.plan === 'free_trial' && user.freeTrialUsed >= user.freeTrialLimit) {
    return NextResponse.json(
      {
        error: `무료 체험 ${user.freeTrialLimit}회를 모두 사용했어요. 인플루언서 플랜에서 계속 이용할 수 있습니다.`,
        plan: user.plan,
        freeTrialUsed: user.freeTrialUsed,
        freeTrialLimit: user.freeTrialLimit,
      },
      { status: 402 }, // Payment Required
    );
  }

  // Rate limit (챗북과 동일 한도 — 1분 20회)
  const ip = getClientIp(request);
  if (await chatbookMessageLimiter.check(`claude-feedback:${user.id}:${ip}`)) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429 },
    );
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
  if (!content) {
    return NextResponse.json({ error: '메시지를 입력해주세요.' }, { status: 400 });
  }
  if (content.length > CLAUDE_FEEDBACK_MESSAGE_LIMIT) {
    return NextResponse.json(
      { error: `메시지는 ${CLAUDE_FEEDBACK_MESSAGE_LIMIT}자 이내로 입력해주세요.` },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  const { data: conv } = await supabase
    .from('claude_conversations')
    .select('id, user_id, message_count, title')
    .eq('id', id)
    .maybeSingle();
  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 기존 메시지 로드
  const { data: prior } = await supabase
    .from('claude_messages')
    .select('role, content')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(60);

  const contextMessages = trimClaudeContext([
    ...((prior || []) as Array<{ role: string; content: string }>),
    { role: 'user', content },
  ]);

  if (contextMessages.length === 0 || contextMessages[contextMessages.length - 1].role !== 'user') {
    return NextResponse.json({ error: '메시지 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  // 사용자 메시지 저장 (Claude 호출 전에)
  const { data: userMsg } = await supabase
    .from('claude_messages')
    .insert({ conversation_id: id, role: 'user', content })
    .select('id, role, content, created_at')
    .single();

  // 첫 메시지면 대화 제목을 사용자 메시지에서 자동 추출
  if (conv.message_count === 0 && conv.title === '새 대화') {
    await supabase
      .from('claude_conversations')
      .update({ title: deriveConversationTitle(content) })
      .eq('id', id);
  }

  // plan 별 모델 분기:
  // free_trial → Sonnet (비용 절감), influencer/admin → Opus (깊이 있는 피드백)
  const model = user.plan === 'free_trial' ? MODEL_FREE : MODEL_PAID;

  let replyText = '';
  let usageIn: number | null = null;
  let usageOut: number | null = null;
  try {
    const anthropic = new Anthropic({ apiKey });
    const result = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: CLAUDE_FEEDBACK_SYSTEM_PROMPT,
      messages: contextMessages,
    });
    const block = result.content?.[0];
    if (block && block.type === 'text') replyText = block.text;
    usageIn = result.usage?.input_tokens ?? null;
    usageOut = result.usage?.output_tokens ?? null;
  } catch (err) {
    console.error('[claude-feedback] Claude call failed:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: '응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    );
  }

  if (!replyText) {
    return NextResponse.json({ error: '응답을 받지 못했습니다.' }, { status: 502 });
  }

  const { data: saved } = await supabase
    .from('claude_messages')
    .insert({
      conversation_id: id,
      role: 'assistant',
      content: replyText,
      tokens_in: usageIn,
      tokens_out: usageOut,
    })
    .select('id, role, content, created_at')
    .single();

  // 무료 체험 사용량 +1 (성공 응답 후)
  let freeTrialUsedNext = user.freeTrialUsed;
  if (user.plan === 'free_trial') {
    try {
      freeTrialUsedNext = await incrementClaudeFreeTrial(user.userId);
    } catch (err) {
      console.error(
        '[claude-feedback] increment free trial failed:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  return NextResponse.json({
    userMessage: userMsg,
    reply: saved || {
      role: 'assistant',
      content: replyText,
      created_at: new Date().toISOString(),
    },
    plan: user.plan,
    freeTrialUsed: freeTrialUsedNext,
    freeTrialLimit: user.freeTrialLimit,
  });
}
