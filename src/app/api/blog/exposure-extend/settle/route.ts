import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { assertBlogResourceAccess } from '@/lib/blog-access';
import { createServiceClient } from '@/lib/supabase-server';
import { dashboardLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { grantCredit } from '@/lib/credits';
import { countCompletedSince, updateJob, type ExposureJob, type ExposureJobStatus } from '@/lib/exposure-lookup';

export const dynamic = 'force-dynamic';

/**
 * POST /api/blog/exposure-extend/settle
 * 확장 조회 종료 후 정산(스펙 #10). 실제 "성공 검사된 신규 대상 수"를 DB(post_missing_checks) 근거로 세고,
 * 승인 시 차감한 크레딧 중 완료되지 못한 과금분을 환불한다. 클라 보고 수치를 신뢰하지 않는다.
 * 이중 정산 방지: job.settled 가드(§9·§10). 작업 전체가 시작조차 못했으면(processed 0) 전액 환불된다.
 *
 * body: { jobId, blogId, newCheckIds: string[], status?: 'completed'|'partial_failed'|'failed'|'cancelled' }
 */
export async function POST(request: NextRequest) {
  if (await dashboardLimiter.check(getClientIp(request))) return rateLimitResponse();

  const auth = await getAuthUser(request);
  if (!auth) return NextResponse.json({ error: '회원 전용 기능입니다.', code: 'MEMBER_ONLY' }, { status: 401 });

  let body: { jobId?: string; blogId?: string; newCheckIds?: unknown; status?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }
  const jobId = typeof body.jobId === 'string' ? body.jobId.trim() : '';
  const blogId = typeof body.blogId === 'string' ? body.blogId.trim() : '';
  const newCheckIds = Array.isArray(body.newCheckIds) ? body.newCheckIds.filter((x): x is string => typeof x === 'string') : [];
  const clientStatus = typeof body.status === 'string' ? body.status : '';
  if (!jobId || !blogId) return NextResponse.json({ error: 'jobId, blogId 필수' }, { status: 400 });

  const denied = await assertBlogResourceAccess(request, blogId);
  if (denied) return denied;

  const supabase = createServiceClient();
  const { data: jobRow } = await supabase.from('exposure_lookup_jobs').select('*').eq('id', jobId).maybeSingle();
  const job = jobRow as ExposureJob | null;
  if (!job || job.user_id !== auth.userId) {
    // 작업이 없거나(테이블 미생성/타인) — 정산할 것 없음(무해 종료)
    return NextResponse.json({ settled: false, reason: 'no_job' });
  }
  if (job.settled) {
    return NextResponse.json({ settled: true, idempotent: true, refunded: job.refunded_credits, status: job.status });
  }

  // 승인 이후 실제 성공 검사된 신규 대상 수(DB 근거)
  const completed = await countCompletedSince(supabase, blogId, newCheckIds, job.created_at);

  // 환불액: 승인 과금분 중 완료되지 못한 과금 대상 비율만큼(무료 90 초과분 기준). 완료가 승인분 이상이면 0.
  let refunded = 0;
  if (job.chargeable > 0 && job.charged_credits > 0) {
    const actualChargeable = Math.max(0, completed - (job.total_new_checks - job.chargeable)); // = max(0, completed - freeLimit분)
    const refundChargeable = Math.max(0, Math.min(job.chargeable, job.chargeable - actualChargeable));
    refunded = Math.round((job.charged_credits * refundChargeable) / job.chargeable);
    if (refunded > 0) {
      await grantCredit(auth.userId, refunded, 'refund', { referenceId: `${job.reference_id}:refund`, feature: 'bulk_exposure_check' });
    }
  }

  // 상태 결정(서버 권위): 완료 수 기준. 클라가 cancelled 를 보냈고 완료 0이면 cancelled 존중.
  let status: ExposureJobStatus;
  if (completed >= job.total_new_checks && job.total_new_checks > 0) status = 'completed';
  else if (completed > 0) status = 'partial_failed';
  else status = clientStatus === 'cancelled' ? 'cancelled' : 'failed';

  await updateJob(supabase, job.id, {
    status,
    processed: completed,
    failed: Math.max(0, job.total_new_checks - completed),
    settled: true,
    refunded_credits: refunded,
  });

  return NextResponse.json({ settled: true, completed, refunded, status });
}
