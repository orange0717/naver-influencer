import { NextRequest, NextResponse } from 'next/server';
import { blogAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { createServiceClient } from '@/lib/supabase-server';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { cacheGet, cacheSet } from '@/lib/kv-cache';
import { CACHE_TTL_SEC } from '@/lib/keyword-rank-check';
import { computePostExposure, recordPostExposure, type PostExposureResult } from '@/lib/post-exposure-check';
import { getOrPersistRepresentativeKeyword } from '@/lib/post-keyword-extractor';
import { getAuthUser } from '@/lib/auth';
import { requireFeature } from '@/lib/guards/requireFeature';
import { chargeCredit, grantCredit, insufficientCreditBody } from '@/lib/credits';
import { CREDITS_ENABLED } from '@/lib/credit-gate';
import { EXPOSURE_FREE_DAYS, EXPOSURE_RECHECK_FRESH_MS, EXPOSURE_CREDIT_FEATURE, getExposureCreditPerPost } from '@/lib/exposure-policy';
import { fetchAllBlogPosts } from '@/lib/blog-posts-fetcher';
import { parseNaverPostDate } from '@/lib/naver-date';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * §1·§9·§20 서버 기준 발행일을 조회한다(클라이언트가 보낸 날짜는 과금 결정에 신뢰하지 않음).
 * 소스는 fetchAllBlogPosts — 페이지 단위 KV 캐시라 이미 목록을 불러온 뒤엔 추가 스크랩 없이 재사용된다.
 * 찾지 못하거나 파싱 불가면 null(과금 판단은 fail-open: 과금하지 않고 통과).
 */
async function getPostPublishedAt(blogId: string, postId: string): Promise<Date | null> {
  try {
    const posts = await fetchAllBlogPosts(blogId);
    const found = posts.find(p => String(p.id) === String(postId));
    if (!found) return null;
    const t = parseNaverPostDate(found.date);
    return t == null ? null : new Date(t);
  } catch {
    return null;
  }
}

/**
 * §9·§12·§20 "30일 이전 글" 실행시점 멱등 과금 게이트.
 * 실제 네이버 검사가 발생하기 직전에만 호출된다(캐시 히트는 과금하지 않음 — 신규 조회가 아니므로).
 * - 30일 이내(무료 구간) 글: 통과(과금 없음).
 * - 30일 이전 글: 비회원 → 401(MEMBER_ONLY). 회원 → 1건당 크레딧을 (blogId:postId, 20h 버킷) 멱등 차감.
 *   같은 글을 20h 안에 여러 경로(기간버튼 배치/개별/선택 재검사)로 눌러도 한 번만 과금된다(§9 이중차감 방지).
 * 반환: denied=즉시 반환할 에러 응답, charged=실제로 차감된 내역(검사 실패 시 환불용, 차감 없으면 null).
 */
interface ChargeGateResult {
  denied: NextResponse | null;
  /** 이번 요청에서 실제로 빠져나간 크레딧. 멱등 히트(charged=0)면 null — 환불할 게 없다. */
  charged: { userId: string; amount: number; referenceId: string } | null;
}

async function enforceExtendedLookupCharge(request: NextRequest, blogId: string, postId: string | undefined): Promise<ChargeGateResult> {
  const pass: ChargeGateResult = { denied: null, charged: null };
  if (!postId) return pass; // 글 식별 불가 시 과금 판단 안 함(확장 조회는 항상 postId 동반)
  const publishedAt = await getPostPublishedAt(blogId, String(postId));
  if (!publishedAt) return pass; // 발행일 미확인 → fail-open(과금하지 않음)
  const isOlder = (Date.now() - publishedAt.getTime()) > EXPOSURE_FREE_DAYS * DAY_MS;
  if (!isOlder) return pass; // 무료 구간(최근 30일)

  const auth = await getAuthUser(request);
  if (!auth) return { denied: NextResponse.json({ error: '30일 이전 글 조회는 회원 전용입니다.', code: 'MEMBER_ONLY' }, { status: 401 }), charged: null };

  if (!CREDITS_ENABLED) return pass;
  const unit = await getExposureCreditPerPost();
  if (unit <= 0) return pass;
  // 20h 신선도 창 = 재검사 캐시 주기. 같은 창 안의 동일 글 재검사는 멱등(추가 과금 없음).
  const bucket = Math.floor(Date.now() / EXPOSURE_RECHECK_FRESH_MS);
  const referenceId = `exposure_check:${blogId}:${postId}:${bucket}`;
  const res = await chargeCredit(auth.userId, EXPOSURE_CREDIT_FEATURE, { amountOverride: unit, referenceId });
  if (!res.ok) return { denied: NextResponse.json(insufficientCreditBody(res.required, res.balance), { status: 402 }), charged: null };
  if (res.charged <= 0) return pass; // 멱등 재요청 — 이번엔 차감되지 않았다
  return { denied: null, charged: { userId: auth.userId, amount: res.charged, referenceId } };
}

/**
 * 네이버 조회가 실패(status='error')하면 확인된 게 아무것도 없으므로 차감분을 되돌린다.
 * 실패 결과는 DB에도 캐시에도 남지 않아 사용자가 얻는 것이 없기 때문(§9 차단 감지 강화 후 실패 건수 증가).
 * grantCredit 은 referenceId 멱등이라 같은 차감건을 두 번 환불하지 않는다.
 */
async function refundFailedLookup(charged: NonNullable<ChargeGateResult['charged']>): Promise<void> {
  try {
    await grantCredit(charged.userId, charged.amount, 'refund', {
      referenceId: `refund:${charged.referenceId}`,
      feature: EXPOSURE_CREDIT_FEATURE,
    });
  } catch (err) {
    console.error(`[check-missing] 실패 조회 환불 실패 ref=${charged.referenceId}:`, err);
  }
}

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

    // 이 라우트는 네 화면이 공유한다 — 노출 현황(max) · 대시보드(free) · 키워드 순위(pro) · 경쟁사(pro).
    // 그래서 라우트 전체가 아니라 노출 현황 고유 동작인 3탭 교차검증(checkInfluencer)만 등급으로 막는다.
    // checkInfluencer 를 빼고 부르면 통과하지만, 그때 나오는 2탭 결과는 무료 대시보드가 이미 주는 것과
    // 같아서 권한 상승이 아니다. 인플루언서 탭까지 얹은 확정 판정이 노출 현황이 파는 것이다.
    if (checkInfluencer === true) {
      const gate = await requireFeature(request, 'my.missing-posts');
      if (gate.error) return gate.error;
    }

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

    // §9·§20 실제 검사(네이버 조회) 직전 과금 게이트 — 30일 이전 글이면 회원 전용 + 크레딧 멱등 차감.
    // 캐시 히트는 위에서 이미 반환됐으므로 여기 도달한 요청만 신규 조회로 간주해 과금한다.
    const charge = await enforceExtendedLookupCharge(request, String(blogId), postId ? String(postId) : undefined);
    if (charge.denied) return charge.denied;

    // 같은 키에 대해 이미 진행 중인 조회가 있으면 그 결과를 공유 (동시 접속 사용자 간 중복 크롤링 방지)
    let promise = inFlight.get(cacheKey);
    if (!promise) {
      promise = (async (): Promise<PostExposureResult> => {
        const displayName = await getDisplayName(blogId);
        // §3·§5 사용자 키워드가 없으면 추출된 대표/연관 키워드를 검색 후보로 함께 사용(제목만으론 못 잡는 노출 방지)
        let keywordCandidates: string[] | undefined;
        let keywordConfidence: number | null | undefined;
        if (!keyword && postId) {
          try {
            const rep = await getOrPersistRepresentativeKeyword(blogId, String(postId), postTitle || '', { allowAI: true });
            keywordCandidates = [rep.representativeKeyword, ...(rep.candidates || [])].filter((k): k is string => Boolean(k));
            // 확신도를 함께 넘겨야 저신뢰 키워드가 1순위 검색어(=재검증·검색량 기준)를 차지하지 않는다.
            keywordConfidence = rep.confidence;
          } catch (e) {
            console.warn(`[check-missing] 대표 키워드 조회 실패 blogId=${blogId} postId=${postId}:`, e);
          }
        }
        const result = await computePostExposure({
          blogId,
          postTitle,
          postId,
          keyword,
          keywordCandidates,
          keywordConfidence,
          checkInfluencer,
          displayName,
          force: Boolean(force), // 사용자 강제 재조회 시 HTML 공유 캐시까지 우회(스펙 #24)
        });

        // 검사 결과 즉시 DB 반영. ⚠️ 일시적 오류(status='error')는 저장하지 않는다 —
        // 이전의 정상 노출/미노출 기록을 null 로 덮어쓰지 않기 위함(다음 재검사 때 정상 확인되면 그때 기록).
        // 확정 판정(overall_status/confidence)은 저장 로직이 재검증·연속카운터로 계산 → 응답에 실어 클라가 즉시 반영하게 한다.
        if (postId && result.status !== 'error') {
          try {
            const supabase = createServiceClient();
            const recorded = await recordPostExposure(blogId, String(postId), postTitle || null, result, supabase);
            result.overallStatus = recorded.overallStatus;
            result.confidence = recorded.confidence;
          } catch (err) {
            console.error(`[check-missing] post_missing_checks 저장 실패 blogId=${blogId} postId=${postId}:`, err);
          }
        }

        // 오류 응답은 캐시하지 않는다(다음 시도에서 정상 재확인되도록). 정상 결과만 공유 캐시에 저장.
        // 확정 판정(overall_status/confidence)까지 채운 뒤 캐시해야 캐시 히트 시에도 클라가 동일 상태를 받는다.
        if (result.status !== 'error') {
          await cacheSet(cacheKey, result, CACHE_TTL_SEC);
        }

        return result;
      })();
      inFlight.set(cacheKey, promise);
      promise.finally(() => inFlight.delete(cacheKey));
    }

    // 환불 판단은 공유 promise 밖(요청 단위)에서 한다 — 동시 요청은 promise 하나를 나눠 쓰지만
    // 차감은 각자 별개로 일어났기 때문.
    let result: PostExposureResult;
    try {
      result = await promise;
    } catch (err) {
      if (charge.charged) await refundFailedLookup(charge.charged);
      throw err;
    }
    if (result.status === 'error' && charge.charged) await refundFailedLookup(charge.charged);
    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    console.error('[check-missing] 요청 처리 중 예외:', err);
    return NextResponse.json({ error: '누락 확인 중 오류' }, { status: 500 });
  }
}
