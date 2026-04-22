'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatReaction } from './types';
import MessageBubble from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  reactions: ChatReaction[];
  currentUserId: string | null;
  isAdmin: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onReact: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
}

export default function MessageList({
  messages, reactions, currentUserId, isAdmin, loadingMore, hasMore, onLoadMore, onReact, onDelete,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const prevLenRef = useRef<number>(messages.length);
  const prevScrollHeightRef = useRef<number>(0);

  // 리액션 그룹화: message_id -> { emoji -> users[] }
  const reactionMap = new Map<string, Map<string, string[]>>();
  for (const r of reactions) {
    if (!reactionMap.has(r.message_id)) reactionMap.set(r.message_id, new Map());
    const m = reactionMap.get(r.message_id)!;
    if (!m.has(r.emoji)) m.set(r.emoji, []);
    m.get(r.emoji)!.push(r.user_id);
  }

  // 스크롤 상태 감지
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtBottom(dist < 80);
      if (el.scrollTop < 200 && hasMore && !loadingMore) {
        prevScrollHeightRef.current = el.scrollHeight;
        onLoadMore();
      }
    };
    el.addEventListener('scroll', handler);
    return () => el.removeEventListener('scroll', handler);
  }, [hasMore, loadingMore, onLoadMore]);

  // 새 메시지 도착 시 하단 유지
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const grew = messages.length > prevLenRef.current;
    const growAmount = messages.length - prevLenRef.current;
    prevLenRef.current = messages.length;

    if (!grew) return;

    // 과거 메시지 prepend (배치 여러 개일 때) → 스크롤 위치 보정
    if (prevScrollHeightRef.current > 0 && growAmount > 1) {
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      el.scrollTop += diff;
      prevScrollHeightRef.current = 0;
      return;
    }

    // 신규 메시지(1개 추가) → 하단에 있었으면 자동 스크롤
    if (atBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, atBottom]);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        className="h-full overflow-y-auto px-2 py-3 space-y-0.5"
      >
        {loadingMore && (
          <div className="text-center text-xs text-dim py-2">이전 메시지 불러오는 중...</div>
        )}
        {!hasMore && messages.length > 0 && (
          <div className="text-center text-xs text-dim py-4">— 첫 메시지입니다 —</div>
        )}
        {messages.length === 0 && !loadingMore && (
          <div className="flex items-center justify-center h-full text-dim text-sm">
            아직 메시지가 없습니다. 첫 메시지를 남겨보세요!
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const sameAuthor = prev && prev.author_id === msg.author_id && !prev.is_deleted;
          const within3min = prev &&
            new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 3 * 60 * 1000;
          const showAuthor = !sameAuthor || !within3min;

          const mentionHit = currentUserId
            ? msg.mentioned_ids.includes(currentUserId)
            : false;

          const rm = reactionMap.get(msg.id);
          const reactionList = rm
            ? Array.from(rm.entries()).map(([emoji, users]) => ({ emoji, users }))
            : [];

          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              reactions={reactionList}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              showAuthor={showAuthor}
              onReact={onReact}
              onDelete={onDelete}
              mentionHighlight={mentionHit}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!atBottom && messages.length > 0 && (
        <button
          type="button"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-3 right-4 bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg hover:bg-accent-hover transition"
        >
          새 메시지 ↓
        </button>
      )}
    </div>
  );
}
