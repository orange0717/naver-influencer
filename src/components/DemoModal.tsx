'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DemoModalProps {
  open: boolean;
  onClose: () => void;
}

function extractNaverId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9._-]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return trimmed.replace(/^@/, '').toLowerCase();
}

export default function DemoModal({ open, onClose }: DemoModalProps) {
  const router = useRouter();
  const [naverInput, setNaverInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setNaverInput('');
    setError('');
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!naverInput.trim()) {
      setError('인플루언서 ID를 입력해주세요.');
      return;
    }
    const naverId = extractNaverId(naverInput);
    if (!naverId) {
      setError('올바른 인플루언서 ID 또는 URL을 입력해주세요.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/demo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/my');
      } else {
        setError(data.error || '데모 시작에 실패했습니다.');
      }
    } catch {
      setError('데모 시작에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      {/* 백드롭 */}
      <div className="absolute inset-0 bg-black/50" />

      {/* 모달 */}
      <div
        className="relative bg-bg rounded-2xl border border-border shadow-xl w-full max-w-md p-8"
        onClick={e => e.stopPropagation()}
      >
        <form onSubmit={handleStart}>
          {/* 배지 */}
          <div className="text-center mb-6">
            <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent text-xs font-bold rounded-full">
              7일 무료
            </span>
          </div>

          <h2 className="text-lg font-bold text-text text-center mb-2">
            7일 데모체험을 시작하시겠습니까?
          </h2>
          <p className="text-sm text-dim text-center mb-8 leading-relaxed">
            인플루언서 ID를 입력하면<br />
            7일간 모든 기능을 무료로 이용할 수 있습니다.
          </p>

          <div className="mb-6">
            <input
              type="text"
              value={naverInput}
              onChange={e => { setNaverInput(e.target.value); setError(''); }}
              placeholder="인플루언서홈 주소 또는 ID (예: in.naver.com/myid)"
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              autoFocus
              required
            />
          </div>

          {error && <p className="text-xs text-down text-center mb-4">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-semibold text-dim hover:bg-surface transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition disabled:opacity-50"
            >
              {loading ? '확인 중...' : '데모 시작'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
