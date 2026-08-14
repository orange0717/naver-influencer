import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getCreditBalance, chargeCredit } from '@/lib/credits';
import { CREDITS_ENABLED } from '@/lib/credit-gate';
import { computeExtendedPlan, createJob, getJobByReference } from '@/lib/exposure-lookup';
import { getExposureCreditPerPost, EXPOSURE_CREDIT_FEATURE } from '@/lib/exposure-policy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/blog/exposure-extend/authorize
 * 확장 조회 "승인" — 스펙 #9 순서: 대상 재계산 → (크레딧 필요 시) 잔액 확인 → 작업 생성 → 크레딧 차감.
 * 이 응답을 받은 뒤에야 클라가 실제 노출 검사를 시작한다. 사용자 동의 없이는 절대 호출되지 않는다.
 *
 * 멱등(§9): 같은 clientJobId 로 재호출해도 reference_id UNIQUE + use_credit 멱등으로 이중 차감되지 않는다.
 * 크레딧 부족(§8): 402 { code:'insufficient_credit', required, balance } — 작업 생성/차감 없이 반환.
 *
 * body: { blogId, candidatePostIds: string[], clientJobId: string }
 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: '회원 전용 기능입니다.', code: 'MEMBER_ONLY' }, { status: 401 });

  let body: { blogId?: string; candidatePostIds?: unknown; clientJobId?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }
  const blogId = typeof body.blogId === 'string' ? body.blogId.trim() : '';
  const clientJobId = typeof body.clientJobId === 'string' ? body.clientJobId.trim() : '';
  const candidatePostIds = Array.isArray(body.candidatePostIds) ? body.candidatePostIds.filter((x): x is string => typeof x === 'string') : [];
  if (!blogId || !clientJobId) return NextResponse.json({ error: 'blogId, clientJobId 필수' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const referenceId = `exposure_extend:${blogId}:${clientJobId}`;

  // 서버 재산정(클라 숫자 불신) — 이 값으로 과금한다.
  const plan = await computeExtendedPlan(supabase, blogId, candidatePostIds);
  const unit = await getExposureCreditPerPost();
  const amount = CREDITS_ENABLED ? plan.chargeable * unit : 0;

  // 이미 승인된 작업이면(멱등 재호출) 재차감 없이 그대로 반환 — 신규 대상은 다시 계산해 돌려준다.
  const existing = await getJobByReference(supabase, auth.userId, referenceId);
  if (existing && existing.status !== 'cancelled') {
    return NextResponse.json({
      jobId: existing.id, referenceId, authorized: true,
      newCheckIds: plan.newCheckIds, newChecks: plan.newChecks, chargeable: plan.chargeable,
      charged: existing.charged_credits, idempotent: true,
    });
  }

  // §9: 잔액 확인 → 작업 생성 → 차감. 부족하면 아무것도 하지 않는다(§8·§10).
  if (amount > 0) {
    const balance = await getCreditBalance(auth.userId);
    if (balance < amount) {
      return NextResponse.json({ code: 'insufficient_credit', required: amount, balance }, { status: 402 });
    }
  }

  const job = await createJob(supabase, {
    userId: auth.userId, blogId, referenceId,
    totalNewChecks: plan.newChecks, chargeable: plan.chargeable,
  });

  let charged = 0;
  if (amount > 0) {
    // 멱등 차감 — reference_id 로 이중 차감 방지. 실패(부족/오류)면 승인 취소 응답.
    const res = await chargeCredit(auth.userId, EXPOSURE_CREDIT_FEATURE, { amountOverride: amount, referenceId });
    if (!res.ok) {
      if (job) await supabase.from('exposure_lookup_jobs').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', job.id);
      return NextResponse.json({ code: 'insufficient_credit', required: res.required, balance: res.balance }, { status: 402 });
    }
    charged = amount;
    if (job) await supabase.from('exposure_lookup_jobs').update({ charged_credits: amount, updated_at: new Date().toISOString() }).eq('id', job.id);
  }

  return NextResponse.json({
    jobId: job?.id ?? null, referenceId, authorized: true,
    newCheckIds: plan.newCheckIds, newChecks: plan.newChecks, chargeable: plan.chargeable, charged,
  });
}
