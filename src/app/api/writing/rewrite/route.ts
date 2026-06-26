import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireInfluencerPlan } from '@/lib/admin';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TEXT_LENGTH = 3_000;

type Style = 'natural' | 'formal' | 'concise';

const STYLE_GUIDES: Record<Style, string> = {
  natural: '자연스럽고 친근한 구어체로, 읽기 편하게',
  formal: '격식 있고 전문적인 문어체로, 공식 문서에 어울리게',
  concise: '핵심만 남겨 간결하게, 불필요한 표현을 모두 제거하고',
};

function buildPrompt(text: string, style: Style): string {
  const guide = STYLE_GUIDES[style];
  return `당신은 한국어 전문 교열·윤문 전문가입니다.

아래 절차를 순서대로 수행하세요.

**1단계 — 교정 (맞춤법·띄어쓰기)**
- 국립국어원 표준 맞춤법, 행정안전부 공문서 기준 적용
- 표준국어대사전 등재어는 절대 수정하지 않음
- 사이시옷, 외래어 표기, 안/않, 의존명사 띄어쓰기 등 교정

**2단계 — 교열 (문장 오류 수정)**
- 주술 호응, 시제 일관성, 이중 피동·사동 제거
- 번역투(영어식·일본식 표현), 의미 중복 표현 순화

**3단계 — 리라이팅 (새로운 표현으로 재작성)**
- 위 교정·교열을 반영하여 ${guide} 다시 작성
- 원문의 의미와 핵심 내용은 100% 유지
- 단어·문장 구조·어순을 원문과 다르게 재구성
- 원문에서 사용한 표현을 그대로 쓰지 않도록 할 것

**출력 형식** (JSON만 출력, 다른 텍스트 없음):
{
  "correctionNotes": ["교정 항목 1", "교정 항목 2"],
  "result": "리라이팅된 최종 텍스트"
}

교정·교열 항목이 없으면 correctionNotes는 빈 배열로.

---
원문:
${text}`;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  let body: { text?: string; style?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const text = (body.text || '').trim();
  if (!text) return NextResponse.json({ error: '리라이팅할 글을 입력해주세요.' }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `최대 ${MAX_TEXT_LENGTH.toLocaleString()}자까지 처리할 수 있습니다.` },
      { status: 400 },
    );
  }

  const style: Style =
    body.style === 'formal' ? 'formal' : body.style === 'concise' ? 'concise' : 'natural';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI 서비스를 사용할 수 없습니다.' }, { status: 503 });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{ role: 'user', content: buildPrompt(text, style) }],
    });

    const raw = message.content[0]?.type === 'text' ? message.content[0].text : '';

    // JSON 파싱 시도
    let parsed: { correctionNotes?: string[]; result?: string } = {};
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // 파싱 실패 시 전체를 result로
      parsed = { correctionNotes: [], result: raw };
    }

    return NextResponse.json({
      result: parsed.result || raw,
      correctionNotes: Array.isArray(parsed.correctionNotes) ? parsed.correctionNotes : [],
      style,
    });
  } catch (err) {
    console.error('[rewrite] error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: '리라이팅 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
