import { NextRequest, NextResponse } from 'next/server';
import { aiBriefingLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { checkAiBriefingExposure } from '@/lib/naver-ai-briefing';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 정적 HTML fetch 기반(브라우저 실행 없음) — 재시도/백오프 여유만 확보

// AI 탭 존재 여부 확인 결과 캐시 (Redis 공유, 30분) — 동일 키워드 반복 확인 비용 절감
const CACHE_TTL_SEC = 30 * 60;

/**
 * POST /api/blog/check-ai-briefing
 * keyword로 네이버 검색 → AI 탭 존재 여부(O/X) 확인.
 * 2026-07-04 설계 변경: 더 이상 헤드리스 브라우저(puppeteer-core)를 실행하지 않는다 —
 * 키워드 순위 크롤러(crawl-rankings 등)와 동일하게 정적 HTML fetch + cheerio 파싱만 사용.
 * blogId/postId는 접근 권한 검증 및 상태 저장 컨텍스트용으로만 쓰이며, 판별 로직 자체와는 무관하다.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await aiBriefingLimiter.check(ip)) return rateLimitResponse();

    const body = await request.json();
    const { blogId, keyword } = body;

    if (!blogId || !keyword || !String(keyword).trim()) {
      return NextResponse.json({ error: 'blogId, keyword 필수' }, { status: 400 });
    }

    const denied = await assertBlogResourceAccess(request, String(blogId));
    if (denied) return denied;

    const trimmedKeyword = String(keyword).trim();
    const cacheKey = `aib:kw:${trimmedKeyword}`;
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached !== null) {
      return NextResponse.json({ ...cached, cached: true });
    }

    const result = await checkAiBriefingExposure(trimmedKeyword);

    if (result.error) {
      // 요청 실패는 캐시하지 않음 — 다음 시도가 바로 재시도되도록
      return NextResponse.json(result, { status: 502 });
    }

    await cacheSet(cacheKey, result, CACHE_TTL_SEC);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[check-ai-briefing] 처리 중 예외:', e);
    return NextResponse.json({ error: 'AI 브리핑 확인 중 오류' }, { status: 500 });
  }
}
