import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 결과 캐시 (10분, 최대 100개)
const MAX_CACHE = 100;
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { data: string; expires: number }>();

/**
 * 네이버 블로그 글에서 본문 텍스트를 추출 (최대 3000자)
 */
async function extractPostText(blogId: string, logNo: string): Promise<{ title: string; text: string; charCount: number }> {
  const url = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${logNo}&directAccess=false`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
      'Referer': `https://blog.naver.com/${blogId}`,
    },
  });

  if (!res.ok) throw new Error('본문을 가져올 수 없습니다.');

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('meta[property="og:title"]').attr('content')?.trim()
    || $('.se-title-text').text().trim()
    || $('title').text().replace(/\s*[-:]\s*네이버\s*블로그.*/, '').trim()
    || '';

  // 본문 영역 찾기
  const contentSelectors = ['.se-main-container', '#postViewArea', '.post-view', '#viewTypeSelector'];
  let $content: cheerio.Cheerio<any> | null = null;
  for (const sel of contentSelectors) {
    const found = $(sel);
    if (found.length > 0 && found.text().trim().length > 10) {
      $content = found;
      break;
    }
  }
  if (!$content) $content = $('body');

  $content.find('script, style, noscript').remove();
  const fullText = $content.text().replace(/\s+/g, ' ').trim();

  return {
    title,
    text: fullText.substring(0, 3000),
    charCount: fullText.replace(/\s/g, '').length,
  };
}

/**
 * POST /api/blog/ai-analyze
 * body: { blogId, logNo }
 * SSE 스트리밍 응답
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
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

  // 캐시 확인
  const cacheKey = `${blogId}-${logNo}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return Response.json(JSON.parse(cached.data));
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

        const anthropic = new Anthropic({ apiKey });
        const message = await anthropic.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1200,
          system: `당신은 네이버 블로그 글 분석 전문가입니다.
주어진 블로그 글을 분석하여 아래 형식의 JSON을 반환하세요.

{
  "aiProbability": (0~100 정수, AI 작성 가능성 퍼센트),
  "aiReasoning": "(판단 근거 3~5줄 설명)",
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

AI 판단 기준:
- 반복적이고 균일한 문장 구조 = AI 가능성 높음
- 구체적 경험/감정 표현, 1인칭 서술 = 사람 가능성 높음
- 접속어/전환어 과다 사용 = AI 가능성 높음
- 맞춤법 실수, 구어체, 신조어 = 사람 가능성 높음
- 원본 사진/지도/동영상 포함 = 사람 가능성 높음 (단, 텍스트만으로 판단)

규칙:
- 한국어로 답변
- JSON만 반환 (코드블록, 마크다운 없이 순수 JSON)
- 이모지 사용 금지
- keywords 최대 8개
- keySentences 최대 5개`,
          messages: [{
            role: 'user',
            content: `제목: ${title}\n\n본문 (${charCount}자):\n${text}`,
          }],
        });

        // 응답 파싱
        const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
        let result;
        try {
          result = JSON.parse(rawText);
        } catch {
          // JSON 파싱 실패 시 코드블록 안의 JSON 추출 시도
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('AI 응답 파싱 실패');
          }
        }

        result.textLength = charCount;

        // 캐시 저장
        if (cache.size >= MAX_CACHE) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
        cache.set(cacheKey, { data: JSON.stringify(result), expires: Date.now() + CACHE_TTL });

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
