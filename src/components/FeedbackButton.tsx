'use client';
import Modal from '@/components/ui/Modal';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import FilterPills from '@/components/analytics/FilterPills';

const CATEGORIES = [
  { value: 'bug', label: '버그 신고' },
  { value: 'feature', label: '기능 요청' },
  { value: 'general', label: '기타 의견' },
];

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const pathname = usePathname();

  const handleClose = useCallback(() => {
    setOpen(false);
    setError('');
  }, []);

  // Escape 키로 모달 닫기
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, handleClose]);

  // 외부(ChatBot 등)에서 열기 위한 커스텀 이벤트 리스너
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener('open-feedback', handleOpen);
    return () => window.removeEventListener('open-feedback', handleOpen);
  }, []);

  const handleSubmit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          message: message.trim(),
          pageUrl: pathname,
        }),
      });

      if (res.ok) {
        setDone(true);
        setTimeout(() => {
          setOpen(false);
          setDone(false);
          setMessage('');
          setCategory('general');
          setError('');
        }, 1500);
      } else {
        setError('전송에 실패했습니다. 다시 시도해주세요.');
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* 플로팅 버튼은 ChatBot 헤더로 통합됨 — 'open-feedback' 이벤트로 호출 */}

      {/* 모달 */}
      <Modal
        open={open}
        onClose={handleClose}
        closeOnEscape
        trapFocus
        role="dialog"
        ariaModal
        ariaLabelledBy="feedback-title"
        overlayClassName="fixed inset-0 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      >
        <div className="bg-surface rounded-t-2xl sm:rounded-lg border border-border w-full sm:max-w-md mx-0 sm:mx-4 p-6 shadow-lg animate-fade-in-up">
            {done ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto rounded-full bg-up/15 flex items-center justify-center text-up mb-3">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
                <p className="font-bold text-text">피드백을 보냈습니다</p>
                <p className="text-xs text-dim mt-1">소중한 의견 감사합니다</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 id="feedback-title" className="font-bold text-base">피드백 보내기</h3>
                  <button
                    onClick={handleClose}
                    className="w-8 h-8 rounded-lg hover:bg-border/30 flex items-center justify-center text-dim cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40"
                    aria-label="닫기"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>

                <FilterPills
                  className="mb-3"
                  options={CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
                  value={category}
                  onChange={setCategory}
                />

                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="개선 사항이나 버그를 알려주세요..."
                  rows={4}
                  maxLength={1000}
                  className="w-full px-3 py-2.5 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent resize-none"
                  autoFocus
                />

                {error && (
                  <p className="text-xs text-down mt-2">{error}</p>
                )}

                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-dim">{message.length}/1000</span>
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || sending}
                    className="px-5 py-2 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover transition disabled:opacity-40 cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40"
                  >
                    {sending ? '전송 중...' : '보내기'}
                  </button>
                </div>
              </>
            )}
        </div>
      </Modal>
    </>
  );
}
