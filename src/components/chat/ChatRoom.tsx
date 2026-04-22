'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { ChatMessage, ChatReaction } from './types';
import MessageList from './MessageList';
import MessageInput from './MessageInput';

interface Props {
  currentUserId: string | null;
  currentUserType: 'influencer' | 'blogger' | null;
  isAdmin: boolean;
}

export default function ChatRoom({ currentUserId, isAdmin }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // 초기 메시지 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/chat/messages?limit=50');
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setAccessError(data.error || '메시지 조회 실패');
          setInitialLoading(false);
          return;
        }
        setMessages(data.messages || []);
        setReactions(data.reactions || []);
        setHasMore(data.hasMore);
        setInitialLoading(false);

        // 읽음 처리
        fetch('/api/chat/read', { method: 'POST' }).catch(() => {});
      } catch {
        if (!cancelled) {
          setAccessError('네트워크 오류');
          setInitialLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Realtime 구독
  useEffect(() => {
    if (accessError) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel('chat-room-general')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages(prev => {
            if (prev.find(p => p.id === m.id)) return prev;
            return [...prev, m];
          });
          // 읽음 자동 업데이트 (뷰 하단에 있을 때만 — 여기선 단순히 호출)
          fetch('/api/chat/read', { method: 'POST' }).catch(() => {});
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const m = payload.new as ChatMessage;
          setMessages(prev => prev.map(p => p.id === m.id ? { ...p, ...m } : p));
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_reactions' },
        (payload) => {
          const r = payload.new as ChatReaction;
          setReactions(prev => {
            if (prev.find(x => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)) {
              return prev;
            }
            return [...prev, r];
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_reactions' },
        (payload) => {
          const old = payload.old as Partial<ChatReaction>;
          setReactions(prev => prev.filter(x =>
            !(x.message_id === old.message_id && x.user_id === old.user_id && x.emoji === old.emoji),
          ));
        },
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [accessError]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await fetch(`/api/chat/messages?before=${encodeURIComponent(oldest.created_at)}&limit=50`);
      const data = await res.json();
      if (res.ok) {
        setMessages(prev => [...(data.messages || []), ...prev]);
        setReactions(prev => [...(data.reactions || []), ...prev]);
        setHasMore(data.hasMore);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, messages]);

  async function handleSend(content: string, imageUrls: string[], mentionedIds: string[]) {
    const res = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, image_urls: imageUrls, mentioned_ids: mentionedIds }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error || '전송 실패' };
    }
    if (data.profanityMasked) {
      showToast('일부 표현이 자동 필터링되어 전송되었습니다.');
    }
    // Realtime 이 INSERT 를 브로드캐스트하지만 즉시성을 위해 낙관적 추가
    if (data.message) {
      setMessages(prev => {
        if (prev.find(p => p.id === data.message.id)) return prev;
        return [...prev, data.message as ChatMessage];
      });
    }
    return { ok: true };
  }

  async function handleReact(messageId: string, emoji: string) {
    if (!currentUserId) return;
    // 낙관적 토글
    setReactions(prev => {
      const exists = prev.find(r => r.message_id === messageId && r.user_id === currentUserId && r.emoji === emoji);
      if (exists) {
        return prev.filter(r => !(r.message_id === messageId && r.user_id === currentUserId && r.emoji === emoji));
      }
      return [...prev, { message_id: messageId, user_id: currentUserId, emoji }];
    });
    try {
      await fetch(`/api/chat/messages/${messageId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
    } catch {
      // rollback on error — Realtime 이 보정해줌
    }
  }

  async function handleDelete(messageId: string) {
    const res = await fetch(`/api/chat/messages/${messageId}`, { method: 'DELETE' });
    if (res.ok) {
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, is_deleted: true } : m));
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || '삭제 실패');
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  if (accessError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-down font-semibold mb-2">{accessError}</p>
        <p className="text-dim text-sm">로그인 후 다시 시도해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] bg-surface rounded-2xl border border-border overflow-hidden">
      {initialLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : (
        <MessageList
          messages={messages}
          reactions={reactions}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onReact={handleReact}
          onDelete={handleDelete}
        />
      )}

      <MessageInput
        onSend={handleSend}
        disabled={!currentUserId || !!accessError}
      />

      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-surface border border-accent/50 text-text px-5 py-3 rounded-xl shadow-lg text-sm font-semibold">
          {toast}
        </div>
      )}
    </div>
  );
}
