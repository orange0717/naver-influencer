import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getCreditBalance, chargeCredit } from '@/lib/credits';
import { CREDITS_ENABLED } from '@/lib/credit-gate';
import {
  computeLookupPlan,
  createLookupJob,
  getLookupJobByReference,
  updateLookupJob,
  getLookupCreditPerItem,
  getLookupCreditFeature,
  isLookupFeature,
} from '@/lib/analytics-lookup';

export const dynamic = 'force-dynamic';

/**
 * POST /api/analytics/lookup-extend/authorize
 * 3화면 공통 확장 조회 "승인" — 대상 재계산 → (크레딧 필요 시) 잔액확인 → 작업 생성 → 차감.
 * 멱등: 같은 clientJobId 재호출 시 reference_id UNIQUE + use_credit 멱등으로 이중차감 없음.
 * 크레딧 부족: 402 { code:'insufficient_credit', required, balance }.
 * body: { feature, blogId, candidatePostIds: string[], clientJobId: string }
 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: '회원 전용 기능입니다.', code: 'MEMBER_ONLY' }, { status: 401 });

  let body: { feature?: unknown; blogId?: string; candidatePostIds?: unknown; clientJobId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }
  const feature = body.feature;
  if (!isLookupFeature(feature)) return NextResponse.json({ error: 'feature 가 올바르지 않습니다.' }, { status: 400 });
  const blogId = typeof body.blogId === 'string' ? body.blogId.trim() : '';
  const clientJobId = typeof body.clientJobId === 'string' ? body.clientJobId.trim() : '';
  const candidatePostIds = Array.isArray(body.candidatePostIds) ? body.candidatePostIds.filter((x): x is string => typeof x === 'string') : [];
  if (!blogId || !clientJobId) return NextResponse.json({ error: 'blogId, clientJobId 필수' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const referenceId = `${feature}_extend:${blogId}:${clientJobId}`;

  // 서버 재산정(클라 숫자 불신) — 이 값으로 과금한다.
  const plan = await computeLookupPlan(supabase, feature, blogId, candidatePostIds);
  const unit = await getLookupCreditPerItem(feature);
  const amount = CREDITS_ENABLED ? plan.chargeable * unit : 0;

  // 이미 승인된 작업이면(멱등 재호출) 재차감 없이 그대로 반환 — 신규 대상은 다시 계산해 돌려준다.
  const existing = await getLookupJobByReference(supabase, auth.userId, referenceId);
  if (existing && existing.status !== 'cancelled') {
    return NextResponse.json({
      jobId: existing.id, referenceId, authorized: true,
      newCheckIds: plan.newCheckIds, newChecks: plan.newChecks, chargeable: plan.chargeable,
      charged: existing.charged_credits, idempotent: true,
    });
  }

  if (amount > 0) {
    const balance = await getCreditBalance(auth.userId);
    if (balance < amount) {
      return NextResponse.json({ code: 'insufficient_credit', required: amount, balance }, { status: 402 });
    }
  }

  const job = await createLookupJob(supabase, {
    userId: auth.userId, blogId, feature, referenceId,
    totalNewChecks: plan.newChecks, chargeable: plan.chargeable,
  });

  let charged = 0;
  if (amount > 0) {
    const res = await chargeCredit(auth.userId, getLookupCreditFeature(feature), { amountOverride: amount, referenceId });
    if (!res.ok) {
      if (job) await updateLookupJob(supabase, job.id, { status: 'cancelled' });
      return NextResponse.json({ code: 'insufficient_credit', required: res.required, balance: res.balance }, { status: 402 });
    }
    charged = amount;
    if (job) await updateLookupJob(supabase, job.id, { charged_credits: amount });
  }

  return NextResponse.json({
    jobId: job?.id ?? null, referenceId, authorized: true,
    newCheckIds: plan.newCheckIds, newChecks: plan.newChecks, chargeable: plan.chargeable, charged,
  });
}
