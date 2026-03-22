'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type UserInfo = {
  type: 'influencer' | 'blogger' | 'unified' | null;
  id: string | null;
  blogId?: string | null;
  name: string | null;
};

const defaultUser: UserInfo = { type: null, id: null, name: null };

async function fetchUser(): Promise<UserInfo> {
  // Supabase 세션에서 토큰을 가져와 Bearer 헤더로 전달
  try {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) return data;
      }
    }
  } catch {
    // Supabase 세션 실패 시 폴백
  }

  // 쿠키 기반 폴백
  const res = await fetch('/api/auth/me');
  if (!res.ok) return defaultUser;
  return res.json();
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user = defaultUser, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchUser,
    staleTime: 5 * 60 * 1000,
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
    queryClient.setQueryData(['auth', 'me'], defaultUser);
    queryClient.invalidateQueries({ queryKey: ['auth'] });
    window.location.href = '/';
  };

  return { user, isLoading, logout };
}
