import { getAuthUser } from './auth';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from './supabase-server';

const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const RESTRICTED_EMAILS = (process.env.RESTRICTED_USER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/**
 * 주어진 userId가 관리자인지 환경변수 부트스트랩 목록으로 동기 확인.
 *
 * 실제 권한 source of truth 는 users.is_admin 컬럼이며, 가능한 곳에선
 * isAdminAsync 또는 user 행의 is_admin 필드를 직접 사용해야 한다.
 * 이 함수는 user 행이 아직 없는 부트스트랩 시점/sync 호출 경로에서만 사용.
 */
export function isAdmin(userId: string): boolean {
  return ADMIN_IDS.includes(userId);
}

/**
 * users.is_admin 컬럼 + ADMIN_USER_IDS 환경변수(부트스트랩 폴백) 조합으로
 * 비동기 관리자 확인. 새 권한 검사는 가능한 이 함수 또는 미리 로드된
 * user 행의 is_admin 필드를 사용할 것.
 */
export async function isAdminAsync(userId: string): Promise<boolean> {
  if (ADMIN_IDS.includes(userId)) return true; // 부트스트랩 폴백 (DB 미설정 시)
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();
    return data?.is_admin === true;
  } catch (err) {
    console.error('[isAdminAsync] DB error:', err);
    return false;
  }
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
  | { authUser: { authId: string; userId: string; user: { id: string; nickname: string; linked_influencer_id: string | null; is_admin?: boolean } }; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  // users.is_admin 우선, ADMIN_USER_IDS 환경변수는 부트스트랩 폴백.
  const allowed = authUser.user.is_admin === true || isAdmin(authUser.userId);
  if (!allowed) {
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
  | { authUser: { authId: string; userId: string; user: { id: string; nickname: string; linked_influencer_id: string | null; is_admin?: boolean } }; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  // 관리자는 페이월/제한 우회
  if (authUser.user.is_admin === true || isAdmin(authUser.userId)) {
    return { authUser };
  }
  if (await isRestrictedByUserId(authUser.userId)) {
    return { error: NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 }) };
  }
  return { authUser };
}

/**
 * Server Component 페이월 진입 차단용 통합 헬퍼
 *
 * 활성 구독자와 관리자가 어떤 경우에도 페이월/구독 페이지로 튕기지 않도록
 * 한 번의 호출로 권한 컨텍스트를 반환한다.
 *
 * 데이터 정합성 fallback:
 *  - 1차: users.auth_id 매칭
 *  - 2차: users.email 매칭 (auth.users 와 public.users 의 email 동기화 누락 대비)
 *
 * @param authUserId Supabase Auth UUID (auth.users.id)
 * @param email      auth.users.email — auth_id 매칭 실패 시 fallback
 */
export async function getPaywallContext(
  authUserId: string,
  email?: string | null
): Promise<{
  isAdminUser: boolean;
  hasActivePaidPlan: boolean;
  plan: string | null;
  expiresAt: string | null;
  userId: string | null;
}> {
  try {
    const supabase = createServiceClient();
    let { data } = await supabase
      .from('users')
      .select('id, subscription_plan, subscription_expires_at, is_admin')
      .eq('auth_id', authUserId)
      .maybeSingle();

    if (!data && email) {
      const { data: byEmail } = await supabase
        .from('users')
        .select('id, subscription_plan, subscription_expires_at, is_admin')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      data = byEmail;
    }

    if (!data) {
      return { isAdminUser: false, hasActivePaidPlan: false, plan: null, expiresAt: null, userId: null };
    }

    return {
      // users.is_admin 우선, env 변수는 부트스트랩 폴백.
      isAdminUser: data.is_admin === true || isAdmin(data.id),
      hasActivePaidPlan: hasActiveSubscription(data.subscription_plan, data.subscription_expires_at),
      plan: data.subscription_plan ?? null,
      expiresAt: data.subscription_expires_at ?? null,
      userId: data.id,
    };
  } catch (err) {
    console.error('[getPaywallContext] unexpected error:', err);
    return { isAdminUser: false, hasActivePaidPlan: false, plan: null, expiresAt: null, userId: null };
  }
}

/**
 * 인플루언서 플랜 이상 접근 권한 확인 (블로거 플랜 차단)
 * - 비로그인 → 401
 * - 활성 INFLUENCER 플랜이 아니면 → 403 (블로거 플랜 또는 무료/만료 모두 차단)
 * - 관리자(users.is_admin 또는 ADMIN_USER_IDS 폴백)는 항상 통과
 */
export async function requireInfluencerPlan(request: NextRequest): Promise<
  | { authUser: { authId: string; userId: string; user: { id: string; nickname: string; linked_influencer_id: string | null; is_admin?: boolean } }; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  // 관리자는 항상 통과 — users.is_admin 우선, env 폴백
  if (authUser.user.is_admin === true || isAdmin(authUser.userId)) {
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
