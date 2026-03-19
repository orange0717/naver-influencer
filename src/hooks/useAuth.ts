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

  const logout = () => {
    queryClient.setQueryData(['auth', 'me'], defaultUser);
    queryClient.invalidateQueries({ queryKey: ['auth'] });
  };

  return { user, isLoading, logout };
}
