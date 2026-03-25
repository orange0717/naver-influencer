'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DemoModalProps {
  open: boolean;
  onClose: () => void;
}

function extractNaverId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return trimmed.replace(/^@/, '').toLowerCase();
}

export default function DemoModal({ open, onClose }: DemoModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [email, setEmail] = useState('');
  const [naverInput, setNaverInput] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setStep('form');
    setEmail('');
    setNaverInput('');
    setCode('');
    setError('');
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!email.trim() || !naverInput.trim()) {
      setError('모든 항목을 입력해주세요.');
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
      const res = await fetch('/api/auth/demo/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), naverId }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep('verify');
      } else {
        setError(data.error || '인증번호 발송에 실패했습니다.');
      }
    } catch {
      setError('인증번호 발송에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (code.length !== 6) {
      setError('6자리 인증번호를 입력해주세요.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/demo/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push('/my');
      } else {
        setError(data.error || '인증에 실패했습니다.');
      }
    } catch {
      setError('인증에 실패했습니다.');
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
        {step === 'form' ? (
          <form onSubmit={handleSendCode}>
            {/* 배지 */}
            <div className="text-center mb-6">
              <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent text-xs font-bold rounded-full">
                30일 무료
              </span>
            </div>

            <h2 className="text-lg font-bold text-text text-center mb-2">
              30일 데모체험을 시작하시겠습니까?
            </h2>
            <p className="text-sm text-dim text-center mb-8 leading-relaxed">
              이메일로 데모 인증번호를 보내드립니다.<br />
              인증 후 30일간 모든 기능을 무료로 이용할 수 있습니다.
            </p>

            <div className="space-y-3 mb-6">
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="이메일 주소 입력"
                className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                required
              />
              <input
                type="text"
                value={naverInput}
                onChange={e => { setNaverInput(e.target.value); setError(''); }}
                placeholder="인플루언서홈 주소 또는 ID (예: in.naver.com/myid)"
                className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
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
                {loading ? '발송 중...' : '인증번호 받기'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <div className="text-center mb-6">
              <span className="inline-block px-4 py-1.5 bg-accent/10 text-accent text-xs font-bold rounded-full">
                인증번호 확인
              </span>
            </div>

            <h2 className="text-lg font-bold text-text text-center mb-2">
              인증번호를 입력해주세요
            </h2>
            <p className="text-sm text-dim text-center mb-8">
              <span className="font-semibold text-text">{email}</span>으로 발송된<br />
              6자리 인증번호를 입력해주세요.
            </p>

            <input
              type="text"
              value={code}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                setError('');
              }}
              placeholder="인증번호 6자리"
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-center text-lg font-bold tracking-[0.3em] text-text placeholder:text-dim placeholder:tracking-normal placeholder:text-sm placeholder:font-normal focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent mb-3"
              maxLength={6}
              autoFocus
            />

            <p className="text-xs text-dim text-center mb-6">
              인증번호가 오지 않았나요?{' '}
              <button
                type="button"
                onClick={() => { setStep('form'); setCode(''); setError(''); }}
                className="text-accent font-semibold hover:underline"
              >
                다시 발송
              </button>
            </p>

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
                disabled={loading || code.length !== 6}
                className="flex-1 px-4 py-3 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition disabled:opacity-50"
              >
                {loading ? '확인 중...' : '데모 시작'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
