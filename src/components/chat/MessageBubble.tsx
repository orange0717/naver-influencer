'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { ChatMessage } from './types';
import ReactionBar from './ReactionBar';
import EmojiPicker from './EmojiPicker';
import ReportModal from './ReportModal';

interface Props {
  message: ChatMessage;
  reactions: { emoji: string; users: string[] }[];
  currentUserId: string | null;
  isAdmin: boolean;
  showAuthor: boolean;               // 이전 메시지와 작성자 다를 때만 true
  onReact: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  mentionHighlight?: boolean;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const hh = h % 12 || 12;
  return `${ampm} ${hh}:${String(m).padStart(2, '0')}`;
}

export default function MessageBubble({
  message, reactions, currentUserId, isAdmin, showAuthor, onReact, onDelete, mentionHighlight,
}: Props) {
  const [showActions, setShowActions] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const isMine = currentUserId === message.author_id;

  if (message.is_deleted) {
    return (
      <div className="px-2 py-1 text-xs text-dim italic">
        {isMine ? '(삭제된 메시지)' : '(삭제되었거나 신고로 숨겨진 메시지)'}
      </div>
    );
  }

  // 링크 자동 변환 + 줄바꿈 유지
  const renderContent = (text: string) => {
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((p, i) => {
      if (/^https?:\/\//.test(p)) {
        return (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all">
            {p}
          </a>
        );
      }
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <div
      className={`group relative px-2 py-1 rounded-lg transition ${
        mentionHighlight ? 'bg-accent/10' : 'hover:bg-bg/50'
      }`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setEmojiOpen(false); }}
    >
      <div className="flex gap-3">
        {/* 아바타 */}
        <div className="w-9 flex-shrink-0">
          {showAuthor ? (
            message.author_avatar_url ? (
              <Image
                src={message.author_avatar_url}
                alt={message.author_name}
                width={36}
                height={36}
                className="rounded-full object-cover"
                unoptimized
              />
            ) : (
              <div className="w-9 h-9 bg-accent/20 rounded-full flex items-center justify-center text-sm font-bold text-accent">
                {message.author_name.slice(0, 1)}
              </div>
            )
          ) : (
            <div className="w-9 opacity-0 group-hover:opacity-100 text-[10px] text-dim text-right pt-1 transition">
              {formatTime(message.created_at).replace('오전 ', '').replace('오후 ', '').slice(0, 5)}
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 min-w-0">
          {showAuthor && (
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="font-bold text-sm text-text">{message.author_name}</span>
              {message.author_type === 'admin' && (
                <span className="text-[10px] bg-accent text-white px-1.5 py-0.5 rounded">관리자</span>
              )}
              <span className="text-[11px] text-dim">{formatTime(message.created_at)}</span>
              {message.is_edited && <span className="text-[10px] text-dim">(수정됨)</span>}
            </div>
          )}

          {message.content && (
            <div className="text-sm text-text whitespace-pre-wrap break-words">
              {renderContent(message.content)}
            </div>
          )}

          {message.image_urls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1.5">
              {message.image_urls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(url)}
                  className="block max-w-[200px] rounded-lg overflow-hidden border border-border hover:opacity-90 transition"
                >
                  <Image
                    src={url}
                    alt="첨부"
                    width={200}
                    height={200}
                    className="object-cover max-h-[200px]"
                    unoptimized
                  />
                </button>
              ))}
            </div>
          )}

          <ReactionBar
            messageId={message.id}
            reactions={reactions}
            currentUserId={currentUserId}
            onToggle={(emoji) => onReact(message.id, emoji)}
          />
        </div>
      </div>

      {/* 액션 메뉴 */}
      {showActions && (
        <div className="absolute top-0 right-2 -translate-y-1/2 bg-surface border border-border rounded-lg shadow-sm flex items-center gap-0.5 px-1 py-0.5">
          <button
            type="button"
            onClick={() => setEmojiOpen(v => !v)}
            className="w-7 h-7 flex items-center justify-center text-sm hover:bg-bg rounded transition"
            title="리액션"
          >
            😀
          </button>
          {!isMine && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="w-7 h-7 flex items-center justify-center text-xs text-dim hover:bg-bg rounded transition"
              title="신고"
            >
              ⚠
            </button>
          )}
          {(isMine || isAdmin) && (
            <button
              type="button"
              onClick={() => {
                if (confirm('이 메시지를 삭제하시겠습니까?')) onDelete(message.id);
              }}
              className="w-7 h-7 flex items-center justify-center text-xs text-down hover:bg-down/10 rounded transition"
              title="삭제"
            >
              🗑
            </button>
          )}
          {emojiOpen && (
            <EmojiPicker
              onPick={(emoji) => onReact(message.id, emoji)}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>
      )}

      {reportOpen && (
        <ReportModal
          messageId={message.id}
          onClose={() => setReportOpen(false)}
          onSubmitted={() => { /* 토스트는 부모에서 */ }}
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <Image
            src={lightbox}
            alt="확대 이미지"
            width={1200}
            height={1200}
            className="max-w-full max-h-full object-contain"
            unoptimized
          />
        </div>
      )}
    </div>
  );
}
