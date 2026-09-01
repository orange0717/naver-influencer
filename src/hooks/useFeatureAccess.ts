'use client';

import { useAuth } from './useAuth';
import {
  FEATURES,
  planAtLeast,
  toPlanKey,
  limitFor,
  type FeatureKey,
  type PlanKey,
} from '@/lib/plans';

export interface FeatureAccess {
  /** 이 기능을 쓸 수 있는가. 판정 중(isLoading)에는 false 로 둔다. */
  allowed: boolean;
  /** 현재 사용자의 등급. */
  plan: PlanKey;
  /** 이 기능이 요구하는 최소 등급. 미등록 기능이면 null. */
  requiredPlan: PlanKey | null;
  /** 이 기능 전용 잔여 횟수. 기능 전용 한도가 없으면 null. */
  remaining: number | null;
  /** 로그인 여부 — "이용권이 필요합니다"와 "로그인이 필요합니다"를 갈라 안내할 때 쓴다. */
  isLoggedIn: boolean;
  /** 인증 확인 중. 이 동안 잠금 화면을 띄우면 로그인 사용자에게 잠깐 잘못 보인다. */
  isLoading: boolean;
}

/**
 * 화면에서 기능 접근 가능 여부를 판정한다.
 *
 * 이건 안내용이다. 실제 차단은 서버의 requireFeature 가 한다 —
 * 이 훅만 쓰고 서버 가드를 빠뜨리면 API 직접 호출로 우회된다.
 */
export function useFeatureAccess(feature: FeatureKey): FeatureAccess {
  const { user, isLoading } = useAuth();

  const def = FEATURES[feature];
  const requiredPlan = def?.minPlan ?? null;
  const isLoggedIn = !!user.id;

  // 만료된 구독은 등급이 없는 것과 같다. subscriptionActive 를 거치지 않고
  // subscriptionPlan 만 보면 만료자가 계속 유료로 보인다.
  const plan: PlanKey = user.isAdmin
    ? 'INFLUENCER'
    : user.subscriptionActive
      ? toPlanKey(user.subscriptionPlan)
      : 'FREE';

  const allowAnonymous = def?.allowAnonymous === true;

  const allowed = isLoading
    ? false
    : !def
      ? true
      : !isLoggedIn && !allowAnonymous
        ? false
        : planAtLeast(plan, def.minPlan);

  return {
    allowed,
    plan,
    requiredPlan,
    remaining: limitFor(plan, feature),
    isLoggedIn,
    isLoading,
  };
}
