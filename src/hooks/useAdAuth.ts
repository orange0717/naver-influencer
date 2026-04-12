'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type AdvertiserInfo = {
  type: 'advertiser' | null;
  id: string | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
};

const defaultAdvertiser: AdvertiserInfo = { type: null, id: null, companyName: null, contactName: null, email: null };

async function fetchAdvertiser(): Promise<AdvertiserInfo> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      const res = await fetch('/api/ad/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) return data;
      }
    }
  } catch {
    // 세션 실패 시 폴백
  }

  const res = await fetch('/api/ad/auth/me');
  if (!res.ok) return defaultAdvertiser;
  return res.json();
}

export function useAdAuth() {
  const queryClient = useQueryClient();

  const { data: advertiser = defaultAdvertiser, isLoading } = useQuery({
    queryKey: ['ad-auth', 'me'],
    queryFn: fetchAdvertiser,
    staleTime: 5 * 60 * 1000,
  });

  const logout = async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      await fetch('/api/ad/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('[useAdAuth] 로그아웃 실패:', err);
    }
    queryClient.setQueryData(['ad-auth', 'me'], defaultAdvertiser);
    queryClient.invalidateQueries({ queryKey: ['ad-auth'] });
    window.location.href = '/orangeconnect';
  };

  return { advertiser, isLoading, logout };
}
