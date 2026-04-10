'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Message {
  id: string;
  sender_name: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export default function DashboardMessages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/messages?box=inbox&limit=5')
      .then(res => res.json())
      .then(data => {
        setMessages(data.messages || []);
        setUnreadCount(data.unreadCount || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold">
          쪽지
          {unreadCount > 0 && (
            <span className="ml-2 text-xs bg-accent text-white px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </h3>
        <Link href="/messages" className="text-xs text-accent hover:underline">
          전체 보기
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-dim text-center py-4">불러오는 중...</p>
      ) : messages.length === 0 ? (
        <div className="text-center py-6 text-sm text-dim">
          <p>받은 쪽지가 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map(msg => (
            <Link
              key={msg.id}
              href="/messages"
              className={`block p-3 rounded-xl transition text-sm ${
                msg.is_read
                  ? 'bg-bg hover:bg-border/30'
                  : 'bg-accent/5 border border-accent/20 hover:bg-accent/10'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold text-xs ${msg.is_read ? 'text-dim' : 'text-text'}`}>
                  {msg.sender_name || '익명'}
                </span>
                <span className="text-[10px] text-dim">{formatTime(msg.created_at)}</span>
              </div>
              <p className={`text-xs truncate ${msg.is_read ? 'text-dim' : 'text-text'}`}>
                {msg.content}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function formatTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
