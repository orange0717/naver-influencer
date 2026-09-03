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

type AuthUser = NonNullable<Awaited<ReturnType<typeof getAuthUser>>>;

/**
 * 기능 접근 권한을 확인하는 서버 가드 — 게이팅의 정본.
 *
 * 화면(useFeatureAccess)과 미들웨어는 사용자 경험을 위한 것이고, 실제 차단은
 * 여기서만 일어난다. 새 기능을 잠글 때 화면 분기만 추가하고 이 가드를 빠뜨리면
 * API 를 직접 호출해 그대로 우회할 수 있다.
 *
 * allowAnonymous 기능까지 다루려면 checkFeatureRequest 를 쓴다. 이쪽은 로그인을
 * 반드시 요구하므로 authUser 가 null 이 될 일이 없고, 그래서 호출부가 곧바로
 * authUser 를 쓸 수 있다.
 *
 * @returns 통과 시 { authUser, plan }, 차단 시 { error } — 라우트는 error 를 그대로 반환한다.
 */
export async function requireFeature(
  request: Request,
  feature: FeatureKey,
): Promise<
  | { authUser: AuthUser; plan: PlanKey; error?: never }
  | { error: NextResponse; authUser?: never; plan?: never }
> {
  const gate = await checkFeatureRequest(request, feature);
  if (gate.error) return { error: gate.error };
  if (!gate.authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  return { authUser: gate.authUser, plan: gate.plan };
}

/**
 * requireFeature 와 같은 판정을 하되, allowAnonymous 로 선언된 기능은 비로그인도 통과시킨다.
 * 통과했는데 authUser 가 null 이면 "비로그인 사용자가 정상적으로 쓰는 중"이라는 뜻이다.
 *
 * 비로그인을 열어주는 것은 등급 축과 무관한 판단이므로 plans.ts 의 선언만 보고 정한다 —
 * 라우트에서 따로 로그인 여부를 재검사하면 정본이 둘로 갈라진다.
 */
export async function checkFeatureRequest(
  request: Request,
  feature: FeatureKey,
): Promise<
  | { authUser: AuthUser | null; plan: PlanKey; error?: never }
  | { error: NextResponse; authUser?: never; plan?: never }
> {
  const def = FEATURES[feature];
  if (!def) {
    // 등록되지 않은 기능을 가드로 감싼 것은 설정 실수다. 조용히 열어두면
    // 잠근 줄 알고 방치되므로 서버 로그에 남기고 로그인만 요구한다.
    console.error(`[requireFeature] 등록되지 않은 기능 키: ${feature}`);
  }

  const requiredPlan: PlanKey = def?.minPlan ?? 'free';

  const authUser = await getAuthUser(request);
  if (!authUser) {
    // 등급을 요구하는 기능은 비로그인 허용 선언이 있어도 열지 않는다.
    // 두 선언이 엇갈리면 더 좁은 쪽을 따른다.
    if (def?.allowAnonymous && requiredPlan === 'free') {
      return { authUser: null, plan: 'free' };
    }
    return {
      error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }),
    };
  }

  if (requiredPlan === 'free') {
    return { authUser, plan: await getPlanKeyByUserId(authUser.userId) };
  }

  if (authUser.user.is_admin === true) {
    return { authUser, plan: 'max' };
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
          requiresPlan: requiredPlan,
          featureLocked: true,
        },
        { status: 403 },
      ),
    };
  }

  return { authUser, plan };
}
