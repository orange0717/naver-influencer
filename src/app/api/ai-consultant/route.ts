import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId, hasActivePaidPlanByUserId } from '@/lib/admin';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { getAnthropicClient, CLAUDE_MODEL_HAIKU } from '@/lib/claude-client';
import { chatbookMessageLimiter, getClientIp } from '@/lib/rate-limit';
import { requireFeatureAccess } from '@/lib/feature-gate';
import { AI_CONSULTANT_CATALOG, getFeatureById } from '@/lib/ai-consultant-catalog';
import { createServiceClient } from '@/lib/supabase-server';

const RECENT_QUERIES_LIMIT = 8;

/**
 * GET /api/ai-consultant — 로그인한 사용자의 최근 질문 이력(최대 8건)
 * "최근 분석" 목록 표시용. Claude 재호출 없이 저장된 결과를 그대로 내려준다.
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
    .from('ai_consultant_queries')
    .select('id, query, interpretation, recommendations, created_at')
    .eq('user_id', authUser.userId)
    .order('created_at', { ascending: false })
    .limit(RECENT_QUERIES_LIMIT);

  if (error) {
    console.error('[ai-consultant] recent list failed:', error.message);
    return NextResponse.json({ error: '최근 분석을 불러오지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const QUERY_MAX_LENGTH = 400;

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

export async function POST(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();

  // 2026-08-08 프리미엄 모델 전환: 로그인 없이도 하루 5회 무료 풀로 체험 가능.
  // 로그인 사용자는 회원 무료 풀(10회) 또는 PRO 이용권 무제한.
  let authUser;
  try {
    authUser = await getAuthUser(request);
  } catch {
    authUser = null;
  }
  if (authUser && (await isRestrictedByUserId(authUser.userId))) {
    return NextResponse.json({ error: '이용이 제한된 계정입니다.' }, { status: 403 });
  }

  const ip = getClientIp(request);
  if (await chatbookMessageLimiter.check(`ai-consultant:${authUser?.userId ?? 'anon'}:${ip}`)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  const isPro = authUser ? await hasActivePaidPlanByUserId(authUser.userId) : false;
  const gate = await requireFeatureAccess(request, {
    actionId: 'ai_consultant',
    userId: authUser?.userId ?? null,
    isPro,
  });
  if (!gate.ok) return gate.response;

  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const query = (body.query || '').trim();
  if (!query) {
    return NextResponse.json({ error: '질문을 입력해주세요.' }, { status: 400 });
  }
  if (query.length > QUERY_MAX_LENGTH) {
    return NextResponse.json({ error: `질문은 ${QUERY_MAX_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  let anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch {
    return NextResponse.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    const result = await anthropic.messages.create({
      model: CLAUDE_MODEL_HAIKU,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [RECOMMEND_TOOL],
      tool_choice: { type: 'tool', name: 'recommend_analyses' },
      messages: [{ role: 'user', content: query }],
    });

    const toolUseBlock = result.content.find(
      (block): block is Extract<typeof block, { type: 'tool_use' }> => block.type === 'tool_use',
    );
    if (!toolUseBlock) {
      return NextResponse.json({ error: '추천을 생성하지 못했습니다.' }, { status: 502 });
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

    // 이력 저장 (로그인 사용자만 — user_id 필수 컬럼. 비회원 호출은 "최근 분석" 목록에 안 남을 뿐
    // 응답 자체는 동일하게 받는다. 실패해도 사용자 응답은 막지 않는다.)
    let savedId: string | null = null;
    if (authUser) {
      try {
        const supabase = createServiceClient();
        const { data: saved } = await supabase
          .from('ai_consultant_queries')
          .insert({
            user_id: authUser.userId,
            query,
            interpretation,
            recommendations,
          })
          .select('id')
          .single();
        savedId = saved?.id ?? null;
      } catch (saveErr) {
        console.error('[ai-consultant] history save failed:', saveErr instanceof Error ? saveErr.message : saveErr);
      }
    }

    return NextResponse.json({ id: savedId, interpretation, recommendations });
  } catch (err) {
    console.error('[ai-consultant] Claude call failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
