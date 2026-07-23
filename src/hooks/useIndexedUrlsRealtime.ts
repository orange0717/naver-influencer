'use client';

import { useEffect } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { IndexedUrl } from '@/lib/google-indexing-types';

/**
 * indexed_urls 테이블의 변경을 실시간으로 구독한다.
 * userId는 앱 레벨 users.id(= /api/google-indexing/summary 응답의 userId)여야 한다 —
 * Realtime 필터와 RLS 모두 users.id 기준이라 auth.uid()(=auth_id)를 그대로 쓰면 안 된다.
 */
export function useIndexedUrlsRealtime(
  userId: string | null,
  onInsert: (row: IndexedUrl) => void,
  onUpdate: (row: IndexedUrl) => void,
) {
  useEffect(() => {
    if (!userId) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`indexed-urls-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'indexed_urls', filter: `user_id=eq.${userId}` },
        (payload) => onInsert(payload.new as IndexedUrl),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'indexed_urls', filter: `user_id=eq.${userId}` },
        (payload) => onUpdate(payload.new as IndexedUrl),
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}
