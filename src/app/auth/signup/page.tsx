'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

function extractNaverId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9_]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return trimmed.replace(/^@/, '').toLowerCase();
}

export default function SignupPage() {

  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [naverInput, setNaverInput] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');

  const router = useRouter();
  const allAgreed = agreeTerms && agreePrivacy;

  const handleAgreeAll = () => {
    const next = !allAgreed;
    setAgreeTerms(next);
    setAgreePrivacy(next);
  };

  const handleSignup = async () => {
    setError('');

    if (!email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('올바른 이메일 형식을 입력해주세요.');
      return;
    }
    if (!nickname.trim()) {
      setError('닉네임을 입력해주세요.');
      return;
    }
    if (nickname.trim().length > 20) {
      setError('닉네임은 20자 이하로 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (!naverInput.trim()) {
      setError('인플루언서홈 주소를 입력해주세요.');
      return;
    }
    if (!allAgreed) {
      setError('이용약관과 개인정보처리방침에 동의해주세요.');
      return;
    }

    setLoading(true);
    setLoadingStep('계정 생성 중...');

    try {
      const supabase = createSupabaseBrowserClient();
      const naverId = extractNaverId(naverInput);

      // 1. Supabase Auth 회원가입
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('이미 가입된 이메일입니다. 로그인해주세요.');
        } else {
          setError(authError.message);
        }
        return;
      }

      if (!authData.user) {
        setError('회원가입에 실패했습니다.');
        return;
      }

      if (!authData.session) {
        setError('이미 가입된 이메일입니다. 로그인 페이지에서 로그인해주세요.');
        return;
      }

      setLoadingStep('인플루언서 연결 중...');

      // 2. users 테이블에 레코드 생성 + 인플루언서 연결
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authId: authData.user.id,
          email: email.trim(),
          nickname: nickname.trim(),
          naverId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        await supabase.auth.signOut();
        setError(data.error || '프로필 생성에 실패했습니다.');
        return;
      }

      const result = await res.json();
      if (!result.linked) {
        await supabase.auth.signOut();
        setError('등록되지 않은 인플루언서입니다. 인플루언서홈 주소를 확인해주세요.');
        return;
      }

      // 레거시 쿠키 동기화 (헤더 닉네임 표시용)
      await fetch('/api/auth/sync-cookies', { method: 'POST' }).catch(() => {});

      // 성공 → 대시보드 이동
      router.push('/my');
      router.refresh();
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          {/* ─── 헤더 ─── */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
              N
            </div>
            <h1 className="text-2xl font-extrabold">N인플 회원가입</h1>
            <p className="text-sm text-dim mt-1">인플루언서 전용 대시보드</p>
          </div>

          <div className="space-y-4 animate-fade-in-up">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">닉네임</label>
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="닉네임을 입력해주세요" maxLength={20} autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="6자 이상 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호 확인</label>
              <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="비밀번호를 다시 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">인플루언서홈 주소 (필수)</label>
              <div className="flex items-center bg-bg border border-border rounded-xl overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30 transition">
                <span className="px-3 text-sm text-dim shrink-0 border-r border-border bg-border/30">
                  in.naver.com/
                </span>
                <input type="text" value={naverInput} onChange={e => setNaverInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSignup()}
                  placeholder="아이디를 입력하세요"
                  className="flex-1 px-3 py-3 bg-transparent text-sm text-text placeholder:text-dim/60 focus:outline-none" />
              </div>
              <p className="text-[11px] text-dim mt-1">아이디 또는 전체 URL을 붙여넣기 할 수 있어요</p>
            </div>

            {error && (
              <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">{error}</div>
            )}

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer" onClick={handleAgreeAll}>
                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${allAgreed ? 'bg-accent border-accent' : 'border-border'}`}>
                  {allAgreed && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2"><path d="M2 6l3 3 5-5" /></svg>}
                </span>
                <span className="text-sm font-bold">전체 동의</span>
              </label>
              <div className="ml-7 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="w-4 h-4 accent-accent cursor-pointer" />
                  <span className="text-xs text-dim"><Link href="/terms" target="_blank" className="underline hover:text-accent">[필수] 이용약관</Link> 동의</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={agreePrivacy} onChange={e => setAgreePrivacy(e.target.checked)} className="w-4 h-4 accent-accent cursor-pointer" />
                  <span className="text-xs text-dim"><Link href="/privacy" target="_blank" className="underline hover:text-accent">[필수] 개인정보처리방침</Link> 동의</span>
                </label>
              </div>
            </div>

            <button type="button" onClick={handleSignup} disabled={loading || !allAgreed}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {loadingStep}
                </span>
              ) : '가입하기'}
            </button>

            <p className="text-[10px] text-dim text-center">
              이미 계정이 있으신가요?{' '}
              <Link href="/auth/login" className="text-accent underline hover:text-accent-hover">로그인</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
