'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim();
    if (!trimmed) {
      setError('가입하신 이메일을 입력해주세요.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('올바른 이메일 형식을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/reset`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
      if (resetError) {
        setError(resetError.message || '메일 발송에 실패했습니다.');
        return;
      }
      setSent(true);
    } catch {
      setError('메일 발송 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-start sm:items-center justify-center pt-10 pb-10">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="bg-surface rounded-lg border border-border p-8 space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
              N
            </div>
            <h1 className="text-2xl font-extrabold">비밀번호 찾기</h1>
            <p className="text-sm text-dim mt-1">가입하신 이메일로 재설정 링크를 보내드립니다</p>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="bg-up/10 border border-up/30 rounded-xl p-4 text-sm text-text leading-relaxed">
                <strong className="block mb-1">메일을 발송했습니다.</strong>
                <span className="text-dim">{email.trim()} 으로 비밀번호 재설정 링크를 보냈습니다. 메일함(스팸함 포함)을 확인해주세요.</span>
              </div>
              <Link href="/auth/login" className="block w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl text-center transition cursor-pointer">
                로그인으로 돌아가기
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  autoFocus
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
                />
              </div>

              {error && (
                <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    메일 발송 중...
                  </span>
                ) : '재설정 메일 받기'}
              </button>

              <p className="text-xs text-dim text-center leading-relaxed pt-2">
                N인플은 이메일이 곧 아이디입니다. 가입하신 이메일이 기억나지 않으면{' '}
                <Link href="/contact" className="text-accent underline hover:text-accent-hover">고객센터</Link>로 문의해주세요.
              </p>

              <p className="text-sm text-dim text-center">
                <Link href="/auth/login" className="text-accent underline hover:text-accent-hover">로그인으로 돌아가기</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
