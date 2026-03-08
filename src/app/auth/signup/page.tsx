'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      // 1. Supabase Auth 회원가입
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // 2. users 테이블에 프로필 생성
      if (authData.user) {
        await supabase.from('users').insert({
          auth_id: authData.user.id,
          email,
          nickname: nickname.trim(),
          point_balance: 100, // 가입 보너스
        });
      }

      router.push('/my');
      router.refresh();
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">N</div>
          <h1 className="text-2xl font-extrabold">회원가입</h1>
          <p className="text-sm text-dim mt-1">무료로 시작하세요. 매일 3개 키워드 추천!</p>
        </div>

        {error && (
          <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">닉네임</label>
            <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="닉네임" required
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" required
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8자 이상" required
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">
            {loading ? '가입 중...' : '가입하기'}
          </button>
        </form>

        <p className="text-center text-xs text-dim">
          이미 계정이 있으신가요? <Link href="/auth/login" className="text-accent font-semibold hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  );
}
