'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

interface Props {
  onSend: (content: string, imageUrls: string[], mentionedIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  disabled?: boolean;
}

export default function MessageInput({ onSend, disabled }: Props) {
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function handleFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (images.length + files.length > 4) {
      setError('이미지는 최대 4장까지 첨부 가능합니다.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/chat/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || '업로드 실패');
          break;
        }
        setImages(prev => [...prev, data.url]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit() {
    const text = content.trim();
    if (!text && images.length === 0) return;
    if (sending) return;

    // @멘션 파싱: @username 형태로 입력된 토큰을 mentioned_ids 로 수집
    const mentions = Array.from(text.matchAll(/@([a-zA-Z0-9_\-.]+)/g)).map(m => m[1]);

    setSending(true);
    setError(null);
    const result = await onSend(text, images, Array.from(new Set(mentions)));
    setSending(false);
    if (result.ok) {
      setContent('');
      setImages([]);
      textRef.current?.focus();
    } else {
      setError(result.error || '전송 실패');
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-border bg-surface">
      {images.length > 0 && (
        <div className="flex gap-2 px-4 pt-3 flex-wrap">
          {images.map((url, i) => (
            <div key={i} className="relative group">
              <Image
                src={url}
                alt={`첨부 ${i + 1}`}
                width={72}
                height={72}
                className="w-18 h-18 object-cover rounded-lg border border-border"
                unoptimized
              />
              <button
                type="button"
                onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-down text-white text-xs rounded-full flex items-center justify-center hover:bg-opacity-90"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="px-4 pt-2 text-xs text-down">{error}</div>
      )}

      <div className="flex items-end gap-2 p-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading || images.length >= 4}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-dim hover:bg-bg rounded-lg transition disabled:opacity-40"
          title="이미지 첨부"
        >
          {uploading ? (
            <span className="inline-block w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          )}
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFile(e.target.files)}
        />

        <textarea
          ref={textRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={disabled ? '채팅을 이용할 수 없습니다' : '메시지 입력 (Enter 전송, Shift+Enter 줄바꿈, @로 멘션)'}
          disabled={disabled}
          rows={1}
          maxLength={2000}
          className="flex-1 resize-none px-3 py-2.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent max-h-32 disabled:opacity-50"
          style={{ minHeight: '40px' }}
        />

        <button
          type="button"
          onClick={submit}
          disabled={disabled || sending || (!content.trim() && images.length === 0)}
          className="flex-shrink-0 px-4 h-10 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover disabled:opacity-40 transition"
        >
          {sending ? '전송중' : '전송'}
        </button>
      </div>
    </div>
  );
}
