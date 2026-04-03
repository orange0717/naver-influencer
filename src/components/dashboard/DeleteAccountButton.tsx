'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function DeleteAccountButton() {
  const [step, setStep] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setStep('loading');
    setError('');

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '회원탈퇴에 실패했습니다.');
        setStep('confirm');
        return;
      }

      // 로그아웃 처리 후 홈으로 이동
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
          onClick={() => setStep('confirm')}
          className="px-6 py-2.5 bg-[#CC6B7C] text-white text-sm font-semibold rounded-lg hover:bg-[#B55A6A] transition cursor-pointer"
        >
          회원탈퇴
        </button>
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
            onClick={() => { setStep('idle'); setError(''); }}
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
