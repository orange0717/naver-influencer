'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

function timeAgo(dateStr: string): string {
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

interface Message {
  id: string;
  sender_name: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export default function MessageBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 안읽은 쪽지 수 폴링
  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await fetch('/api/messages?box=inbox&limit=5');
        if (!res.ok) return;
        const data = await res.json();
        setUnreadCount(data.unreadCount || 0);
        setMessages(data.messages || []);
      } catch {
        // 미로그인 등 무시
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 60000); // 1분마다
    return () => clearInterval(interval);
  }, []);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleRead = async (id: string) => {
    try {
      await fetch(`/api/messages/${id}/read`, { method: 'PATCH' });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // 무시
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-accent/10 transition-colors cursor-pointer"
        aria-label="쪽지함"
      >
        {/* 편지 아이콘 */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-dim">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M22 7l-10 7L2 7" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface rounded-xl border border-border shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-bold">쪽지함</span>
            <Link href="/messages" className="text-[11px] text-accent font-semibold hover:underline" onClick={() => setOpen(false)}>
              전체 보기
            </Link>
          </div>

          {messages.length === 0 ? (
            <div className="py-8 text-center text-xs text-dim">받은 쪽지가 없습니다</div>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  onClick={() => { if (!msg.is_read) handleRead(msg.id); }}
                  className={`px-4 py-3 border-b border-border/30 hover:bg-bg/50 transition-colors cursor-pointer ${
                    !msg.is_read ? 'bg-accent/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-text">{msg.sender_name || '익명'}</span>
                    <span className="text-[10px] text-dim">{timeAgo(msg.created_at)}</span>
                  </div>
                  <p className="text-xs text-dim line-clamp-2">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
