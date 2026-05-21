'use client';

import { useEffect, useState, useCallback } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

interface Notification {
  id: string;
  user_id: string;
  notification_type: 'PASSWORD_RENEWAL' | 'PRIVACY_POLICY';
  title: string;
  body: string;
  action_url?: string;
  is_read: boolean;
  created_at: string;
  dismissed_at?: string | null;
}

export function useSecurityNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createSupabaseBrowserClient();

  // Fetch pending notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Get unread notifications that haven't been dismissed
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[SECURITY_NOTIFICATIONS] Error fetching:', error);
        return;
      }

      setNotifications(data || []);
    } catch (error) {
      console.error('[SECURITY_NOTIFICATIONS] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Mark notification as read
  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({
            is_read: true,
            read_at: new Date().toISOString(),
          })
          .eq('id', notificationId);

        if (error) {
          console.error('[SECURITY_NOTIFICATIONS] Error marking read:', error);
          return;
        }

        // Update local state
        setNotifications((prev) =>
          prev.filter((n) => n.id !== notificationId)
        );
      } catch (error) {
        console.error('[SECURITY_NOTIFICATIONS] Error:', error);
      }
    },
    [supabase]
  );

  // Dismiss notification
  const dismiss = useCallback(
    async (notificationId: string) => {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({
            dismissed_at: new Date().toISOString(),
          })
          .eq('id', notificationId);

        if (error) {
          console.error('[SECURITY_NOTIFICATIONS] Error dismissing:', error);
          return;
        }

        // Update local state
        setNotifications((prev) =>
          prev.filter((n) => n.id !== notificationId)
        );
      } catch (error) {
        console.error('[SECURITY_NOTIFICATIONS] Error:', error);
      }
    },
    [supabase]
  );

  // Initial fetch
  useEffect(() => {
    fetchNotifications();

    // Set up real-time subscription (optional)
    const subscription = supabase
      .channel('security_notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          setNotifications((prev) => [newNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchNotifications, supabase]);

  return {
    notifications,
    loading,
    markAsRead,
    dismiss,
    refetch: fetchNotifications,
  };
}
