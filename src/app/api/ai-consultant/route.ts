import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId, hasActivePaidPlanByUserId } from '@/lib/admin';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { getOpenAiClient, OPENAI_MODEL_MINI } from '@/lib/openai-client';
import { chatbookMessageLimiter, getClientIp } from '@/lib/rate-limit';
import { requireFeatureAccess } from '@/lib/feature-gate';
import { AI_CONSULTANT_CATALOG, getFeatureById } from '@/lib/ai-consultant-catalog';
import { createServiceClient } from '@/lib/supabase-server';
import { buildNinfleContext } from '@/lib/ai-consultant-context';

const RECENT_QUERIES_LIMIT = 8;

/**
 * GET /api/ai-consultant — 로그인한 사용자의 최근 질문 이력(최대 8건)
 * "최근 분석" 목록 표시용. AI 재호출 없이 저장된 결과를 그대로 내려준다.
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
const ANSWER_STORE_LIMIT = 4000;

// OpenAI(ChatGPT) structured output 스키마. 실제 정보성 답변(answer)과, 그와 관련해
// N인플에 이미 있는 기능 추천(recommendations)을 한 번의 호출로 함께 받는다.
// strict 모드라 모든 필드가 required + additionalProperties:false 여야 한다.
// 점수 범위(1~5) 제약은 스키마 대신 아래 응답 파싱에서 clamp 한다.
// 참조하는 catalog 확장은 src/lib/ai-consultant-catalog.ts 에서만 하면 된다.
const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: {
      type: 'string',
      description:
        '사용자의 고민에 실제로 도움이 되는 구체적 답변. 존댓말, 친절하고 실용적으로. ' +
        '핵심부터, 필요하면 번호목록이나 줄바꿈으로 정리. 200~600자 내외.',
    },
    recommendations: {
      type: 'array',
      description: '답변과 관련해 도움이 될 N인플 기능 목록. 관련도 높은 순으로 최대 5개.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          featureId: {
            type: 'string',
            enum: AI_CONSULTANT_CATALOG.map((f) => f.id),
          },
          score: {
            type: 'integer',
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
  required: ['answer', 'recommendations'],
} as const;

const SYSTEM_PROMPT = `당신은 N인플(네이버 인플루언서·블로그 마케팅 분석 서비스) 전용 AI 마케팅·데이터 분석 컨설턴트입니다.
당신의 가장 중요한 임무는 일반적인 ChatGPT 답변을 제공하는 것이 아니라, N인플이 축적한 데이터와
사용자의 현재 대화 맥락을 분석해 가장 정확하고 실용적인 답변을 제공하는 것입니다.

[답변 우선순위]
1. 메시지로 제공된 "N인플 데이터" Context — 있으면 이 데이터를 최우선 근거로 사용.
2. 현재 대화에서 사용자가 앞서 제공한 정보(업종·타깃 등)를 기억해 반영.
3. N인플 데이터로 답할 수 없는 부분만 일반 마케팅 지식으로 보완.

[절대 규칙 — 데이터 정직성]
- "N인플 데이터" Context 에 없는 순위·팬수·방문자수·미노출 여부·인플루언서 성과·키워드 수치를
  실제 데이터인 것처럼 만들어내지 마세요. 그럴듯한 숫자를 지어내는 것은 금지입니다.
- Context 에 데이터가 없거나 "찾지 못했다/기록이 없다"고 적혀 있으면, 그 사실을 그대로 알리고
  (예: "현재 N인플에 저장된 데이터만으로는 확정할 수 없습니다") 필요한 추가 정보나 실행할 기능을 안내하세요.
- N인플 데이터로 말하는 부분과 일반 마케팅 지식으로 말하는 부분을 섞지 말고 명확히 구분하세요.
  · N인플 데이터 근거: "N인플 데이터 기준으로 보면…"
  · 일반 지식: "일반적인 마케팅 기준으로 보면…"

[답변(answer) 작성 지침]
- 존댓말, 친절하고 실용적으로. 핵심부터, 필요하면 번호목록·줄바꿈·간단한 표로 정리. 200~700자 내외.
- 인플루언서 추천처럼 N인플 데이터가 제공된 경우: 후보를 비교하고 각 추천의 "근거"를 반드시 제시한 뒤,
  마지막에 "현재 N인플 데이터 기준으로는 ○○가 가장 적합합니다"처럼 결론을 명확히 제시하세요.
- 일반 지식 질문(예: "ROAS가 뭐야?")은 사전식 정의가 아니라 마케팅 관점에서 예시와 함께 설명하세요.
- 마케팅/콘텐츠와 무관한 잡담·코드 요청 등이면 정중히 "마케팅·블로그·콘텐츠 관련 고민을 도와드린다"고 안내하세요.

[recommendations] — 답변과 관련해 N인플에 이미 있는 기능 중 도움이 될 것을 관련도 높은 순으로 최대 5개.
- 목록에 없는 기능은 절대 지어내지 마세요. 오직 아래 목록에서만 고르세요.
- 관련 기능이 없으면 빈 배열로 두세요. score는 실제 관련도(1~5)를 차등 부여하세요.

[N인플 기능 목록]
${AI_CONSULTANT_CATALOG.map((f) => `- id: ${f.id} / ${f.label}: ${f.toolDescription}`).join('\n')}`;

export async function POST(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();

  // 2026-08-08 프리미엄 모델 전환: 로그인 없이도 하루 3회 무료 풀로 체험 가능.
  // 로그인 무료회원도 하루 3회, PRO 이용권 보유자만 무제한. 초과 시 유료가입 유도.
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

  let body: { query?: string; history?: Array<{ role?: string; content?: string }> };
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

  // 멀티턴 맥락(§8·§15): 같은 세션에서 앞서 오간 대화를 클라이언트가 함께 보내면,
  // 사용자가 앞서 밝힌 업종·타깃 등을 기억해 이번 질문에 반영한다. 남용 방지로 최근 6턴·각 500자로 제한.
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-6)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: (m.content as string).slice(0, 500) }));

  let openai;
  try {
    openai = getOpenAiClient();
  } catch {
    return NextResponse.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  // ── N인플 데이터 검색(RAG) — 질문 의도를 분석해 실제 저장 데이터를 조회하고 Context 로 만든다.
  // 조회 실패는 답변을 막지 않는다(일반 지식으로라도 답하도록). 데이터가 있으면 그것을 최우선 근거로 쓴다.
  let ninfle;
  try {
    ninfle = await buildNinfleContext({ query, userId: authUser?.userId ?? null });
  } catch (ctxErr) {
    console.error('[ai-consultant] context build failed:', ctxErr instanceof Error ? ctxErr.message : ctxErr);
    ninfle = { intents: ['general' as const], contextBlock: '', dataFound: false, sources: [] };
  }

  // OpenAI 메시지 조립: system → (N인플 데이터 Context) → 이전 대화 → 이번 질문
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];
  if (ninfle.contextBlock) {
    messages.push({
      role: 'system',
      content:
        `아래는 이번 질문에 대해 N인플 DB에서 실제로 조회한 데이터입니다. ` +
        `이 안의 값만 "N인플 데이터"로 인용하고, 여기 없는 수치는 지어내지 마세요.\n\n${ninfle.contextBlock}`,
    });
  }
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: 'user', content: query });

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL_MINI,
      max_tokens: 1200,
      temperature: 0.5,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'consultant_answer', strict: true, schema: RESPONSE_SCHEMA },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return NextResponse.json({ error: '응답을 생성하지 못했습니다.' }, { status: 502 });
    }

    let parsed: {
      answer?: string;
      recommendations?: Array<{ featureId?: string; score?: number; reason?: string }>;
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: '응답을 생성하지 못했습니다.' }, { status: 502 });
    }

    const recommendations = (parsed.recommendations || [])
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

    // interpretation 컬럼에 ChatGPT의 실제 답변을 저장한다(기존 스키마 재사용 — DB 마이그레이션 불필요).
    const interpretation = (parsed.answer || '').trim().slice(0, ANSWER_STORE_LIMIT);
    if (!interpretation) {
      return NextResponse.json({ error: '응답을 생성하지 못했습니다.' }, { status: 502 });
    }

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

    return NextResponse.json({
      id: savedId,
      interpretation,
      recommendations,
      // §17 UI: 이번 답변이 N인플 실제 데이터를 근거로 했는지 + 어떤 데이터인지 표시용
      dataUsed: ninfle.dataFound,
      dataSources: ninfle.sources,
    });
  } catch (err) {
    console.error('[ai-consultant] OpenAI call failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
