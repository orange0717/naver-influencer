'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [influencerLink, setInfluencerLink] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();

  const extractNaverId = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    const match = trimmed.match(/in\.naver\.com\/([^/?#]+)/);
    if (match) return match[1].toLowerCase();
    return trimmed.replace(/^@/, '').toLowerCase();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }
    if (!extractNaverId(influencerLink)) {
      setError('인플루언서 링크를 입력해주세요.');
      return;
    }
    if (!agreeTerms || !agreePrivacy) {
      setError('이용약관과 개인정보처리방침에 동의해주세요.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else {
          setError(authError.message);
        }
        return;
      }

      // 인플루언서 링크가 입력된 경우 자동 연결
      const naverId = extractNaverId(influencerLink);
      if (naverId) {
        try {
          await fetch('/api/my/link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ naverId }),
          });
        } catch { /* 연결 실패해도 로그인은 계속 진행 */ }
      }

      // 로그인 성공 → 대시보드로 이동
      router.push('/my');
      router.refresh();
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const previewId = extractNaverId(influencerLink);

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-sm mx-auto px-4">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          {/* ─── 헤더 ─── */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
              N
            </div>
            <h1 className="text-2xl font-extrabold">N인플 로그인</h1>
            <p className="text-sm text-dim mt-1">이메일과 비밀번호를 입력해주세요</p>
          </div>

          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="비밀번호를 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">
                인플루언서 링크
              </label>
              <input
                type="text"
                value={influencerLink}
                onChange={e => setInfluencerLink(e.target.value)}
                placeholder="https://in.naver.com/아이디 또는 아이디"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
              {previewId && (
                <p className="text-[10px] text-accent mt-1">
                  in.naver.com/{previewId} 계정을 연결합니다
                </p>
              )}
            </div>

            {/* 약관 동의 */}
            <div className="space-y-2 pt-1">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={e => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border accent-accent cursor-pointer"
                />
                <span className="text-xs text-dim leading-relaxed">
                  <Link href="/terms" target="_blank" className="text-accent underline hover:text-accent-hover">이용약관</Link>에 동의합니다
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={e => setAgreePrivacy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border accent-accent cursor-pointer"
                />
                <span className="text-xs text-dim leading-relaxed">
                  <Link href="/privacy" target="_blank" className="text-accent underline hover:text-accent-hover">개인정보처리방침</Link>에 동의합니다
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !agreeTerms || !agreePrivacy}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : (
                '로그인'
              )}
            </button>
          </form>

          <p className="text-[10px] text-dim text-center leading-relaxed">
            아직 계정이 없으신가요?{' '}
            <Link href="/auth/signup" className="text-accent underline hover:text-accent-hover">
              회원가입
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
