import { getAuthUser } from './auth';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from './supabase-server';

const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const RESTRICTED_EMAILS = (process.env.RESTRICTED_USER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/**
 * 주어진 userId가 관리자인지 확인
 */
export function isAdmin(userId: string): boolean {
  return ADMIN_IDS.includes(userId);
}

/**
 * 활성 유료 구독 여부 (subscription_plan + 만료 시각)
 * - plan 이 비어 있거나 expires_at 이 null/과거면 false
 */
function hasActiveSubscription(
  plan: string | null | undefined,
  expiresAt: string | null | undefined
): boolean {
  if (!plan) return false;
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t > Date.now();
}

/**
 * 주어진 이메일이 제한된 사용자인지 확인 (DB + 환경변수 폴백)
 *
 * 권한 우선순위:
 * 1) users.subscription_plan + subscription_expires_at 가 활성이면 제한 해제(false)
 * 2) 환경변수 RESTRICTED_USER_EMAILS 에 포함되면 제한(true)
 * 3) restricted_users 테이블에 등록되어 있으면 제한(true)
 */
export async function isRestricted(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const lower = email.toLowerCase();

  // 1) 활성 유료 구독 우선 — 365일 권한 등 부여된 회원은 제한 우회
  try {
    const supabase = createServiceClient();
    const { data: userRow } = await supabase
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('email', lower)
      .maybeSingle();
    if (userRow && hasActiveSubscription(userRow.subscription_plan, userRow.subscription_expires_at)) {
      return false;
    }
  } catch {
    // users 조회 실패는 무시하고 기존 제한 로직으로 폴백
  }

  // 2) 환경변수 폴백
  if (RESTRICTED_EMAILS.includes(lower)) return true;

  // 3) DB 조회
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('restricted_users')
      .select('id')
      .eq('email', lower)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/**
 * API 라우트에서 관리자 인증을 수행
 * @returns { authUser } 또는 에러 Response
 */
export async function requireAdmin(request: NextRequest): Promise<
  | { authUser: { authId: string; userId: string; user: { id: string; nickname: string; linked_influencer_id: string | null } }; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  if (!isAdmin(authUser.userId)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { authUser };
}

/**
 * 주어진 userId가 제한된 사용자인지 확인 (users 테이블에서 email 조회 후 판정)
 *
 * 보안 정책 (fail-secure):
 * - DB 오류나 사용자 조회 실패 시 true(제한됨) 반환하여 유료 기능 접근 차단
 * - 에러 상황에서 "제한 없음"으로 잘못 판정되어 유료 기능이 열리는 것을 방지
 */
export async function isRestrictedByUserId(userId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('users')
      .select('email, subscription_plan, subscription_expires_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[isRestrictedByUserId] DB error:', error.message);
      return true; // fail-secure: 에러 시 차단
    }
    if (!data?.email) {
      // 이메일 없는 사용자 계정 — 유료 기능 열지 않음
      return true;
    }

    // 활성 유료 구독 우선 — 365일 권한 등 부여된 회원은 제한 우회
    if (hasActiveSubscription(data.subscription_plan, data.subscription_expires_at)) {
      return false;
    }

    return await isRestricted(data.email);
  } catch (err) {
    console.error('[isRestrictedByUserId] unexpected error:', err);
    return true; // fail-secure: 예외 시 차단
  }
}

/**
 * 유료 기능 접근 권한 확인
 * - 비로그인 → 401
 * - 제한 사용자 → 403
 * 관리자(requireAdmin)처럼 API 라우트 진입부에서 단일 호출로 사용
 */
export async function requirePaidAccess(request: NextRequest): Promise<
  | { authUser: { authId: string; userId: string; user: { id: string; nickname: string; linked_influencer_id: string | null } }; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  if (await isRestrictedByUserId(authUser.userId)) {
    return { error: NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 }) };
  }
  return { authUser };
}

/**
 * 인플루언서 플랜 이상 접근 권한 확인 (블로거 플랜 차단)
 * - 비로그인 → 401
 * - 활성 INFLUENCER 플랜이 아니면 → 403 (블로거 플랜 또는 무료/만료 모두 차단)
 * - 관리자(ADMIN_USER_IDS)는 항상 통과
 */
export async function requireInfluencerPlan(request: NextRequest): Promise<
  | { authUser: { authId: string; userId: string; user: { id: string; nickname: string; linked_influencer_id: string | null } }; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  // 관리자는 항상 통과
  if (isAdmin(authUser.userId)) {
    return { authUser };
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', authUser.userId)
      .single();
    if (error || !data) {
      return { error: NextResponse.json({ error: '구독 정보를 확인할 수 없습니다.' }, { status: 403 }) };
    }
    if (!hasActiveSubscription(data.subscription_plan, data.subscription_expires_at)) {
      return {
        error: NextResponse.json(
          { error: '인플루언서 플랜 이상에서 이용 가능합니다.', code: 'PLAN_REQUIRED', requiredPlan: 'INFLUENCER' },
          { status: 403 }
        ),
      };
    }
    if (data.subscription_plan !== 'INFLUENCER') {
      return {
        error: NextResponse.json(
          { error: '인플루언서 플랜 이상에서 이용 가능합니다.', code: 'PLAN_REQUIRED', requiredPlan: 'INFLUENCER', currentPlan: data.subscription_plan },
          { status: 403 }
        ),
      };
    }
    return { authUser };
  } catch (err) {
    console.error('[requireInfluencerPlan] unexpected error:', err);
    return { error: NextResponse.json({ error: '구독 정보를 확인할 수 없습니다.' }, { status: 500 }) };
  }
}
