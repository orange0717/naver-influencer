import { NextRequest } from 'next/server';
import * as cheerio from 'cheerio';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { requirePaidPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// 결과 캐시 (10분, 최대 100개)
const MAX_CACHE = 100;
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map<string, { data: string; expires: number }>();

/**
 * 블로그 본문에서 핵심 문장 추출 (표절검사용)
 */
function extractKeySentences(text: string): string[] {
  // 문장 분리 (한국어 마침표/물음표/느낌표 기준)
  const sentences = text
    .split(/(?<=[.!?。])\s+|(?<=다\.)\s+|(?<=요\.)\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 15 && s.length <= 200);

  if (sentences.length === 0) return [];

  // 균등 간격으로 5~8개 문장 선택 (앞, 중간, 뒤에서 골고루)
  const maxSentences = Math.min(8, sentences.length);
  const step = Math.max(1, Math.floor(sentences.length / maxSentences));
  const selected: string[] = [];

  for (let i = 0; i < sentences.length && selected.length < maxSentences; i += step) {
    const sentence = sentences[i];
    // 너무 일반적인 문장 제외 (인사, 광고 등)
    if (/^(안녕|감사|구독|좋아요|댓글|공유|출처|저작권|ⓒ|copyright)/i.test(sentence)) continue;
    // 특수문자 과다 제외
    if ((sentence.match(/[^가-힣a-zA-Z0-9\s.,!?]/g) || []).length > sentence.length * 0.3) continue;
    selected.push(sentence);
  }

  return selected;
}

/**
 * 네이버 검색 API로 문장 검색하여 유사 결과 확인
 */
async function searchSentence(sentence: string, blogId: string): Promise<{
  sentence: string;
  matches: { title: string; link: string; bloggerName: string; description: string }[];
  isDuplicate: boolean;
}> {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { sentence, matches: [], isDuplicate: false };
  }

  // 검색어: 문장에서 핵심 부분 (30~60자)
  const query = sentence.length > 60 ? sentence.substring(0, 60) : sentence;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);

  try {
    const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(`"${query}"`)}&display=10&sort=sim`;
    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: ac.signal,
    });

    clearTimeout(t);

    if (!res.ok) return { sentence, matches: [], isDuplicate: false };

    const data = await res.json();
    const items = (data.items || []) as {
      title: string;
      link: string;
      bloggername: string;
      description: string;
    }[];

    // 본인 블로그 제외
    const blogIdLower = blogId.toLowerCase();
    const otherMatches = items
      .filter(item => {
        const link = (item.link || '').toLowerCase();
        return !link.includes(`/${blogIdLower}/`) && !link.includes(`/${blogIdLower}?`) && !link.endsWith(`/${blogIdLower}`);
      })
      .slice(0, 3)
      .map(item => ({
        title: (item.title || '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
        link: item.link || '',
        bloggerName: item.bloggername || '',
        description: (item.description || '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').substring(0, 150),
      }));

    return {
      sentence,
      matches: otherMatches,
      isDuplicate: otherMatches.length > 0,
    };
  } catch {
    clearTimeout(t);
    return { sentence, matches: [], isDuplicate: false };
  }
}

/**
 * 블로그 본문 텍스트 추출
 */
async function extractPostText(blogId: string, logNo: string): Promise<string> {
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
  return $content.text().replace(/\s+/g, ' ').trim();
}

/**
 * POST /api/blog/plagiarism-check
 * body: { blogId, logNo }
 * SSE 스트리밍 응답
 */
export async function POST(request: NextRequest) {
  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

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
  const cacheKey = `plag-${blogId}-${logNo}`;
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
        const text = await extractPostText(blogId, logNo);

        if (text.replace(/\s/g, '').length < 100) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: '글이 너무 짧아 표절검사가 어렵습니다. (100자 미만)' })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
          return;
        }

        // 2) 핵심 문장 추출
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', data: '핵심 문장 추출 중...' })}\n\n`));
        const sentences = extractKeySentences(text);

        if (sentences.length === 0) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: '분석 가능한 문장을 찾을 수 없습니다.' })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
          return;
        }

        // 3) 각 문장 검색 (순차, rate limit 방지)
        const results: {
          sentence: string;
          matches: { title: string; link: string; bloggerName: string; description: string }[];
          isDuplicate: boolean;
        }[] = [];

        for (let i = 0; i < sentences.length; i++) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'progress',
            data: { current: i + 1, total: sentences.length, sentence: sentences[i].substring(0, 30) + '...' },
          })}\n\n`));

          const result = await searchSentence(sentences[i], blogId);
          results.push(result);

          // 검색 간 딜레이 (네이버 API rate limit 방지)
          if (i < sentences.length - 1) {
            await new Promise(r => setTimeout(r, 300));
          }
        }

        // 4) 결과 요약
        const duplicateCount = results.filter(r => r.isDuplicate).length;
        const totalChecked = results.length;
        const plagiarismRate = totalChecked > 0 ? Math.round(duplicateCount / totalChecked * 100) : 0;

        const finalResult = {
          totalChecked,
          duplicateCount,
          plagiarismRate,
          originalRate: 100 - plagiarismRate,
          sentences: results,
        };

        // 캐시 저장
        if (cache.size >= MAX_CACHE) {
          const firstKey = cache.keys().next().value;
          if (firstKey) cache.delete(firstKey);
        }
        cache.set(cacheKey, { data: JSON.stringify(finalResult), expires: Date.now() + CACHE_TTL });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'result', data: finalResult })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
      } catch (err) {
        console.error('[plagiarism-check] error:', err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: '표절검사 중 오류가 발생했습니다.' })}\n\n`));
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
