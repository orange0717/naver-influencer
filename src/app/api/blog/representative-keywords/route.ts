import { NextRequest, NextResponse } from 'next/server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getOrPersistRepresentativeKeyword } from '@/lib/post-keyword-extractor';
import { evaluateCandidates, type CandidateScreenEntry } from '@/lib/candidate-keyword-ranker';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/representative-keywords?blogId=&postId=&title=
 * 포스팅 제목/본문을 분석해 대표 키워드 후보(3~5개)를 추출하고,
 * 후보 각각의 실제 검색 성과(evaluateCandidates)를 반영해 대표 키워드를 자동 선정한다.
 * post_representative_keywords(migration-130)에 (blog_id, post_id) 기준으로 영속화되어,
 * 미노출/키워드순위/AI브리핑·탭 메뉴가 모두 동일한 대표 키워드를 재크롤링 없이 공유한다.
 * 후보 평가(candidate_screen)는 추출과 같은 TTL(30일)로 캐시되어, 만료 전엔 재조회하지 않는다.
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
    const extraction = await getOrPersistRepresentativeKeyword(blogId, postId, title);

    let representativeKeyword = extraction.representativeKeyword;
    let candidateScreen: CandidateScreenEntry[] = [];

    if (extraction.candidates.length === 1) {
      candidateScreen = [{ keyword: extraction.candidates[0], exposed: false, rank: null }];
    } else if (extraction.candidates.length >= 2) {
      const supabase = createServiceClient();
      const { data: row } = await supabase
        .from('post_representative_keywords')
        .select('candidate_screen')
        .eq('blog_id', blogId)
        .eq('post_id', postId)
        .maybeSingle();
      const cachedScreen = (row?.candidate_screen as CandidateScreenEntry[] | null) || [];
      const screenIsFresh = extraction.cached && cachedScreen.length === extraction.candidates.length;

      if (screenIsFresh) {
        candidateScreen = cachedScreen;
      } else {
        const evalResult = await evaluateCandidates(blogId, postId, title, extraction.candidates);
        representativeKeyword = evalResult.representativeKeyword;
        candidateScreen = evalResult.candidateScreen;
        await supabase.from('post_representative_keywords').update({
          representative_keyword: representativeKeyword,
          candidate_screen: candidateScreen,
        }).eq('blog_id', blogId).eq('post_id', postId);
      }
    }

    return NextResponse.json({
      keywords: extraction.candidates,
      representativeKeyword,
      candidateScreen,
      source: extraction.source,
      cached: extraction.cached,
    });
  } catch (error) {
    console.error('[representative-keywords] error:', error);
    return NextResponse.json({ error: '대표 키워드 추출 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
