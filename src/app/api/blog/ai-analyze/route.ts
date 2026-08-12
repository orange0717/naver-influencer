import { NextRequest } from 'next/server';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { requirePaidPlan } from '@/lib/admin';
import { extractPostText } from '@/lib/blog-post-content';
import { getAnthropicClient, CLAUDE_MODEL_HAIKU, parseJsonObjectFromClaudeText, UNTRUSTED_DATA_NOTICE, wrapUntrusted } from '@/lib/claude-client';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// 결과 공유 캐시 TTL(초, 10분). 인메모리 Map은 서버리스 인스턴스 간 공유되지 않아 미스가 잦았다
// → kv-cache(Redis, 로컬은 인메모리 폴백)로 교체해 동일 글 재분석(Haiku 재호출)을 막는다.
const CACHE_TTL_SEC = 10 * 60;

/**
 * POST /api/blog/ai-analyze
 * body: { blogId, logNo }
 * SSE 스트리밍 응답
 */
export async function POST(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  let anthropic;
  try {
    anthropic = getAnthropicClient();
  } catch {
    return Response.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  let body: { blogId?: string; logNo?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { blogId, logNo } = body;
  if (!blogId || !logNo) {
    return Response.json({ error: 'blogId와 logNo가 필요합니다.' }, { status: 400 });
  }

  // 공유 캐시 확인
  const cacheKey = `ai-analyze:${blogId}:${logNo}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) {
    return Response.json(cached);
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        // 1) 본문 추출
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', data: '본문 가져오는 중...' })}\n\n`));
        const { title, text, charCount } = await extractPostText(blogId, logNo);

        if (charCount < 100) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: '글이 너무 짧아 분석이 어렵습니다. (100자 미만)' })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
          return;
        }

        // 2) Claude 분석
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', data: 'AI 분석 중...' })}\n\n`));

        const message = await anthropic.messages.create({
          model: CLAUDE_MODEL_HAIKU,
          max_tokens: 1500,
          system: `당신은 AI 생성 텍스트 탐지 전문가입니다. 네이버 블로그 글을 분석하여 AI 작성 여부를 판별합니다.

중요: 블로그 글은 정보 전달 목적이므로 1인칭이 적고, 소제목/사진/지도가 있는 것은 정상입니다. 이런 요소만으로 AI 여부를 판단하지 마세요.

아래 형식의 JSON을 반환하세요:
{
  "aiProbability": (0~100 정수),
  "aiReasoning": "(판단 근거 3~5줄)",
  "keywords": [
    { "keyword": "키워드", "relevance": "high|medium|low", "searchable": true|false }
  ],
  "keySentences": [
    { "sentence": "핵심 문장", "type": "topic|evidence|conclusion|appeal", "importance": 1~5 }
  ],
  "writingStyle": {
    "tone": "정보전달형|경험공유형|광고홍보형|일상형",
    "readability": "easy|medium|hard",
    "originality": 1~10
  }
}

AI 작성 텍스트의 특징 (높은 확률):
- 문장 길이가 전체적으로 균일하고 변화가 없음
- "~입니다", "~합니다" 등 동일한 문말 어미 반복
- "따라서", "이처럼", "결론적으로", "특히", "또한" 등 접속어/전환어 과다 사용
- 구체적 장소명/날짜/가격 등 체험 디테일 없이 일반적 설명만 나열
- 모든 문단이 비슷한 구조로 반복 (도입-설명-마무리 패턴)
- 감정 표현이 표면적이고 추상적 ("정말 좋았습니다", "추천드립니다")
- 틀린 맞춤법이 전혀 없고 지나치게 깔끔한 문체
- 주관적 판단이나 개인적 의견 없이 백과사전식 서술

사람 작성 텍스트의 특징 (낮은 확률):
- 문장 길이 변화가 자연스러움 (짧은 문장, 긴 문장 섞임)
- 구어체, 비격식 표현 (ㅎㅎ, ㅋㅋ, ~요, !!, ??)
- 구체적 체험 디테일 (실제 방문 날짜, 가격, 위치, 개인 에피소드)
- 맞춤법 실수, 오타, 띄어쓰기 오류
- 글 흐름이 완벽하지 않고 자연스러운 탈선이 있음
- 사진 설명 시 "이건 제가 직접~", "여기서~" 등 현장감 있는 표현
- 독자에게 직접 말하는 듯한 어조 ("여러분", "꼭 가보세요")
- 신조어, 줄임말, 유행어 사용

판단 시 주의:
- 블로그 글은 원래 소제목, 사진 설명, 정보 정리가 많으므로 구조적 글쓰기 자체는 AI 증거가 아님
- 1인칭이 적다고 AI가 아님 (정보 전달형 블로그는 원래 1인칭이 적음)
- AI 확률 30% 이하: 거의 확실히 사람이 쓴 글
- AI 확률 30~60%: 판단 어려움 (AI 보조 사용 가능성)
- AI 확률 60% 이상: AI가 쓴 것으로 강하게 의심

규칙:
- 한국어로 답변
- JSON만 반환 (코드블록, 마크다운 없이 순수 JSON)
- keywords 최대 8개, keySentences 최대 5개

${UNTRUSTED_DATA_NOTICE}`,
          messages: [{
            role: 'user',
            content: `분석 대상 블로그 글:\n${wrapUntrusted(`제목: ${title}\n\n본문 (${charCount}자):\n${text}`, 'naver_blog')}`,
          }],
        });

        // 응답 파싱
        const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
        const result = parseJsonObjectFromClaudeText<Record<string, unknown>>(rawText);

        result.textLength = charCount;

        // 공유 캐시 저장
        await cacheSet(cacheKey, result, CACHE_TTL_SEC);

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err) {
        console.error('[ai-analyze] error:', err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: '분석 중 오류가 발생했습니다.' })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
