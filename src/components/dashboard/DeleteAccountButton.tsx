'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

const REASONS = [
  '서비스가 불편해서',
  '가격이 부담되서',
  '원하는 기능이 없어서',
  '불친절해서',
  '다른 서비스를 이용하기 위해서',
  '기타',
];

export default function DeleteAccountButton() {
  const [step, setStep] = useState<'idle' | 'reason' | 'confirm' | 'loading'>('idle');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const handleDelete = async () => {
    setStep('loading');
    setError('');

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const finalReason = reason === '기타' ? customReason || '기타' : reason;

      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ reason: finalReason }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '회원탈퇴에 실패했습니다.');
        setStep('confirm');
        return;
      }

      await supabase.auth.signOut();
      window.location.href = '/';
    } catch {
      setError('회원탈퇴에 실패했습니다.');
      setStep('confirm');
    }
  };

  if (step === 'idle') {
    return (
      <div className="border-t border-border/50 pt-8 mt-10 text-center">
        <button
          onClick={() => setStep('reason')}
          className="px-6 py-2.5 bg-[#F2CBBD] text-[#8B6055] text-sm font-semibold rounded-lg hover:bg-[#E8B8A8] transition cursor-pointer"
        >
          회원탈퇴
        </button>
      </div>
    );
  }

  if (step === 'reason') {
    return (
      <div className="border-t border-border/50 pt-6 mt-8">
        <div className="bg-surface border border-border rounded-xl p-5 max-w-md">
          <p className="text-sm font-bold mb-3">탈퇴하시려는 이유를 알려주세요</p>
          <p className="text-xs text-dim mb-4">더 나은 서비스를 만드는 데 참고하겠습니다.</p>
          <div className="space-y-2 mb-4">
            {REASONS.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-accent"
                />
                <span className="text-sm">{r}</span>
              </label>
            ))}
          </div>
          {reason === '기타' && (
            <textarea
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              placeholder="탈퇴 사유를 입력해주세요..."
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent mb-4 resize-none"
              rows={3}
            />
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setStep('idle'); setReason(''); setCustomReason(''); }}
              className="px-4 py-2 bg-bg border border-border text-dim text-xs font-semibold rounded-lg hover:text-text transition cursor-pointer"
            >
              취소
            </button>
            <button
              onClick={() => setStep('confirm')}
              disabled={!reason}
              className="px-4 py-2 bg-[#CC6B7C] text-white text-xs font-semibold rounded-lg hover:bg-[#B55A6A] transition cursor-pointer disabled:opacity-30"
            >
              다음
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/50 pt-6 mt-8">
      <div className="bg-down/5 border border-down/20 rounded-xl p-5 max-w-md">
        <p className="text-sm font-bold text-down mb-2">정말 탈퇴하시겠습니까?</p>
        <p className="text-xs text-dim mb-4 leading-relaxed">
          탈퇴 시 계정 정보가 영구 삭제되며 복구할 수 없습니다.
          대시보드 데이터, 댓글 등 모든 활동 내역이 삭제됩니다.
        </p>

        {error && (
          <p className="text-xs text-down mb-3">{error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => { setStep('idle'); setError(''); setReason(''); setCustomReason(''); }}
            disabled={step === 'loading'}
            className="px-4 py-2 bg-bg border border-border text-dim text-xs font-semibold rounded-lg hover:text-text transition cursor-pointer disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleDelete}
            disabled={step === 'loading'}
            className="px-4 py-2 bg-down text-white text-xs font-semibold rounded-lg hover:bg-down/80 transition cursor-pointer disabled:opacity-50"
          >
            {step === 'loading' ? '처리 중...' : '탈퇴하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
