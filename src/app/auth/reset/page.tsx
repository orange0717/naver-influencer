'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAuthed(!!user);
      setAuthChecked(true);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message || '비밀번호 변경에 실패했습니다.');
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/my'), 1500);
    } catch {
      setError('비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[75vh] flex items-start sm:items-center justify-center pt-10 pb-10">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
              N
            </div>
            <h1 className="text-2xl font-extrabold">새 비밀번호 설정</h1>
            <p className="text-sm text-dim mt-1">사용할 새 비밀번호를 입력해주세요</p>
          </div>

          {!authed ? (
            <div className="space-y-4">
              <div className="bg-down/10 border border-down/30 rounded-xl p-4 text-sm text-down leading-relaxed text-center">
                재설정 링크가 만료되었거나 잘못된 접근입니다. 비밀번호 찾기를 다시 진행해주세요.
              </div>
              <Link href="/auth/forgot" className="block w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl text-center transition cursor-pointer">
                비밀번호 찾기로 이동
              </Link>
            </div>
          ) : done ? (
            <div className="bg-up/10 border border-up/30 rounded-xl p-4 text-sm text-text leading-relaxed text-center">
              <strong className="block mb-1">비밀번호가 변경되었습니다.</strong>
              <span className="text-dim">잠시 후 대시보드로 이동합니다.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dim block mb-1.5">새 비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="6자 이상 입력해주세요"
                  autoFocus
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호 확인</label>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호를 다시 입력해주세요"
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
                    저장 중...
                  </span>
                ) : '비밀번호 변경'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
