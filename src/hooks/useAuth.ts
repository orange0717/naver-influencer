'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

type UserInfo = {
  type: 'influencer' | 'blogger' | 'unified' | null;
  id: string | null;
  blogId?: string | null;
  name: string | null;
};

const defaultUser: UserInfo = { type: null, id: null, name: null };

async function fetchUser(): Promise<UserInfo> {
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
    // API 성공/실패와 무관하게 클라이언트 상태 클리어
    queryClient.setQueryData(['auth', 'me'], defaultUser);
    queryClient.invalidateQueries({ queryKey: ['auth'] });
    window.location.href = '/';
  };

  return { user, isLoading, logout };
}
