import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from '@/lib/supabase-server';
import { getChatbookUser } from '@/lib/chatbook';
import { chatbookCreateLimiter, getClientIp } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_USER_CHARACTERS = 20; // 사용자당 최대 보유 수
const MAX_INPUT_LENGTH = 400;   // 한 줄 설정 최대 길이

/**
 * GET /api/chatbook/characters
 * - 관리자 제공 캐릭터 (owner_user_id IS NULL)
 * - 현재 사용자가 만든 캐릭터 (owner_user_id = me)
 * platform = 'both' 또는 'ninfl'
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const user = await getChatbookUser(request);

    // 1) 관리자 캐릭터 (is_active = true, owner_user_id IS NULL)
    const adminRes = await supabase
      .from('chatbook_characters')
      .select('id, name, origin, avatar_emoji, accent_color, short_bio, greeting, tags, platform, sort_order, owner_user_id')
      .eq('is_active', true)
      .is('owner_user_id', null)
      .in('platform', ['both', 'ninfl'])
      .order('sort_order', { ascending: true });

    if (adminRes.error) {
      console.error('[chatbook] admin characters failed:', adminRes.error.message);
      return NextResponse.json({ error: '캐릭터 목록을 불러오지 못했습니다.' }, { status: 500 });
    }

    let mine: typeof adminRes.data = [];
    if (user) {
      const mineRes = await supabase
        .from('chatbook_characters')
        .select('id, name, origin, avatar_emoji, accent_color, short_bio, greeting, tags, platform, sort_order, owner_user_id')
        .eq('is_active', true)
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false });
      if (!mineRes.error) mine = mineRes.data || [];
    }

    return NextResponse.json({
      characters: adminRes.data || [],
      mine: mine || [],
    });
  } catch (err) {
    console.error('[chatbook] characters route error:', err);
    return NextResponse.json({ error: '서비스 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/chatbook/characters
 * body: { name, description }
 * - Claude 로 시스템 프롬프트·인사말·태그·이모지·accent_color 자동 생성
 * - 저작권/실존인물/위험 컨셉은 Claude 가 거절하면 400 으로 반환
 */
export async function POST(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();
  const user = await getChatbookUser(request);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const ip = getClientIp(request);
  if (await chatbookCreateLimiter.check(`chatbook_create:${user.id}:${ip}`)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 1시간 후 다시 시도해주세요.' }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  let body: { name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const description = (body.description || '').trim();
  if (!name) return NextResponse.json({ error: '캐릭터 이름을 입력해주세요.' }, { status: 400 });
  if (name.length > 40) return NextResponse.json({ error: '이름은 40자 이내로 입력해주세요.' }, { status: 400 });
  if (!description) return NextResponse.json({ error: '캐릭터 설정을 입력해주세요.' }, { status: 400 });
  if (description.length > MAX_INPUT_LENGTH) {
    return NextResponse.json({ error: `설정은 ${MAX_INPUT_LENGTH}자 이내로 입력해주세요.` }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 보유 캐릭터 수 제한
  const { count: currentCount } = await supabase
    .from('chatbook_characters')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', user.id);

  if ((currentCount ?? 0) >= MAX_USER_CHARACTERS) {
    return NextResponse.json(
      { error: `최대 ${MAX_USER_CHARACTERS}명까지 만들 수 있습니다. 기존 캐릭터를 삭제한 뒤 다시 시도해주세요.` },
      { status: 400 },
    );
  }

  // Claude 로 캐릭터 생성 요청 (JSON 형식으로 받기)
  const generatorPrompt = `사용자가 블로그 콘텐츠 기획을 돕는 AI 캐릭터를 만들려고 합니다. 아래 입력을 바탕으로 캐릭터 정보를 JSON 으로 만들어 주세요.

[사용자 입력]
이름: ${name}
설정 (한 줄): ${description}

[검수 규칙 — 위반 시 "reject" 만 응답]
- 저작권이 살아있는 현대 캐릭터(해리포터·디즈니·마블·귀멸·원피스 등) → reject
- 실존 인물(연예인·정치인·역사 속 실재 인물) → reject
- 성적·폭력적·혐오·자해 조장·범죄 미화 컨셉 → reject
- 실제 의료/법률/투자 조언 전담 페르소나 → reject

[합격 조건]
- 창작 오리지널 캐릭터
- 저작권 만료된 고전 문학 인물 (1930년 이전 사망 저자의 작품)
- 일반 직군·유형 도우미 (예: 베테랑 여행작가, 요리 평론가, 우주비행사 콘셉트)

[응답 형식 — 순수 JSON, 다른 설명/마크다운 금지]
합격:
{
  "verdict": "ok",
  "system_prompt": "(400~800자, 캐릭터 페르소나·말투·배경·사용자(블로거·인플루언서) 도움 방식 명시. 대신 써주지 말고 질문으로 창작자를 이끌라는 규칙 포함)",
  "greeting": "(캐릭터 말투의 첫 인사말 1문장, 50자 이내)",
  "short_bio": "(한 줄 소개, 30자 이내)",
  "avatar_emoji": "(캐릭터를 상징하는 한국 한자 1글자 또는 유니코드 심볼 1개)",
  "accent_color": "(#RRGGBB 형식 헥스 컬러, 캐릭터 분위기에 맞게)",
  "tags": ["태그1","태그2","태그3"]
}

거절:
{
  "verdict": "reject",
  "reason": "(정중한 한국어로 1문장, 50자 이내)"
}`;

  let parsed: {
    verdict: 'ok' | 'reject';
    system_prompt?: string;
    greeting?: string;
    short_bio?: string;
    avatar_emoji?: string;
    accent_color?: string;
    tags?: string[];
    reason?: string;
  };

  try {
    const anthropic = new Anthropic({ apiKey });
    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: generatorPrompt }],
    });
    const block = result.content?.[0];
    const text = block && block.type === 'text' ? block.text.trim() : '';
    if (!text) {
      return NextResponse.json({ error: '캐릭터 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 502 });
    }
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd < 0) {
      return NextResponse.json({ error: '캐릭터 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 502 });
    }
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    console.error('[chatbook] character generate failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: '캐릭터 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 502 });
  }

  if (parsed.verdict === 'reject') {
    return NextResponse.json(
      { error: parsed.reason || '해당 캐릭터는 만들 수 없습니다. 다른 설정을 입력해주세요.' },
      { status: 400 },
    );
  }

  if (!parsed.system_prompt || !parsed.greeting) {
    return NextResponse.json({ error: '캐릭터 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 502 });
  }

  // 아이디 생성: user:{userHash}:{timestamp}
  const shortId = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const insertRes = await supabase
    .from('chatbook_characters')
    .insert({
      id: shortId,
      name: name.slice(0, 40),
      origin: '사용자 생성 캐릭터',
      copyright_status: 'user_created',
      avatar_emoji: (parsed.avatar_emoji || '✎').slice(0, 4),
      accent_color: /^#[0-9A-Fa-f]{6}$/.test(parsed.accent_color || '') ? parsed.accent_color : '#8C6E5D',
      short_bio: (parsed.short_bio || '').slice(0, 80),
      greeting: (parsed.greeting || '').slice(0, 200),
      system_prompt: parsed.system_prompt.slice(0, 4000),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(t => String(t).slice(0, 20)) : [],
      platform: 'ninfl',
      sort_order: 100,
      is_active: true,
      owner_user_id: user.id,
      user_input: description.slice(0, MAX_INPUT_LENGTH),
      is_public: false,
    })
    .select('id, name, avatar_emoji, accent_color, short_bio, greeting, tags, owner_user_id')
    .single();

  if (insertRes.error) {
    console.error('[chatbook] character insert failed:', insertRes.error.message);
    return NextResponse.json({ error: '캐릭터 저장에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ character: insertRes.data });
}

/**
 * DELETE /api/chatbook/characters?id=xxx
 * 본인이 만든 캐릭터만 삭제 가능 (CASCADE 로 세션·메시지 함께 삭제)
 */
export async function DELETE(request: NextRequest) {
  const user = await getChatbookUser(request);
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 });

  const supabase = createServiceClient();

  // 소유권 확인
  const { data: target } = await supabase
    .from('chatbook_characters')
    .select('id, owner_user_id')
    .eq('id', id)
    .maybeSingle();
  if (!target || target.owner_user_id !== user.id) {
    return NextResponse.json({ error: '삭제할 수 없는 캐릭터입니다.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('chatbook_characters')
    .delete()
    .eq('id', id)
    .eq('owner_user_id', user.id);

  if (error) {
    console.error('[chatbook] character delete failed:', error.message);
    return NextResponse.json({ error: '캐릭터 삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
