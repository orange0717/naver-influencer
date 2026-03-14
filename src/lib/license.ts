import { cookies } from 'next/headers';
import { createServiceClient } from './supabase-server';

const ADMIN_IDS = (process.env.ADMIN_NAVER_IDS || '').split(',').filter(Boolean);

export interface LicenseCheck {
  authenticated: boolean;
  naverId: string | null;
  licensed: boolean;
  isAdmin: boolean;
  planName: string | null;
}

/**
 * 쿠키 기반 라이선스 검증 (API 라우트용)
 * - naver_id 쿠키로 사용자 식별
 * - licenses 테이블에서 활성 이용권 확인
 * - ADMIN_NAVER_IDS 환경변수로 관리자 우회
 */
export async function checkLicense(): Promise<LicenseCheck> {
  const cookieStore = await cookies();
  const naverId = cookieStore.get('naver_id')?.value || null;

  if (!naverId) {
    return { authenticated: false, naverId: null, licensed: false, isAdmin: false, planName: null };
  }

  const isAdmin = ADMIN_IDS.includes(naverId);
  if (isAdmin) {
    return { authenticated: true, naverId, licensed: true, isAdmin: true, planName: 'ADMIN' };
  }

  const supabase = createServiceClient();
  const { data: license } = await supabase
    .from('licenses')
    .select('plan_name, expires_at')
    .eq('buyer_id', naverId)
    .eq('is_used', true)
    .gte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .single();

  return {
    authenticated: true,
    naverId,
    licensed: !!license,
    isAdmin: false,
    planName: license?.plan_name || null,
  };
}
