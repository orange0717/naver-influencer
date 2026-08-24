import { NextRequest, NextResponse } from 'next/server';
import { consumeFreeDailyQuota, refundFreeDailyQuota } from './free-quota';

/**
 * "무료 5회 / PRO 무제한" 기능 게이트 — API 라우트 진입부에서 한 줄로 쓰는 용도.
 *
 * 사용 예:
 *   const gate = await requireFeatureAccess(request, {
 *     actionId: 'ai_consultant',
 *     userId: authUser?.userId ?? null,
 *     isPro: authUser ? await hasActivePaidPlanByUserId(authUser.userId) : false,
 *   });
 *   if (!gate.ok) return gate.response;
 *
 * 통과한 게이트는 refund()를 함께 돌려준다. 차감은 요청 진입부에서 먼저 일어나므로, 그 뒤에
 * 결과를 못 주고 실패로 끝나는 경로에서는 응답 전에 refund()를 불러야 한다 — 안 부르면
 * 사용자는 답을 못 받고 하루 무료 횟수만 잃는다. PRO는 애초에 차감이 없어 no-op이다.
 *
 * isPro는 호출부에서 판단해 넘긴다 (admin.ts::hasActivePaidPlanByUserId/getPaywallContext 재사용) —
 * 이 모듈은 "이미 PRO인지"를 스스로 조회하지 않는다. 크레딧제로 전환할 때도 이 시그니처는
 * 그대로 두고 isPro 판단 로직 또는 consumeFreeDailyQuota 내부만 바꾸면 된다.
 */
export async function requireFeatureAccess(
  request: NextRequest,
  opts: { actionId: string; userId?: string | null; isPro: boolean },
): Promise<{ ok: true; refund: () => Promise<void> } | { ok: false; response: NextResponse }> {
  if (opts.isPro) return { ok: true, refund: async () => {} };

  const quota = await consumeFreeDailyQuota({
    request,
    actionId: opts.actionId,
    isPro: false,
    userId: opts.userId,
  });

  if (quota.allowed) return { ok: true, refund: () => refundFreeDailyQuota(quota.subjectKey) };

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: opts.userId
          ? '오늘 무료 이용을 모두 사용했습니다. 이용권을 구매하면 계속 이용할 수 있습니다.'
          : '오늘 무료 이용을 모두 사용했습니다. 회원가입하면 더 많이 이용할 수 있습니다.',
        quotaExceeded: true,
        used: quota.used,
        limit: quota.limit,
        needsSignup: !opts.userId,
      },
      { status: 402 },
    ),
  };
}
