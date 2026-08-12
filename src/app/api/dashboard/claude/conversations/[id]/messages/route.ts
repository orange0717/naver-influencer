import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import {
  getClaudeFeedbackUser,
  trimClaudeContext,
  deriveConversationTitle,
  incrementClaudeFreeTrial,
  CLAUDE_FEEDBACK_SYSTEM_PROMPT,
  CLAUDE_FEEDBACK_MESSAGE_LIMIT,
} from '@/lib/claude-feedback';
import { chatbookMessageLimiter, getClientIp } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { getAnthropicClient, CLAUDE_MODEL_HAIKU as MODEL_HAIKU, CLAUDE_MODEL_OPUS as MODEL_OPUS } from '@/lib/claude-client';
import { assertCreditFor, chargeCreditIfEnabled } from '@/lib/credit-gate';

export const dynamic = 'force-dynamic';
export const maxDuration = 90; // Opus 응답이 더 느리므로 여유

// 모델 분기 (2026-05-07~):
//   결제 이력 보유자(users.first_paid_at IS NOT NULL) → Opus 4.6 (정확도 우선)
//   그 외(무료 체험·admin 부여 INFLUENCER 포함) → Haiku 4.5 (비용 절감)
//   admin(관리자) 는 결제 여부와 무관 — 결제했으면 Opus, 아니면 Haiku.
//   원가 차이: Opus ≈ 640원/회, Haiku ≈ 80원/회.

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
    isPaid: user.isPaid,
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

  // 무료 체험(비결제 INFLUENCER) 사용자만 메시지 한도 집행 — 관리자·결제자는 무제한
  if (user.plan !== 'admin' && !user.isPaid && user.freeTrialUsed >= user.freeTrialLimit) {
    return NextResponse.json(
      {
        error: `무료 체험 메시지 ${user.freeTrialLimit}회를 모두 사용했습니다. 결제 후 계속 이용해주세요.`,
        freeTrialUsed: user.freeTrialUsed,
        freeTrialLimit: user.freeTrialLimit,
      },
      { status: 402 },
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

  let anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch {
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

  // Opus(결제자) 경로만 크레딧 확인 — Haiku(무료체험)는 free-trial 카운트로 제어(미활성이면 통과).
  if (user.isPaid) {
    const creditDenied = await assertCreditFor(user.userId, 'ai_dashboard_opus');
    if (creditDenied) return creditDenied;
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

  // 결제 이력 보유자만 Opus, 그 외는 Haiku (admin 수동 부여 INFLUENCER 도 Haiku).
  const model = user.isPaid ? MODEL_OPUS : MODEL_HAIKU;

  let replyText = '';
  let usageIn: number | null = null;
  let usageOut: number | null = null;
  try {
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

  if (user.isPaid) {
    await chargeCreditIfEnabled(user.userId, 'ai_dashboard_opus'); // Opus 응답 성공 후 차감(미활성이면 no-op)
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

  // 무료 체험(비결제 INFLUENCER) 사용자만 사용량 집행 — 관리자·결제자는 카운트 안 함
  let freeTrialUsed = user.freeTrialUsed;
  if (user.plan !== 'admin' && !user.isPaid) {
    freeTrialUsed = await incrementClaudeFreeTrial(user.userId);
  }

  return NextResponse.json({
    userMessage: userMsg,
    reply: saved || {
      role: 'assistant',
      content: replyText,
      created_at: new Date().toISOString(),
    },
    plan: user.plan,
    freeTrialUsed,
    freeTrialLimit: user.freeTrialLimit,
    isPaid: user.isPaid,
  });
}
