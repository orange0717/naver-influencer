import { NextRequest, NextResponse } from 'next/server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { extractRepresentativeKeywords } from '@/lib/post-keyword-extractor';

export const dynamic = 'force-dynamic';

// 동일 포스트 재조회 방지용 24시간 메모리 캐시 (성능 개선: 동일 키워드 캐싱 / 중복 API 호출 제거)
const MAX_CACHE = 500;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const cache = new Map<string, { data: unknown; expires: number }>();

function setCache(key: string, data: unknown) {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expires < now) cache.delete(k);
  }
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expires: now + CACHE_TTL });
}

/**
 * GET /api/blog/representative-keywords?blogId=&postId=&title=
 * 포스팅 제목/본문을 분석해 대표 키워드 1~5개를 추출한다(신규 기능).
 * DB에 아무것도 저장하지 않는다 — 결과는 클라이언트가 기존 "타겟 키워드" 입력칸에 채워
 * 사용자가 확인 후 기존 /api/my/ai-briefing-state PUT으로 저장한다.
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  const postId = request.nextUrl.searchParams.get('postId')?.trim();
  const title = request.nextUrl.searchParams.get('title') || '';

  if (!blogId || !postId) {
    return NextResponse.json({ error: 'blogId와 postId가 필요합니다.' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const cacheKey = `repkw:${blogId}:${postId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const result = await extractRepresentativeKeywords(blogId, postId, title);
    setCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[representative-keywords] error:', error);
    return NextResponse.json({ error: '대표 키워드 추출 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
