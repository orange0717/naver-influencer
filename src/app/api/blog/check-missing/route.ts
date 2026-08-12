import { NextRequest, NextResponse } from 'next/server';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { CACHE_TTL_SEC } from '@/lib/keyword-rank-check';
import { computePostExposure, recordPostExposure, type PostExposureResult } from '@/lib/post-exposure-check';

export const dynamic = 'force-dynamic';

// 동일 인스턴스 내 동시 요청 공유: 같은 cacheKey를 여러 사용자가 동시에 조회해도
// 진행 중인 크롤링 하나만 수행하고 결과를 나눠 갖는다 (네이버 요청 중복 방지)
const inFlight = new Map<string, Promise<PostExposureResult>>();

// displayName 캐시 (30분, 프로세스 로컬 — DB 조회가 이미 빠름)
const nameCache = new Map<string, { name: string; expires: number }>();
const NAME_CACHE_TTL = 30 * 60 * 1000;

/** 서버에서 blogId로 displayName(blog_name) 직접 조회 */
async function getDisplayName(blogId: string): Promise<string> {
  const cached = nameCache.get(blogId);
  if (cached && cached.expires > Date.now()) return cached.name;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('blog_scores')
      .select('blog_name')
      .eq('blog_id', blogId)
      .single();
    const name = data?.blog_name || '';
    nameCache.set(blogId, { name, expires: Date.now() + NAME_CACHE_TTL });
    if (nameCache.size > 500) {
      const now = Date.now();
      for (const [k, v] of nameCache) { if (v.expires < now) nameCache.delete(k); }
    }
    return name;
  } catch {
    return '';
  }
}

/**
 * POST /api/blog/check-missing
 * 포스팅의 통합검색 + 블로그탭 (+요청 시 인플루언서탭) 노출/미노출 여부 확인.
 * 판정·저장 로직은 @/lib/post-exposure-check 로 추출되어 크론(crawl-post-exposure)과 공유한다.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await blogAnalyzeLimiter.check(ip)) return rateLimitResponse();

    const body = await request.json();
    const { blogId, postTitle, postId, keyword, force, checkInfluencer } = body;

    if (!blogId || (!postTitle && !keyword)) {
      return NextResponse.json({ error: 'blogId, postTitle 또는 keyword 필수' }, { status: 400 });
    }

    const denied = await assertBlogResourceAccess(request, String(blogId));
    if (denied) return denied;

    // 캐시 확인 (Redis 공유 — 다른 인스턴스/기기가 확인한 결과도 재사용). force=true면 건너뛰고 강제 재조회.
    const cacheKey = keyword
      ? `rank:${blogId}:${postId || ''}:kw:${keyword.trim()}`
      : `rank:${blogId}:${postId || postTitle.slice(0, 30)}`;
    if (!force) {
      const cached = await cacheGet<PostExposureResult>(cacheKey);
      if (cached !== null) {
        return NextResponse.json({ ...cached, cached: true });
      }
    }

    // 같은 키에 대해 이미 진행 중인 조회가 있으면 그 결과를 공유 (동시 접속 사용자 간 중복 크롤링 방지)
    let promise = inFlight.get(cacheKey);
    if (!promise) {
      promise = (async (): Promise<PostExposureResult> => {
        const displayName = await getDisplayName(blogId);
        const result = await computePostExposure({
          blogId,
          postTitle,
          postId,
          keyword,
          checkInfluencer,
          displayName,
        });

        // 오류 응답은 캐시하지 않는다(다음 시도에서 정상 재확인되도록). 정상 결과만 공유 캐시에 저장.
        if (result.status !== 'error') {
          await cacheSet(cacheKey, result, CACHE_TTL_SEC);
        }

        // 검사 결과 즉시 DB 반영. ⚠️ 일시적 오류(status='error')는 저장하지 않는다 —
        // 이전의 정상 노출/미노출 기록을 null 로 덮어쓰지 않기 위함(다음 재검사 때 정상 확인되면 그때 기록).
        if (postId && result.status !== 'error') {
          try {
            const supabase = createServiceClient();
            await recordPostExposure(blogId, String(postId), postTitle || null, result, supabase);
          } catch (err) {
            console.error(`[check-missing] post_missing_checks 저장 실패 blogId=${blogId} postId=${postId}:`, err);
          }
        }

        return result;
      })();
      inFlight.set(cacheKey, promise);
      promise.finally(() => inFlight.delete(cacheKey));
    }

    const result = await promise;
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    console.error('[check-missing] 요청 처리 중 예외:', err);
    return NextResponse.json({ error: '누락 확인 중 오류' }, { status: 500 });
  }
}
