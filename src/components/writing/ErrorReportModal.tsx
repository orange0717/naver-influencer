'use client';

import { useEffect, useState } from 'react';

export interface ReportPayload {
  tool: string;
  original: string;
  replacement: string;
  category: string;
}

interface Props {
  open: boolean;
  payload: ReportPayload | null;
  onClose: () => void;
}

const WORKER_URL = 'https://jolly-term-4055.orange-e65.workers.dev';

/**
 * OrangeRefine 의 error-report.js 를 React 컴포넌트로 포팅.
 * 오렌지리파인 Supabase 의 error_reports 테이블에 통합 저장돼
 * 양 서비스 규칙·프롬프트 개선에 같이 반영된다.
 */
export default function ErrorReportModal({ open, payload, onClose }: Props) {
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
      setComment('');
      setSuccess(false);
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  async function submit() {
    if (!payload) return;
    if (!reason) {
      setError('제보 유형을 선택해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch(`${WORKER_URL}/api/report-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: payload.tool,
          original: payload.original,
          replacement: payload.replacement,
          category: payload.category,
          reason,
          correct_form: comment,
          source: typeof window !== 'undefined' ? window.location.href : 'ninfl',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || '제보 저장에 실패했습니다.');
      }
      setSuccess(true);
      setTimeout(onClose, 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : '제보 저장 실패');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !payload) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center px-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl p-6 sm:p-7 w-full max-w-md shadow-2xl">
        {!success ? (
          <>
            <h2 className="text-lg font-extrabold text-text">오류 제보</h2>
            <p className="text-xs text-dim mt-1 mb-4">
              교정 결과가 정확하지 않다면 알려주세요. 서비스 품질 개선에 반영됩니다.
            </p>

            <div className="flex items-center gap-2 p-3 bg-accent/5 rounded-lg mb-3 text-sm flex-wrap">
              <span className="text-red-600 line-through font-bold">{payload.original}</span>
              <span className="text-dim">→</span>
              <span className="text-green-700 font-bold">{payload.replacement}</span>
            </div>

            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-2 bg-bg text-text focus:outline-none focus:border-accent"
            >
              <option value="">제보 유형을 선택하세요</option>
              <option value="wrong_correction">교정이 틀립니다 (원래 표현이 맞음)</option>
              <option value="better_correction">더 적절한 교정이 있습니다</option>
              <option value="missed_error">놓친 오류가 있습니다</option>
              <option value="other">기타</option>
            </select>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="자세한 내용을 적어주세요 (선택사항)"
              maxLength={2000}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-3 bg-bg text-text h-20 resize-none focus:outline-none focus:border-accent"
            />

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-3">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg bg-bg text-dim text-sm font-semibold hover:bg-border transition-colors disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={submit}
                disabled={submitting || !reason}
                className="flex-1 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {submitting ? '전송 중…' : '제보하기'}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="text-sm font-bold text-text">제보해주셔서 감사합니다.</div>
            <div className="text-xs text-dim mt-1">품질 개선에 반영하겠습니다.</div>
          </div>
        )}
      </div>
    </div>
  );
}
