import { NextResponse } from 'next/server';
import { getAuthUser } from '../auth';
import { getPlanKeyByUserId, isRestrictedByUserId } from '../admin';
import {
  FEATURES,
  planAtLeast,
  lockedMessage,
  type FeatureKey,
  type PlanKey,
} from '../plans';

/**
 * 기능 접근 권한을 확인하는 서버 가드 — 게이팅의 정본.
 *
 * 화면(useFeatureAccess)과 미들웨어는 사용자 경험을 위한 것이고, 실제 차단은
 * 여기서만 일어난다. 새 기능을 잠글 때 화면 분기만 추가하고 이 가드를 빠뜨리면
 * API 를 직접 호출해 그대로 우회할 수 있다.
 *
 * @returns 통과 시 { authUser, plan }, 차단 시 { error } — 라우트는 error 를 그대로 반환한다.
 */
export async function requireFeature(
  request: Request,
  feature: FeatureKey,
): Promise<
  | { authUser: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>; plan: PlanKey; error?: never }
  | { error: NextResponse; authUser?: never; plan?: never }
> {
  const def = FEATURES[feature];
  if (!def) {
    // 등록되지 않은 기능을 가드로 감싼 것은 설정 실수다. 조용히 열어두면
    // 잠근 줄 알고 방치되므로 서버 로그에 남기고 로그인만 요구한다.
    console.error(`[requireFeature] 등록되지 않은 기능 키: ${feature}`);
  }

  const authUser = await getAuthUser(request);
  if (!authUser) {
    return {
      error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }),
    };
  }

  const requiredPlan: PlanKey = def?.minPlan ?? 'FREE';
  if (requiredPlan === 'FREE') {
    return { authUser, plan: await getPlanKeyByUserId(authUser.userId) };
  }

  if (authUser.user.is_admin === true) {
    return { authUser, plan: 'INFLUENCER' };
  }

  if (await isRestrictedByUserId(authUser.userId)) {
    return {
      error: NextResponse.json(
        { error: '해당 계정은 유료 기능을 이용할 수 없습니다.' },
        { status: 403 },
      ),
    };
  }

  const plan = await getPlanKeyByUserId(authUser.userId);
  if (!planAtLeast(plan, requiredPlan)) {
    return {
      error: NextResponse.json(
        {
          error: lockedMessage(requiredPlan),
          // 화면이 어느 이용권을 안내할지 고르는 데만 쓴다. 문구에 그대로 노출하지 않는다.
          requiresPlan: requiredPlan.toLowerCase(),
          featureLocked: true,
        },
        { status: 403 },
      ),
    };
  }

  return { authUser, plan };
}
