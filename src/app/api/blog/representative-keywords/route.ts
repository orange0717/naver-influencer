import { NextRequest, NextResponse } from 'next/server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getOrPersistRepresentativeKeyword } from '@/lib/post-keyword-extractor';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/representative-keywords?blogId=&postId=&title=
 * 포스팅 제목/본문을 분석해 대표 키워드를 추출한다.
 * post_representative_keywords(migration-130)에 (blog_id, post_id) 기준으로 영속화되어,
 * 미노출/키워드순위/AI브리핑·탭 메뉴가 모두 동일한 대표 키워드를 재크롤링 없이 공유한다.
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

  try {
    const result = await getOrPersistRepresentativeKeyword(blogId, postId, title);
    return NextResponse.json({
      keywords: result.candidates,
      representativeKeyword: result.representativeKeyword,
      source: result.source,
      cached: result.cached,
    });
  } catch (error) {
    console.error('[representative-keywords] error:', error);
    return NextResponse.json({ error: '대표 키워드 추출 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
