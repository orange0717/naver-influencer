import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { createServiceClient, getUserWithTimeout } from '@/lib/supabase-server';
import { isAdminFromProfile } from '@/lib/admin';
import JudgesClient from './JudgesClient';

export const dynamic = 'force-dynamic';

/**
 * 심사위원 계정 관리 (관리자 전용)
 *
 * 권한 판정은 이미 /admin/layout.tsx 가 수행하며, 미인증 방문자는 그 단계에서
 * 홈으로 리다이렉트된다(관리 경로의 존재가 드러나지 않음 — /admin 전체의
 * 기존 동작과 동일). 여기서 한 번 더 검사해 notFound() 로 떨어뜨리는 것은
 * 레이아웃 게이트가 바뀌더라도 이 화면만은 존재 자체를 노출하지 않기 위한
 * 이중 안전장치다. 403 은 어느 경로로도 반환하지 않는다.
 */
async function isAdminRequest(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return false;

    const { createServerClient } = await import('@supabase/ssr');
    const supabaseAuth = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* read-only */ },
      },
    });

    const authUser = await getUserWithTimeout(supabaseAuth);
    if (!authUser) return false;

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from('users')
      .select('id, is_admin')
      .eq('auth_id', authUser.id)
      .single();

    return !!profile && isAdminFromProfile(profile);
  } catch {
    return false;
  }
}

export default async function AdminJudgesPage() {
  if (!(await isAdminRequest())) notFound();
  return <JudgesClient />;
}
