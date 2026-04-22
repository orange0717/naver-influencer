'use client';

import { useState } from 'react';

const REASONS = [
  { value: 'spam', label: '스팸/광고' },
  { value: 'abuse', label: '욕설/비방' },
  { value: 'inappropriate', label: '부적절한 콘텐츠' },
  { value: 'other', label: '기타' },
] as const;

interface Props {
  messageId: string;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function ReportModal({ messageId, onClose, onSubmitted }: Props) {
  const [reason, setReason] = useState<string>('spam');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/messages/${messageId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '신고 실패');
        return;
      }
      onSubmitted();
      onClose();
    } catch {
      setError('네트워크 오류');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-border p-6 max-w-sm w-full space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-bold text-text">메시지 신고</h3>
        <div className="space-y-2">
          {REASONS.map(r => (
            <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="report-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={e => setReason(e.target.value)}
              />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="추가 설명 (선택, 500자 이내)"
          maxLength={500}
          rows={3}
          className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/50 focus:outline-none focus:border-accent resize-none"
        />
        {error && <p className="text-sm text-down">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-dim hover:text-text transition"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 bg-down text-white text-sm font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            {submitting ? '전송 중...' : '신고하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
