import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getCreditBalance } from '@/lib/credits';
import { CREDITS_ENABLED } from '@/lib/credit-gate';
import { computeLookupPlan, getLookupCreditPerItem, isLookupFeature } from '@/lib/analytics-lookup';

export const dynamic = 'force-dynamic';

/**
 * POST /api/analytics/lookup-extend/plan
 * 3화면(노출 현황·키워드 순위·AI 브리핑) 공통 "30일 이전 확장 조회" 대상 계산(차감/조회 없음).
 * 회원 전용(비회원 401). body: { feature, blogId, candidatePostIds: string[] }
 * 응답: { creditsEnabled, freeLimit, totalCandidates, cached, newChecks, chargeable, unit, estCredits, balance }
 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: '회원 전용 기능입니다.', code: 'MEMBER_ONLY' }, { status: 401 });

  let body: { feature?: unknown; blogId?: string; candidatePostIds?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }
  const feature = body.feature;
  if (!isLookupFeature(feature)) return NextResponse.json({ error: 'feature 가 올바르지 않습니다.' }, { status: 400 });
  const blogId = typeof body.blogId === 'string' ? body.blogId.trim() : '';
  const candidatePostIds = Array.isArray(body.candidatePostIds) ? body.candidatePostIds.filter((x): x is string => typeof x === 'string') : [];
  if (!blogId) return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const plan = await computeLookupPlan(supabase, feature, blogId, candidatePostIds);
  const unit = await getLookupCreditPerItem(feature);
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
