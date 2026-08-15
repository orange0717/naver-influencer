import { NextRequest, NextResponse } from 'next/server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getOrPersistRepresentativeKeyword, setManualRepresentativeKeyword } from '@/lib/post-keyword-extractor';
import { evaluateCandidates, type CandidateScreenEntry } from '@/lib/candidate-keyword-ranker';
import { buildAutoKeywords } from '@/lib/keyword-normalize';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/representative-keywords?blogId=&postId=&title=[&screen=1][&refine=1]
 * 포스팅 제목(+선택적 본문)을 규칙기반으로 분석해 대표 키워드 1개 + 보조 후보를 추출한다(스펙 #1~#6).
 * 기본은 제목 우선·저비용(네이버 무호출)이라 대량 자동추출에 안전하다.
 *   - refine=1: 제목이 애매할 때 본문 1회 크롤링 보정 허용(개별 재추출 버튼용, 스펙 #5).
 *   - screen=1: 후보들의 실제 검색 성과(evaluateCandidates)로 대표를 재선정(네이버 호출, 옵트인).
 * post_representative_keywords(migration-130)에 (blog_id, post_id) 기준으로 영속화되어,
 * 미노출/키워드순위/AI브리핑·탭 메뉴가 모두 동일한 대표 키워드를 재크롤링 없이 공유한다.
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  const postId = request.nextUrl.searchParams.get('postId')?.trim();
  const title = request.nextUrl.searchParams.get('title') || '';
  const doScreen = request.nextUrl.searchParams.get('screen') === '1';
  const allowBody = request.nextUrl.searchParams.get('refine') === '1';
  // 규칙+본문으로도 애매할 때만 Claude Haiku 1회 보정(하이브리드, 스펙 #2). 결과는 30일 캐시되어 재호출되지 않는다.
  // ai=0으로 명시할 때만 끈다 — 저신뢰 대표 키워드가 미노출/순위/브리핑에 그대로 쓰이는 것을 막기 위함.
  const allowAI = request.nextUrl.searchParams.get('ai') !== '0';

  if (!blogId || !postId) {
    return NextResponse.json({ error: 'blogId와 postId가 필요합니다.' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  try {
    const extraction = await getOrPersistRepresentativeKeyword(blogId, postId, title, { allowBody, allowAI });

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

      // 대표 선정은 규칙기반(keyword-candidates)이 기본. screen=1일 때만 네이버 검색 성과로 재선정한다(옵트인).
      // manual(사용자 지정)은 절대 재선정하지 않는다.
      if (doScreen && extraction.source !== 'manual') {
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
      } else {
        candidateScreen = cachedScreen; // 있으면 표시용으로만 사용(네이버 무호출)
      }
    }

    // 자동 조회 키워드 집합: 대표 1(+변형) + 보조 최대 2(+변형) — 스펙 #4/#5/#14
    const autoKeywords = buildAutoKeywords(representativeKeyword, extraction.candidates, candidateScreen);

    return NextResponse.json({
      keywords: extraction.candidates,
      representativeKeyword,
      candidateScreen,
      autoKeywords,
      source: extraction.source,
      confidence: extraction.confidence,
      cached: extraction.cached,
    });
  } catch (error) {
    console.error('[representative-keywords] error:', error);
    return NextResponse.json({ error: '대표 키워드 추출 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/**
 * PATCH /api/blog/representative-keywords
 * body: { blogId, postId, keyword, title? }
 * 사용자가 직접 수정한 대표 키워드를 저장한다(keyword_source='manual'). 이후 자동 추출이 덮어쓰지 않는다(스펙 #3).
 * 공용 post_representative_keywords 테이블에 저장되어 키워드순위/미노출 화면에도 즉시 반영된다(스펙 #24/#26).
 */
export async function PATCH(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  let body: { blogId?: string; postId?: string; keyword?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const blogId = body.blogId?.trim();
  const postId = body.postId?.trim();
  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';

  if (!blogId || !postId) {
    return NextResponse.json({ error: 'blogId와 postId가 필요합니다.' }, { status: 400 });
  }
  if (!keyword || keyword.length > 40) {
    return NextResponse.json({ error: '대표 키워드는 1~40자여야 합니다.' }, { status: 400 });
  }

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  try {
    // 후보 목록은 유지된다 — 사용자가 고른 대표 키워드만 바뀌고 추출 결과는 계속 보여야 한다.
    const candidates = await setManualRepresentativeKeyword(blogId, postId, keyword, body.title ?? null);
    const autoKeywords = buildAutoKeywords(keyword, candidates, []);
    return NextResponse.json({
      representativeKeyword: keyword,
      keywords: candidates,
      candidateScreen: [],
      autoKeywords,
      source: 'manual',
      confidence: 1,
      cached: true,
    });
  } catch (error) {
    console.error('[representative-keywords][PATCH] error:', error);
    return NextResponse.json({ error: '대표 키워드 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
