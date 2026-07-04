import { NextRequest, NextResponse } from 'next/server';
import { aiBriefingLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { checkAiBriefingExposure } from '@/lib/naver-ai-briefing';

export const dynamic = 'force-dynamic';
export const maxDuration = 90; // AI 탭 스트리밍 완료까지 폴링 대기(최대 20초) + 브라우저 콜드스타트 여유

// AI 브리핑 확인 결과 캐시 (Redis 공유, 30분) — 헤드리스 브라우저 재실행 비용이 크므로 짧은 재확인은 캐시로 흡수
const CACHE_TTL_SEC = 30 * 60;

/**
 * POST /api/blog/check-ai-briefing
 * keyword로 네이버 검색 → AI 브리핑 노출 여부 + 내 포스팅의 출처 인덱스 확인
 * check-missing(통합검색/블로그탭)과 달리 실제 헤드리스 브라우저(puppeteer-core)를 실행하므로
 * 호출 비용이 훨씬 크다 — rate limit을 별도로 낮게 잡고(aiBriefingLimiter), 캐시 우선 확인.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await aiBriefingLimiter.check(ip)) return rateLimitResponse();

    const body = await request.json();
    const { blogId, postId, keyword } = body;

    if (!blogId || !postId || !keyword || !String(keyword).trim()) {
      return NextResponse.json({ error: 'blogId, postId, keyword 필수' }, { status: 400 });
    }

    const denied = await assertBlogResourceAccess(request, String(blogId));
    if (denied) return denied;

    const trimmedKeyword = String(keyword).trim();
    const cacheKey = `aib:${blogId}:${postId}:kw:${trimmedKeyword}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached !== null) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const result = await checkAiBriefingExposure(trimmedKeyword, String(blogId), String(postId));

    if (result.error) {
      // 브라우저 실행 실패는 캐시하지 않음 — 다음 시도가 바로 재시도되도록
      return NextResponse.json(result, { status: 502 });
    }

    await cacheSet(cacheKey, result, CACHE_TTL_SEC);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'AI 브리핑 확인 중 오류' }, { status: 500 });
  }
}
