import { getAuthUser } from './auth';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from './supabase-server';
import { logger } from './logger';

const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const RESTRICTED_EMAILS = (process.env.RESTRICTED_USER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export function isAdmin(userId: string): boolean {
  return ADMIN_IDS.includes(userId);
}

export function isAdminFromProfile(profile: { id: string; is_admin?: boolean | null }): boolean {
  return profile.is_admin === true || isAdmin(profile.id);
}

export async function isAdminAsync(userId: string): Promise<boolean> {
  if (ADMIN_IDS.includes(userId)) return true;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle();
    return data?.is_admin === true;
  } catch (err) {
    logger.error('access-control/isAdminAsync', 'DB error', {
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export function hasActiveSubscription(
  plan: string | null | undefined,
  expiresAt: string | null | undefined,
): boolean {
  if (!plan || !expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  return t > Date.now();
}

const RESTRICTED_CACHE_TTL_MS = 30_000;
const restrictedCache = new Map<string, { restricted: boolean; until: number }>();

export async function isRestricted(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const lower = email.toLowerCase();

  const now = Date.now();
  const cached = restrictedCache.get(lower);
  if (cached && cached.until > now) return cached.restricted;

  const result = await _computeRestricted(lower);
  restrictedCache.set(lower, { restricted: result, until: now + RESTRICTED_CACHE_TTL_MS });
  return result;
}

async function _computeRestricted(lower: string): Promise<boolean> {
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

  if (RESTRICTED_EMAILS.includes(lower)) return true;

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

export async function isRestrictedByUserId(userId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('users')
      .select('email, subscription_plan, subscription_expires_at')
      .eq('id', userId)
      .single();

    if (error) {
      logger.error('access-control/isRestrictedByUserId', 'DB error', { err: error.message });
      return true;
    }
    if (!data?.email) return true;

    if (hasActiveSubscription(data.subscription_plan, data.subscription_expires_at)) {
      return false;
    }

    return await isRestricted(data.email);
  } catch (err) {
    logger.error('access-control/isRestrictedByUserId', 'Unexpected error', {
      err: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

type AuthUserResult = {
  authId: string;
  userId: string;
  user: { id: string; nickname: string; linked_influencer_id: string | null; is_admin?: boolean };
};

export async function requireAdmin(request: NextRequest): Promise<
  | { authUser: AuthUserResult; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  const allowed = authUser.user.is_admin === true || isAdmin(authUser.userId);
  if (!allowed) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) };
  }
  return { authUser };
}

export async function requirePaidAccess(request: NextRequest): Promise<
  | { authUser: AuthUserResult; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  if (authUser.user.is_admin === true || isAdmin(authUser.userId)) {
    return { authUser };
  }
  if (await isRestrictedByUserId(authUser.userId)) {
    return { error: NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 }) };
  }
  return { authUser };
}

export async function requirePaidPlan(request: NextRequest): Promise<
  | { authUser: AuthUserResult; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
  if (authUser.user.is_admin === true || isAdmin(authUser.userId)) {
    return { authUser };
  }
  if (await isRestrictedByUserId(authUser.userId)) {
    return { error: NextResponse.json({ error: '해당 계정은 유료 기능을 이용할 수 없습니다.' }, { status: 403 }) };
  }
  const ctx = await getPaywallContext(authUser.userId);
  if (!ctx.hasActivePaidPlan) {
    return { error: NextResponse.json({ error: '유료 플랜이 필요합니다.', requiresPlan: 'blogger' }, { status: 402 }) };
  }
  return { authUser };
}

export async function getPaywallContext(
  authUserId: string,
  email?: string | null,
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
      isAdminUser: data.is_admin === true || isAdmin(data.id),
      hasActivePaidPlan: hasActiveSubscription(data.subscription_plan, data.subscription_expires_at),
      plan: data.subscription_plan ?? null,
      expiresAt: data.subscription_expires_at ?? null,
      userId: data.id,
    };
  } catch (err) {
    logger.error('access-control/getPaywallContext', 'Unexpected error', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { isAdminUser: false, hasActivePaidPlan: false, plan: null, expiresAt: null, userId: null };
  }
}

export async function requireInfluencerPlan(request: NextRequest): Promise<
  | { authUser: AuthUserResult; error?: never }
  | { error: NextResponse; authUser?: never }
> {
  const authUser = await getAuthUser(request);
  if (!authUser) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }
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
          { status: 403 },
        ),
      };
    }
    if (data.subscription_plan !== 'INFLUENCER') {
      return {
        error: NextResponse.json(
          {
            error: '인플루언서 플랜 이상에서 이용 가능합니다.',
            code: 'PLAN_REQUIRED',
            requiredPlan: 'INFLUENCER',
            currentPlan: data.subscription_plan,
          },
          { status: 403 },
        ),
      };
    }
    return { authUser };
  } catch (err) {
    logger.error('access-control/requireInfluencerPlan', 'Unexpected error', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { error: NextResponse.json({ error: '구독 정보를 확인할 수 없습니다.' }, { status: 500 }) };
  }
}
