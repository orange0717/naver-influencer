import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getCreditBalance } from '@/lib/credits';
import { CREDITS_ENABLED } from '@/lib/credit-gate';
import { computeExtendedPlan } from '@/lib/exposure-lookup';
import { getExposureCreditPerPost } from '@/lib/exposure-policy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/blog/exposure-extend/plan
 * 30일 이전 확장 조회의 "조회 대상 계산"만 수행한다(차감/조회 없음, 스펙 #4·#5·#6·#20).
 * 회원 전용(비회원 401 — 클라는 이 호출 전에 로그인 모달을 띄운다, 스펙 #3).
 *
 * body: { blogId, candidatePostIds: string[] }  // 30일 이전 & 선택 기간 내 & 공개 글의 postId
 * 응답: { creditsEnabled, freeLimit, totalCandidates, cached, newChecks, chargeable, unit, estCredits, balance }
 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  // 비회원(미로그인) — 30일 이전 조회는 회원 전용(§3·§12). 클라가 미리 막지만 서버에서도 강제.
  if (!auth) return NextResponse.json({ error: '회원 전용 기능입니다.', code: 'MEMBER_ONLY' }, { status: 401 });

  let body: { blogId?: string; candidatePostIds?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }
  const blogId = typeof body.blogId === 'string' ? body.blogId.trim() : '';
  const candidatePostIds = Array.isArray(body.candidatePostIds) ? body.candidatePostIds.filter((x): x is string => typeof x === 'string') : [];
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const plan = await computeExtendedPlan(supabase, blogId, candidatePostIds);
  const unit = await getExposureCreditPerPost();
  const estCredits = CREDITS_ENABLED ? plan.chargeable * unit : 0;
  const balance = CREDITS_ENABLED ? await getCreditBalance(auth.userId) : 0;

  return NextResponse.json({
    creditsEnabled: CREDITS_ENABLED,
    freeLimit: plan.freeLimit,
    totalCandidates: plan.totalCandidates,
    cached: plan.cached,
    newChecks: plan.newChecks,
    chargeable: plan.chargeable,
    unit,
    estCredits,
    balance,
  });
}
