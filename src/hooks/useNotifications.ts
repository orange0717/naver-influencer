'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export interface NotificationItem {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // 쿠키 폴백
  }
  return {};
}

export function useNotifications(page = 1, enabled = true) {
  return useQuery({
    queryKey: ['notifications', page],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/notifications?page=${page}&limit=20`, { headers });
      if (!res.ok) return { notifications: [] as NotificationItem[], total: 0, unreadCount: 0 };
      return res.json() as Promise<{
        notifications: NotificationItem[];
        total: number;
        unreadCount: number;
      }>;
    },
    enabled,
    staleTime: 60_000,
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/notifications?page=1&limit=1', { headers });
      if (!res.ok) return 0;
      const data = await res.json();
      return (data.unreadCount ?? 0) as number;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id?: string) => {
      const headers = await getAuthHeaders();
      await fetch('/api/notifications/read', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useNotificationSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notification-settings'],
    queryFn: async () => {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/notifications/settings', { headers });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (settings: Record<string, boolean>) => {
      const headers = await getAuthHeaders();
      await fetch('/api/notifications/settings', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
    },
  });

  return { settings: query.data, isLoading: query.isLoading, updateSettings: mutation.mutate };
}
