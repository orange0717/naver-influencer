import { NextRequest, NextResponse } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { qualityEvaluateLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { AI_DISABLED, aiDisabledResponse } from '@/lib/ai-disabled';
import { analyzePost } from '@/lib/post-structure-analyzer';
import { evaluateNaverAiSearchQuality } from '@/lib/naver-ai-quality-evaluator';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 결과 공유 캐시 TTL(초, 10분) — ai-analyze와 동일. 인메모리 Map은 서버리스에서 공유되지 않아
// 미스가 잦았으므로 kv-cache(Redis, 로컬은 인메모리 폴백)로 교체(동일 글 재평가 Sonnet 재호출 방지).
const CACHE_TTL_SEC = 10 * 60;

/**
 * POST /api/blog/quality-evaluate
 * body: { blogId, postId }
 * 네이버 AI 검색 품질평가 — 10개 항목 + SEO + GEO/AEO 종합 채점 (Claude Sonnet 4.6)
 */
export async function POST(request: NextRequest) {
  if (AI_DISABLED) return aiDisabledResponse();

  const paid = await requirePaidPlan(request);
  if ('error' in paid) return paid.error;

  const ip = getClientIp(request);
  if (await qualityEvaluateLimiter.check(ip)) return rateLimitResponse();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const blogId = typeof body?.blogId === 'string' ? body.blogId.trim() : '';
  const postId = typeof body?.postId === 'string' ? body.postId.trim() : '';
  if (!blogId || !postId) {
    return NextResponse.json({ error: 'blogId와 postId가 필요합니다.' }, { status: 400 });
  }

  const cacheKey = `quality-eval:${blogId}:${postId}`;
  const cached = await cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  const analysis = await analyzePost(blogId, postId);
  if (!analysis.success || analysis.charCount < 200) {
    return NextResponse.json({ error: '본문을 가져오지 못했거나 글이 너무 짧습니다. (200자 미만)' }, { status: 400 });
  }

  try {
    const result = await evaluateNaverAiSearchQuality(
      apiKey,
      analysis.title,
      analysis.fullText.slice(0, 6000),
      {
        charCount: analysis.charCount,
        imageCount: analysis.imageCount,
        originalImageCount: analysis.originalImageCount,
        videoCount: analysis.videoCount,
        linkCount: analysis.linkCount,
        internalLinkCount: analysis.internalLinkCount,
        tableCount: analysis.tableCount,
        listItemCount: analysis.listItemCount,
        quotationCount: analysis.quotationCount,
        headingCount: analysis.headingCount,
        personalPronounCount: analysis.personalPronounCount,
        faqDetected: analysis.faqDetected,
      },
    );

    await cacheSet(cacheKey, result, CACHE_TTL_SEC);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[quality-evaluate] error:', err);
    return NextResponse.json({ error: 'AI 품질평가 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
