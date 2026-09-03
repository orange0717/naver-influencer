import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { requireFeature } from '@/lib/guards/requireFeature';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { getCreditBalance } from '@/lib/credits';
import { CREDITS_ENABLED } from '@/lib/credit-gate';
import { computeExtendedPlan, createJob, getJobByReference } from '@/lib/exposure-lookup';
import { getExposureCreditPerPost } from '@/lib/exposure-policy';

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

  // 30일 이전 확장 조회는 노출 현황 전용이다(다른 화면에서 호출하지 않는다).
  // settle 은 일부러 열어둔다 — 등급이 내려간 사용자의 진행 중 작업이 정산되지 못한 채 남으면
  // 환불 경로까지 같이 막히기 때문이다(정산은 소유자 검사만으로 충분하고 새 조회를 시작하지 않는다).
  const gate = await requireFeature(request, 'my.missing-posts');
  if (gate.error) return gate.error;

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

  // §20 실행시점 과금 모델: 실제 차감은 각 글을 조회하는 check-missing에서 (blogId:postId, 20h 버킷) 멱등 발생한다.
  // 여기서는 사전 게이트(회원·잔액)만 담당하고 선차감하지 않는다 — authorize 선차감 + check-missing 실행차감의 이중 과금을 막기 위함.
  // 작업(job)은 진행 상태 추적·멱등 승인 용도로만 남긴다(charged_credits=0).
  const job = await createJob(supabase, {
    userId: auth.userId, blogId, referenceId,
    totalNewChecks: plan.newChecks, chargeable: plan.chargeable,
  });

  return NextResponse.json({
    jobId: job?.id ?? null, referenceId, authorized: true,
    newCheckIds: plan.newCheckIds, newChecks: plan.newChecks, chargeable: plan.chargeable, charged: 0,
  });
}
