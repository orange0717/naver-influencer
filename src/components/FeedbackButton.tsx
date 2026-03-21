'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

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
  const pathname = usePathname();

  const handleSubmit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);

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
        }, 1500);
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 w-11 h-11 rounded-full bg-accent text-white shadow-lg hover:bg-accent-hover transition flex items-center justify-center cursor-pointer"
        title="피드백 보내기"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* 모달 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-surface rounded-t-2xl sm:rounded-2xl border border-border w-full sm:max-w-md mx-0 sm:mx-4 p-6 shadow-2xl animate-fade-in-up">
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
                  <h3 className="font-bold text-base">피드백 보내기</h3>
                  <button
                    onClick={() => setOpen(false)}
                    className="w-8 h-8 rounded-lg hover:bg-border/30 flex items-center justify-center text-dim cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>

                <div className="flex gap-1.5 mb-3">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setCategory(c.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        category === c.value
                          ? 'bg-accent text-white'
                          : 'bg-border/30 text-dim hover:bg-border/50'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="개선 사항이나 버그를 알려주세요..."
                  rows={4}
                  maxLength={1000}
                  className="w-full px-3 py-2.5 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent resize-none"
                  autoFocus
                />

                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-dim">{message.length}/1000</span>
                  <button
                    onClick={handleSubmit}
                    disabled={!message.trim() || sending}
                    className="px-5 py-2 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover transition disabled:opacity-40 cursor-pointer"
                  >
                    {sending ? '전송 중...' : '보내기'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
