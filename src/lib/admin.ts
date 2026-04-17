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
 * 주어진 이메일이 제한된 사용자인지 확인 (DB + 환경변수 폴백)
 */
export async function isRestricted(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const lower = email.toLowerCase();

  // 환경변수 폴백
  if (RESTRICTED_EMAILS.includes(lower)) return true;

  // DB 조회
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
 */
export async function isRestrictedByUserId(userId: string): Promise<boolean> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('email')
      .eq('id', userId)
      .single();
    if (!data?.email) return false;
    return await isRestricted(data.email);
  } catch {
    return false;
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
