import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId, hasActivePaidPlanByUserId } from '@/lib/admin';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { getAnthropicClient, CLAUDE_MODEL_HAIKU } from '@/lib/claude-client';
import { chatbookMessageLimiter, getClientIp } from '@/lib/rate-limit';
import { requireFeatureAccess } from '@/lib/feature-gate';
import { AI_CONSULTANT_CATALOG, getFeatureById } from '@/lib/ai-consultant-catalog';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const QUERY_MAX_LENGTH = 400;
const TITLE_LIMIT = 40;

function deriveTitle(firstUserMessage: string): string {
  const flat = firstUserMessage.replace(/\s+/g, ' ').trim();
  if (!flat) return '새 분석';
  return flat.length <= TITLE_LIMIT ? flat : flat.slice(0, TITLE_LIMIT - 1) + '…';
}

// Claude에게 강제로 호출시킬 tool. free-text 응답 대신 구조화된 추천 목록을 받기 위함
// (질문 의도 분석 → 기존 N인플 기능 라우팅). 여기서 참조하는 catalog 확장은
// src/lib/ai-consultant-catalog.ts 에서만 하면 된다.
const RECOMMEND_TOOL = {
  name: 'recommend_analyses',
  description: '사용자의 마케팅/콘텐츠 고민을 분석해서 N인플의 기존 기능 중 도움이 될 것들을 추천한다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      interpretation: {
        type: 'string',
        description: '사용자의 질문을 한두 문장으로 요약 해석. 공감하는 톤으로, 존댓말로.',
      },
      recommendations: {
        type: 'array',
        description: '추천 기능 목록. 관련도 높은 순으로 최대 5개.',
        items: {
          type: 'object',
          properties: {
            featureId: {
              type: 'string',
              enum: AI_CONSULTANT_CATALOG.map((f) => f.id),
            },
            score: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              description: '이 질문에 대한 관련도 점수 1~5 (5가 가장 관련 높음)',
            },
            reason: {
              type: 'string',
              description: '왜 이 기능을 추천하는지 한 문장, 사용자 질문에 맞춰 구체적으로.',
            },
          },
          required: ['featureId', 'score', 'reason'],
        },
      },
    },
    required: ['interpretation', 'recommendations'],
  },
};

const SYSTEM_PROMPT = `당신은 N인플(네이버 인플루언서·블로그 마케팅 분석 서비스)의 AI 콘텐츠 컨설턴트입니다.
사용자가 마케팅/블로그/콘텐츠에 대한 고민을 자유롭게 입력하면, 그 의도를 파악해서
recommend_analyses 도구를 반드시 호출해 N인플에 이미 있는 기능 중 관련도 높은 것들을 추천하세요.

[규칙]
- 목록에 없는 기능은 절대 지어내지 마세요. 오직 제공된 기능 목록 중에서만 골라야 합니다.
- 관련 없는 질문(마케팅/콘텐츠와 무관한 잡담, 코드 요청 등)이면 recommendations를 빈 배열로 반환하고
  interpretation에 "마케팅이나 콘텐츠 관련 고민을 입력해주시면 도와드릴게요" 같은 안내를 담으세요.
- interpretation은 사용자의 상황에 공감하며 짧게 요약하는 한두 문장. 존댓말.
- score는 실제 관련도를 반영해서 차등 부여하세요. 관련 기능이 하나뿐이면 굳이 5개를 채우지 마세요.

[N인플 기능 목록]
${AI_CONSULTANT_CATALOG.map((f) => `- id: ${f.id} / ${f.label}: ${f.toolDescription}`).join('\n')}`;

/**
 * GET /api/ai-consultant/conversations/[id]/messages
 */
export async function GET(
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

  const { data: conv } = await supabase
    .from('ai_consultant_conversations')
    .select('id, user_id, title')
    .eq('id', id)
    .maybeSingle();
  if (!conv || conv.user_id !== authUser.userId) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('ai_consultant_messages')
    .select('id, role, content, recommendations, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[ai-consultant] messages list failed:', error.message);
    return NextResponse.json({ error: '메시지를 불러오지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ conversation: { id: conv.id, title: conv.title }, messages: data || [] });
}

/**
 * POST /api/ai-consultant/conversations/[id]/messages
 * body: { content } — 질문 한 건. 이전 대화 맥락은 Claude에 넘기지 않고 매 질문을 독립적으로
 * 라우팅한다(원래 단발성 설계 그대로) — 비용 절감 + "질문마다 새로 판단" 의도 유지.
 * 대화는 UI상의 이력 묶음일 뿐, Claude 쪽 멀티턴 기억은 아니다.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (AI_DISABLED) return aiDisabledResponse();

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

  const { id } = await params;
  const supabase = createServiceClient();
  const { data: conv } = await supabase
    .from('ai_consultant_conversations')
    .select('id, user_id, message_count, title')
    .eq('id', id)
    .maybeSingle();
  if (!conv || conv.user_id !== authUser.userId) {
    return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
  }

  const ip = getClientIp(request);
  if (await chatbookMessageLimiter.check(`ai-consultant:${authUser.userId}:${ip}`)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  const isPro = await hasActivePaidPlanByUserId(authUser.userId);
  const gate = await requireFeatureAccess(request, {
    actionId: 'ai_consultant',
    userId: authUser.userId,
    isPro,
  });
  if (!gate.ok) return gate.response;

  // 이 아래는 무료 1회가 이미 차감된 뒤다. 답을 못 주고 끝나는 경로는 전부 되돌려준다 —
  // 특히 빈 질문·길이 초과 같은 입력 오류는 AI를 부르지도 않았으므로 차감될 이유가 없다.
  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    await gate.refund();
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const content = (body.content || '').trim();
  if (!content) {
    await gate.refund();
    return NextResponse.json({ error: '질문을 입력해주세요.' }, { status: 400 });
  }
  if (content.length > QUERY_MAX_LENGTH) {
    await gate.refund();
    return NextResponse.json({ error: `질문은 ${QUERY_MAX_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  let anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch {
    await gate.refund();
    return NextResponse.json({ error: 'AI 서비스가 설정되지 않았습니다. 무료 횟수는 차감되지 않았습니다.' }, { status: 503 });
  }

  // 사용자 메시지 먼저 저장 (Claude 호출 전에 — 실패해도 질문 자체는 남도록)
  const { data: userMsg } = await supabase
    .from('ai_consultant_messages')
    .insert({ conversation_id: id, role: 'user', content })
    .select('id, role, content, created_at')
    .single();

  if (conv.message_count === 0 && conv.title === '새 분석') {
    await supabase
      .from('ai_consultant_conversations')
      .update({ title: deriveTitle(content) })
      .eq('id', id);
  }

  try {
    const result = await anthropic.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [RECOMMEND_TOOL],
      tool_choice: { type: 'tool', name: 'recommend_analyses' },
      messages: [{ role: 'user', content }],
    });

    const toolUseBlock = result.content.find(
      (block): block is Extract<typeof block, { type: 'tool_use' }> => block.type === 'tool_use',
    );
    if (!toolUseBlock) {
      await gate.refund();
      return NextResponse.json({ error: '답변을 생성하지 못했습니다. 무료 횟수는 차감되지 않았으니 잠시 후 다시 시도해주세요.' }, { status: 502 });
    }

    const input = toolUseBlock.input as {
      interpretation?: string;
      recommendations?: Array<{ featureId?: string; score?: number; reason?: string }>;
    };

    const recommendations = (input.recommendations || [])
      .map((r) => {
        const feature = r.featureId ? getFeatureById(r.featureId) : undefined;
        if (!feature) return null;
        return {
          featureId: feature.id,
          label: feature.label,
          href: feature.href,
          authOnly: feature.authOnly,
          external: feature.external ?? false,
          score: Math.min(5, Math.max(1, Math.round(r.score ?? 3))),
          reason: (r.reason || feature.reasonHint).slice(0, 200),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const interpretation = (input.interpretation || '').slice(0, 500);

    const { data: saved } = await supabase
      .from('ai_consultant_messages')
      .insert({
        conversation_id: id,
        role: 'assistant',
        content: interpretation,
        recommendations,
      })
      .select('id, role, content, recommendations, created_at')
      .single();

    return NextResponse.json({
      userMessage: userMsg,
      reply: saved || {
        role: 'assistant',
        content: interpretation,
        recommendations,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[ai-consultant] Claude call failed:', err instanceof Error ? err.message : err);
    await gate.refund();
    return NextResponse.json({ error: '답변을 생성하지 못했습니다. 무료 횟수는 차감되지 않았으니 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
