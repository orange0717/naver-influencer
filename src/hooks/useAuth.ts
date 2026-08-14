'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { clearUserScopedLocalStorage } from '@/lib/clear-user-storage';

type UserInfo = {
  type: 'influencer' | 'blogger' | 'unified' | null;
  id: string | null;
  blogId?: string | null;
  name: string | null;
  nickname?: string | null;
  email?: string | null;
  authId?: string | null;
  isAdmin?: boolean;
  restricted?: boolean;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: string | null;
  subscriptionActive?: boolean;
};

const defaultUser: UserInfo = { type: null, id: null, name: null, email: null };

/**
 * 백엔드 일시 장애(5xx)는 "비회원"으로 확정하지 않는다. defaultUser(id:null)로 폴백하면
 * 정상 로그인 사용자가 로그아웃/회원가입 화면으로 튕긴다 → 던져서 react-query가
 * 마지막 성공 상태를 유지하고 재시도하게 한다(요구사항 #10 E, #11, #13).
 */
const BACKEND_UNAVAILABLE = 'auth_me_unavailable';

async function fetchUser(): Promise<UserInfo> {
  // Supabase 세션에서 토큰을 가져와 Bearer 헤더로 전달
  try {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status >= 500) throw new Error(BACKEND_UNAVAILABLE);
      if (res.ok) {
        const data = await res.json();
        if (data.id) return data;
      }
    }
  } catch (e) {
    if (e instanceof Error && e.message === BACKEND_UNAVAILABLE) throw e;
    // Supabase 세션 조회 실패 등은 쿠키 기반 폴백으로
  }

  // 쿠키 기반 폴백
  const res = await fetch('/api/auth/me');
  if (res.status >= 500) throw new Error(BACKEND_UNAVAILABLE);
  if (!res.ok) return defaultUser;
  return res.json();
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user = defaultUser, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchUser,
    staleTime: 5 * 60 * 1000,
    // 일시 장애 시 재시도. 던져진 오류 동안 react-query는 마지막 성공 데이터를
    // 유지하므로, 로그인 사용자가 순간 로그아웃 상태로 뒤집히지 않는다.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  const logout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        console.warn('[useAuth] 로그아웃 API 실패:', res.status);
      }
    } catch (err) {
      console.warn('[useAuth] 로그아웃 요청 실패:', err);
    }
    clearUserScopedLocalStorage();
    queryClient.clear();
    window.location.href = '/';
  };

  return { user, isLoading, logout };
}
