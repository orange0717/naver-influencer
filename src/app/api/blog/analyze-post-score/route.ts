import { NextRequest, NextResponse } from 'next/server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { analyzePost } from '@/lib/post-structure-analyzer';
import { extractRepresentativeKeywords } from '@/lib/post-keyword-extractor';
import { computeContentScore } from '@/lib/post-content-scorer';
import { blogAnalyzeLimiter, dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// 점수 결과 캐시 (10분, 최대 200개 엔트리) — /api/blog/analyze와 동일 패턴
const MAX_CACHE_SIZE = 200;
const cache = new Map<string, { data: unknown; expires: number }>();
const CACHE_TTL = 10 * 60 * 1000;

/**
 * POST /api/blog/analyze-post-score
 * body: { blogId, postId, title, date, viewCount }
 * 포스트 구조 분석(analyzePost) + 대표키워드(저장된 것 우선, 없으면 즉석 추출) + 점수 계산 →
 * post_ai_scores upsert. 페이지 로드 시 자동 호출 금지, "분석하기" 버튼 클릭 시에만 호출한다.
 */
export async function POST(request: NextRequest) {
  if (await blogAnalyzeLimiter.check(getClientIp(request))) return rateLimitResponse();

  const body = await request.json().catch(() => null);
  const blogId = typeof body?.blogId === 'string' ? body.blogId.trim() : '';
  const postId = typeof body?.postId === 'string' ? body.postId.trim() : '';
  const title = typeof body?.title === 'string' ? body.title : '';
  const date = typeof body?.date === 'string' ? body.date : null;
  const viewCount = typeof body?.viewCount === 'number' ? body.viewCount : null;

  if (!blogId || !postId) {
    return NextResponse.json({ error: 'blogId, postId가 필요합니다.' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cacheKey = `score-${blogId}-${postId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  const analysis = await analyzePost(blogId, postId);
  if (!analysis.success) {
    return NextResponse.json({ error: '포스팅 분석에 실패했습니다.' }, { status: 502 });
  }

  const supabase = createServiceClient();

  // 대표키워드: 저장된 할당 키워드가 있으면 그걸 우선 사용, 없으면 즉석 추출
  let representativeKeyword: string | null = null;
  const { data: savedKeywords } = await supabase
    .from('ai_briefing_exposures')
    .select('keyword')
    .eq('user_id', auth.userId)
    .eq('post_id', postId)
    .limit(1);
  if (savedKeywords && savedKeywords.length > 0) {
    representativeKeyword = savedKeywords[0].keyword;
  } else {
    const extracted = await extractRepresentativeKeywords(blogId, postId, title);
    representativeKeyword = extracted.keywords[0] ?? null;
  }

  const scoreResult = computeContentScore(analysis, representativeKeyword, date);

  const { error: upsertErr } = await supabase
    .from('post_ai_scores')
    .upsert({
      user_id: auth.userId,
      blog_id: blogId,
      post_id: postId,
      title,
      view_count: viewCount,
      published_at: date,
      representative_keyword: representativeKeyword,
      ai_score: scoreResult.aiScore,
      seo_score: scoreResult.seoScore,
      geo_score: scoreResult.geoScore,
      aeo_score: scoreResult.aeoScore,
      sub_scores: scoreResult.subScores,
      cause_tags: scoreResult.causeTags,
      computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,post_id' });

  if (upsertErr) {
    return NextResponse.json({ error: '점수 저장에 실패했습니다.' }, { status: 500 });
  }

  const responseData = {
    success: true,
    postId,
    representativeKeyword,
    ...scoreResult,
  };

  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(cacheKey, { data: responseData, expires: Date.now() + CACHE_TTL });

  return NextResponse.json(responseData);
}

/**
 * GET /api/blog/analyze-post-score?blogId=xxx
 * 저장된 점수를 일괄 조회(크롤링 없음, KPI 평균/테이블 표시용).
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('post_ai_scores')
    .select('post_id, title, view_count, published_at, representative_keyword, ai_score, seo_score, geo_score, aeo_score, sub_scores, cause_tags, computed_at')
    .eq('user_id', auth.userId)
    .eq('blog_id', blogId);

  if (error) return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });

  return NextResponse.json({ scores: data ?? [] });
}
