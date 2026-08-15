'use client';

import { useState, useEffect, useCallback } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';
import Pagination from '@/components/analytics/Pagination';

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  receiver_naver_id: string;
  receiver_name: string;
  content: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

type Box = 'inbox' | 'sent';

export default function MessagesPage() {
  const [box, setBox] = useState<Box>('inbox');
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ box, page: String(page), limit: '20' });
      const res = await fetch(`/api/messages?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(data.messages || []);
      setTotal(data.total || 0);
      setUnreadCount(data.unreadCount || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [box, page]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const handleExpand = async (msg: Message) => {
    if (expandedId === msg.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(msg.id);

    // 읽음 처리
    if (box === 'inbox' && !msg.is_read) {
      try {
        await fetch(`/api/messages/${msg.id}/read`, { method: 'PATCH' });
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch {
        // 무시
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div>
        <h1 className="type-page-title">쪽지함</h1>
        {box === 'inbox' && unreadCount > 0 && (
          <p className="text-xs text-accent font-semibold mt-0.5">안읽은 쪽지 {unreadCount}개</p>
        )}
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-2">
        <SegmentedFilter
          options={[
            { value: 'inbox' as Box, label: '받은 쪽지' },
            { value: 'sent' as Box, label: '보낸 쪽지' },
          ]}
          value={box}
          onChange={b => { setBox(b); setPage(1); setExpandedId(null); }}
        />
        <span className="text-xs text-dim ml-auto">
          {loading ? '로딩...' : `총 ${total}개`}
        </span>
      </div>

      {/* 메시지 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="xl" color="border-accent border-t-transparent" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-dim">{box === 'inbox' ? '받은 쪽지가 없습니다.' : '보낸 쪽지가 없습니다.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map(msg => (
            <div key={msg.id}>
              <button
                onClick={() => handleExpand(msg)}
                className={`w-full text-left bg-surface rounded-xl border p-4 hover:border-accent/30 transition cursor-pointer ${
                  !msg.is_read && box === 'inbox' ? 'border-accent/40 bg-accent/[0.03]' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {!msg.is_read && box === 'inbox' && (
                      <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                    )}
                    <span className="text-sm font-bold text-text">
                      {box === 'inbox' ? msg.sender_name : msg.receiver_name}
                    </span>
                  </div>
                  <span className="text-[11px] text-dim">{formatDate(msg.created_at)}</span>
                </div>
                <p className={`text-xs text-dim ${expandedId === msg.id ? '' : 'line-clamp-1'}`}>
                  {msg.content}
                </p>
              </button>

              {/* 펼쳐진 내용 */}
              {expandedId === msg.id && (
                <div className="bg-bg rounded-b-xl border border-t-0 border-border px-4 py-3 -mt-1">
                  <div className="text-xs text-dim mb-2">
                    {box === 'inbox' ? `보낸 사람: ${msg.sender_name}` : `받는 사람: ${msg.receiver_name}`}
                  </div>
                  <p className="text-sm text-text whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} variant="plain" />
    </div>
  );
}
