import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { fetchBlogPostList } from '@/lib/blog-posts-fetcher';
import {
  BULK_RUN_CAP, BATCH_DELAY_MS, CITATION_FRESH_TTL_MS, AI_CITATION_LIMITER, NAVER_SEARCH_DAILY_QUOTA,
  AI_CITATION_SAMPLE_COUNT,
} from '@/lib/ai-citation-batch';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/ai-citation-estimate?blogId=xxx
 * '전체 업데이트' 실행 전 예상 작업량 + 쿼터/한도를 서버가 한 번에 계산해 반환한다(스펙 #9~#12).
 *
 * ⚠️ 정직성:
 *  - AI 인용 확인은 공식 API가 없다 → estApiCalls 는 신규 조회 수 × AI_CITATION_SAMPLE_COUNT.
 *    엔진 1회 호출은 브리핑+탭을 동시에 반환하므로 표면 수만큼 ×2 하지는 않는다(스펙 #9). 다만
 *    §3.7에 따라 한 건을 3회 표본으로 확인하므로 실제 페이지 조회는 그만큼 늘어난다 —
 *    이 숫자를 1로 두면 화면이 실제 작업량보다 적게 안내하게 된다.
 *  - "쿼터"는 공식 네이버 API 쿼터가 아니라 우리 측 안전장치(레이트리밋 + 1회 실행 캡)임을 명시한다(스펙 #12).
 */
export async function GET(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  // AI 인용 확인 화면의 '전체 업데이트' 사전 계산이다 — 같은 기능이므로 같은 등급 가드를 쓴다.
  // 로그인만 확인하던 시절엔 무료 회원이 이 화면의 작업량·쿼터를 그대로 받아 갔다.
  // requireFeature 가 이용 제한 계정(isRestrictedByUserId)까지 함께 판정한다.
  const gate = await requireFeature(request, 'my.naver-mate');
  if (gate.error) return gate.error;

  const blogId = request.nextUrl.searchParams.get('blogId')?.trim();
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const now = Date.now();

  // 병렬 조회: (1) 전체 포스팅 수 (2) 대표키워드 보유 포스팅 (3) AI 인용 확인 기록
  const [postList, repRows, aiRows] = await Promise.all([
    fetchBlogPostList(blogId, 1, 1).catch(() => null), // totalCount만 필요 — 1건만 요청
    supabase
      .from('post_representative_keywords')
      .select('post_id, representative_keyword')
      .eq('blog_id', blogId)
      .then(({ data }) => data ?? []),
    supabase
      .from('ai_briefing_exposures')
      .select('post_id, check_status, checked_at, briefing_status, tab_status')
      .eq('user_id', gate.authUser.userId)
      .eq('blog_id', blogId)
      .then(({ data }) => data ?? []),
  ]);

  const totalPosts = postList?.totalCount ?? 0;

  // 대표키워드 보유 포스팅(distinct post_id, representative_keyword 존재)
  const repPresentPosts = new Set(
    (repRows as Array<{ post_id: string; representative_keyword: string | null }>)
      .filter(r => r.representative_keyword && r.representative_keyword.trim())
      .map(r => r.post_id),
  );
  const repMissing = Math.max(0, totalPosts - repPresentPosts.size);

  // "확인 완료"는 두 표면 모두 인용/미인용까지 확정된 경우만이다(스펙 §7).
  // 확인불가·오류·미확인은 재조회 대상으로 남겨야 하므로 완료로 세지 않는다.
  const settled = (s: string | null) => s === 'CITED' || s === 'NOT_CITED';
  const everCheckedPosts = new Set<string>();
  const freshCheckedPosts = new Set<string>();
  for (const r of aiRows as Array<{
    post_id: string; check_status: string | null; checked_at: string | null;
    briefing_status: string | null; tab_status: string | null;
  }>) {
    if (!r.checked_at) continue;
    // 표면 상태가 없는 레거시 행은 기존 기준(check_status='ok')으로 판단한다.
    const done = (r.briefing_status || r.tab_status)
      ? settled(r.briefing_status) && settled(r.tab_status)
      : r.check_status === 'ok';
    if (!done) continue;
    everCheckedPosts.add(r.post_id);
    if (now - new Date(r.checked_at).getTime() < CITATION_FRESH_TTL_MS) {
      freshCheckedPosts.add(r.post_id);
    }
  }

  const cacheSkipped = freshCheckedPosts.size;                       // 최근 조회 캐시 제외(스펙 #11/#14)
  const everChecked = everCheckedPosts.size;
  const neverChecked = Math.max(0, totalPosts - everChecked);        // 한 번도 확인 안 함
  const staleChecked = Math.max(0, everChecked - cacheSkipped);      // 확인했으나 캐시 만료(재조회 대상)
  const newChecks = Math.max(0, totalPosts - cacheSkipped);          // 실제 신규 조회 = 전체 - 최근확인캐시
  const uncheckedCandidates = neverChecked;                          // 인용 미확인(대표키워드 유무 무관)

  const runsNeeded = Math.ceil(newChecks / BULK_RUN_CAP);

  return NextResponse.json({
    // ── 작업량(스펙 #9/#10/#11) ──
    totalPosts,                       // 전체 포스팅
    repMissing,                       // 대표키워드 미추출
    unchecked: uncheckedCandidates,   // 인용 미확인(한 번도 확인 안 됨)
    staleChecked,                     // 캐시 만료 재조회 대상
    cacheSkipped,                     // 최근 조회 캐시 제외
    newChecks,                        // 실제 신규 조회 대상
    estRepExtractions: repMissing,    // 예상 대표키워드 신규 추출 건수(별도)
    estApiCalls: newChecks * AI_CITATION_SAMPLE_COUNT, // 예상 페이지 조회 = 신규 조회 × 표본 수(브리핑+탭은 1회로 함께 확인)
    samplesPerCheck: AI_CITATION_SAMPLE_COUNT,         // 한 건을 몇 번 조회해 판정하는지(§3.7)

    // ── 1회 실행 계획(스펙 #11/#15) ──
    perRunCap: BULK_RUN_CAP,          // 1회 실행 안전 캡
    runsNeeded,                       // 전체를 채우는 데 필요한 실행 횟수(대략)
    betweenMs: BATCH_DELAY_MS,        // 건 사이 지연

    // ── 쿼터/한도(스펙 #12, 정직 표기) ──
    quota: {
      aiCitation: {
        officialApi: false,
        note: `AI 브리핑·AI 탭 인용은 공식 네이버 API가 없어 헤드리스 브라우저로 실측합니다. AI 답변은 조회할 때마다 달라져 한 건당 ${AI_CITATION_SAMPLE_COUNT}회 조회한 뒤 "n회 중 m회 인용"으로 알려드립니다. 공식 일일 쿼터는 없으며, 네이버 자동화 차단을 피하기 위해 아래 안전장치로 제한합니다.`,
        samplesPerCheck: AI_CITATION_SAMPLE_COUNT,
        limiterLimit: AI_CITATION_LIMITER.limit,       // 10
        limiterWindowSec: AI_CITATION_LIMITER.windowSec, // 300
        perRunCap: BULK_RUN_CAP,
      },
      naverSearchOpenApi: {
        officialApi: true,
        dailyQuota: NAVER_SEARCH_DAILY_QUOTA,          // 25,000/일
        note: '대표키워드 추출·검색량 보조에만 사용하는 공식 검색 OpenAPI의 일일 무료 쿼터입니다(AI 인용 확인과는 별개).',
      },
    },
  });
}
