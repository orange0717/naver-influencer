'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUnreadCount, useNotifications, useMarkAsRead, type NotificationItem } from '@/hooks/useNotifications';

const typeConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  new_top3: { label: 'TOP3 진입', color: 'text-gold', bgColor: 'bg-gold/15' },
  lost_top3: { label: 'TOP3 이탈', color: 'text-down', bgColor: 'bg-down/15' },
  rank_up_significant: { label: '상승', color: 'text-up', bgColor: 'bg-up/15' },
  rank_down_significant: { label: '하락', color: 'text-down', bgColor: 'bg-down/15' },
  momentum_up: { label: '상승 모멘텀', color: 'text-up', bgColor: 'bg-up/15' },
  top3_opportunity: { label: 'TOP3 기회', color: 'text-gold', bgColor: 'bg-gold/15' },
  new_notice: { label: '공지사항', color: 'text-accent', bgColor: 'bg-accent/15' },
  community_comment: { label: '댓글', color: 'text-text', bgColor: 'bg-dim/10' },
  community_like: { label: '좋아요', color: 'text-down', bgColor: 'bg-down/10' },
};

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

function NotificationRow({ item, onRead }: { item: NotificationItem; onRead: (id: string) => Promise<void> }) {
  const router = useRouter();
  const config = typeConfig[item.notification_type] || { label: '알림', color: 'text-dim', bgColor: 'bg-dim/10' };
  const keywordId = item.metadata?.keyword_id as string | undefined;
  const noticeId = item.metadata?.notice_id as string | undefined;
  const postId = item.metadata?.post_id as string | undefined;

  // 알림 타입에 따른 링크 결정
  const targetHref = keywordId
    ? `/keywords/${keywordId}`
    : noticeId
      ? `/notice/${noticeId}`
      : postId
        ? `/community/${postId}`
        : null;

  const handleClick = async (e: React.MouseEvent) => {
    if (targetHref) {
      // race condition 방지: mutate 완료 후 라우팅
      e.preventDefault();
      if (!item.is_read) {
        try {
          await onRead(item.id);
        } catch { /* ignore */ }
      }
      router.push(targetHref);
    } else if (!item.is_read) {
      onRead(item.id).catch(() => {});
    }
  };

  const innerContent = (
    <>
      {/* 읽지 않음 표시 */}
      <div className="pt-1.5 shrink-0">
        {!item.is_read ? (
          <div className="w-2 h-2 rounded-full bg-accent" />
        ) : (
          <div className="w-2 h-2" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
            {config.label}
          </span>
          <span className="text-[10px] text-dim">{timeAgo(item.created_at)}</span>
        </div>
        <p className="text-sm font-semibold text-text truncate">{item.title}</p>
        <p className="text-xs text-dim truncate">{item.body}</p>
      </div>
    </>
  );

  const rowClass = `flex items-start gap-2.5 px-4 py-3 hover:bg-bg/80 transition cursor-pointer ${!item.is_read ? 'bg-accent/5' : ''}`;

  if (targetHref) {
    return (
      <Link href={targetHref} onClick={handleClick} className={rowClass}>
        {innerContent}
      </Link>
    );
  }
  return (
    <div className={rowClass} onClick={handleClick}>
      {innerContent}
    </div>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: unreadCount = 0 } = useUnreadCount();
  const { data } = useNotifications(1, open);
  const markAsRead = useMarkAsRead();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const notifications = data?.notifications || [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-surface-hover transition cursor-pointer relative"
        title="알림"
        aria-label="알림"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-text-2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-down text-white text-[10px] font-bold rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-surface rounded-xl border border-border shadow-lg z-50 overflow-hidden">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-bold">알림</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAsRead.mutate(undefined)}
                  className="text-xs text-accent hover:underline cursor-pointer"
                >
                  전체 읽음
                </button>
              )}
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="text-xs text-dim hover:text-text"
              >
                설정
              </Link>
            </div>
          </div>

          {/* 알림 목록 */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-dim text-sm">
                새로운 알림이 없습니다
              </div>
            ) : (
              notifications.map(item => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onRead={async (id) => { await markAsRead.mutateAsync(id); }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
