import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { isRestrictedByUserId, hasActivePaidPlanByUserId } from '@/lib/admin';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { getOpenAiClient, OPENAI_MODEL_MINI } from '@/lib/openai-client';
import { chatbookMessageLimiter, getClientIp } from '@/lib/rate-limit';
import { requireFeatureAccess } from '@/lib/feature-gate';
import { AI_CONSULTANT_CATALOG, getFeatureById } from '@/lib/ai-consultant-catalog';
import { createServiceClient } from '@/lib/supabase-server';

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

const SYSTEM_PROMPT = `당신은 N인플(네이버 인플루언서·블로그 마케팅 분석 서비스)의 AI 컨설턴트입니다.
사용자가 마케팅/블로그/콘텐츠/검색노출에 대한 고민을 자유롭게 입력하면 아래 두 가지를 만들어 주세요.

1) answer — 질문에 실제로 도움이 되는 답변.
   - 존댓말, 친절하고 실용적으로. 핵심부터 말하고 필요하면 번호목록·줄바꿈으로 정리하세요.
   - 네이버 블로그/인플루언서 맥락에 맞게 구체적으로. 200~600자 내외.
   - 확실치 않은 통계·수치를 지어내지 말고, 일반 원칙과 실행 방법 위주로 안내하세요.
   - 마케팅/콘텐츠와 무관한 잡담·코드 요청 등이면 정중히 "마케팅·블로그·콘텐츠 관련 고민을 도와드린다"고 안내하세요.

2) recommendations — 답변과 관련해 N인플에 이미 있는 기능 중 도움이 될 것을 관련도 높은 순으로 최대 5개.
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

  let openai;
  try {
    openai = getOpenAiClient();
  } catch {
    return NextResponse.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL_MINI,
      max_tokens: 1200,
      temperature: 0.5,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
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

    return NextResponse.json({ id: savedId, interpretation, recommendations });
  } catch (err) {
    console.error('[ai-consultant] OpenAI call failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '응답을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
