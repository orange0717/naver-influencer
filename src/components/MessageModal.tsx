'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';

interface MessageModalProps {
  receiverNaverId: string;
  receiverName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function MessageModal({ receiverNaverId, receiverName, isOpen, onClose }: MessageModalProps) {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSend = async () => {
    if (!content.trim()) return;
    setSending(true);
    setResult(null);

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverNaverId, content: content.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ type: 'error', text: data.error || '발송 실패' });
        return;
      }

      setResult({ type: 'success', text: '쪽지를 보냈습니다.' });
      setContent('');
      setTimeout(() => {
        onClose();
        setResult(null);
      }, 1500);
    } catch {
      setResult({ type: 'error', text: '네트워크 오류가 발생했습니다.' });
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setContent('');
    setResult(null);
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={handleClose} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
      <div className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md mx-4 p-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">쪽지 보내기</h3>
          <button onClick={handleClose} className="text-dim hover:text-text transition cursor-pointer text-lg">&times;</button>
        </div>

        {/* 수신자 */}
        <div className="bg-bg rounded-lg px-3 py-2 mb-4">
          <span className="text-xs text-dim">받는 사람:</span>
          <span className="text-sm font-semibold text-text ml-2">{receiverName}</span>
        </div>

        {/* 내용 */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value.slice(0, 2000))}
          placeholder="쪽지 내용을 입력하세요..."
          rows={6}
          className="w-full px-3 py-2.5 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim resize-none focus:outline-none focus:border-accent transition-colors"
        />
        <div className="flex items-center justify-between mt-1 mb-4">
          <span className="text-[11px] text-dim">{content.length} / 2,000</span>
          {result && (
            <span className={`text-xs font-semibold ${result.type === 'success' ? 'text-up' : 'text-down'}`}>
              {result.text}
            </span>
          )}
        </div>

        {/* 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={handleSend}
            disabled={!content.trim() || sending}
            className="flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {sending ? '발송 중...' : '보내기'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
