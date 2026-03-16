'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase';

function extractNaverId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9_]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return trimmed.replace(/^@/, '').toLowerCase();
}

function extractBlogId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_]+)/);
  if (urlMatch) return urlMatch[1];
  return trimmed.replace(/^@/, '');
}

export default function SignupPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [userType, setUserType] = useState<'influencer' | 'blogger' | null>(null);

  // Step 2: 계정 정보
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  // Step 3: 네이버 ID
  const [naverInput, setNaverInput] = useState('');

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

  const goBack = () => {
    setError('');
    setStep(prev => Math.max(prev - 1, 1) as 1 | 2 | 3);
  };

  // ─── Step 2: 회원가입 (Supabase Auth) ───
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
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
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

      // 기존 유저가 signUp을 다시 호출하면 session이 null로 옴 (Supabase 보안 정책)
      if (!authData.session) {
        setError('이미 가입된 이메일입니다. 로그인 페이지에서 로그인해주세요.');
        return;
      }

      setLoadingStep('프로필 생성 중...');

      // 2. users 테이블에 레코드 생성
      const nickname = email.trim().split('@')[0];
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authId: authData.user.id,
          email: email.trim(),
          nickname,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '프로필 생성에 실패했습니다.');
        return;
      }

      // Step 3으로 이동
      setError('');
      setStep(3);
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // ─── Step 3: 네이버 ID 연결 ───
  const handleLink = async () => {
    const value = naverInput.trim();
    if (!value) {
      setError(
        userType === 'influencer'
          ? '인플루언서 아이디를 입력해주세요.'
          : '블로그 아이디를 입력해주세요.',
      );
      return;
    }

    setLoading(true);
    setLoadingStep('연결 중...');
    setError('');

    try {
      const naverId = userType === 'influencer' ? extractNaverId(value) : extractBlogId(value);

      const res = await fetch('/api/my/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '연결에 실패했습니다.');
        return;
      }

      // 성공 → 대시보드 이동
      if (userType === 'influencer') {
        router.push('/my');
      } else {
        router.push('/my/blogger');
      }
      router.refresh();
    } catch {
      setError('연결 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleSkipLink = () => {
    if (userType === 'influencer') {
      router.push('/my');
    } else {
      router.push('/my/blogger');
    }
    router.refresh();
  };

  // ─── 서브타이틀 ───
  const subtitle =
    step === 1
      ? '인플루언서이신가요? 블로거이신가요?'
      : step === 2
        ? '계정을 만들어주세요'
        : userType === 'influencer'
          ? '인플루언서 계정을 연결해주세요'
          : '블로그를 연결해주세요';

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
            <p className="text-sm text-dim mt-1">{subtitle}</p>
          </div>

          {/* ─── 프로그레스 ─── */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                    s <= step ? 'bg-accent scale-110' : 'bg-border'
                  }`}
                />
                {s < 3 && (
                  <div
                    className={`w-8 h-0.5 rounded-full transition-all duration-300 ${
                      s < step ? 'bg-accent' : 'bg-border'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* ═══ Step 1: 타입 선택 ═══ */}
          {step === 1 && (
            <div key="step-1" className="space-y-4 animate-fade-in-up">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setUserType('influencer'); setError(''); setStep(2); }}
                  className="group bg-bg border-2 border-border rounded-2xl p-5 text-center hover:border-accent hover:bg-accent/5 transition-all cursor-pointer focus:outline-none focus:border-accent"
                >
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-accent/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l.588 1.809h1.902l-1.539 1.118.588 1.809L12 5.618l-1.539 1.118.588-1.809-1.539-1.118h1.902L12 2z" />
                    </svg>
                  </div>
                  <p className="font-bold text-[15px] mb-1">인플루언서</p>
                  <p className="text-[11px] text-dim leading-relaxed">키워드챌린지 순위와<br />경쟁 분석이 필요해요</p>
                </button>

                <button
                  type="button"
                  onClick={() => { setUserType('blogger'); setError(''); setStep(2); }}
                  className="group bg-bg border-2 border-border rounded-2xl p-5 text-center hover:border-accent hover:bg-accent/5 transition-all cursor-pointer focus:outline-none focus:border-accent"
                >
                  <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-accent/10 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </div>
                  <p className="font-bold text-[15px] mb-1">블로거</p>
                  <p className="text-[11px] text-dim leading-relaxed">블로그 검색노출과<br />키워드 분석이 필요해요</p>
                </button>
              </div>

              <p className="text-[10px] text-dim text-center leading-relaxed">
                이미 계정이 있으신가요?{' '}
                <Link href="/auth/login" className="text-accent underline hover:text-accent-hover">로그인</Link>
              </p>
            </div>
          )}

          {/* ═══ Step 2: 이메일 + 비밀번호 + 약관 ═══ */}
          {step === 2 && (
            <div key="step-2" className="space-y-4 animate-fade-in-up">
              <button type="button" onClick={goBack} className="flex items-center gap-1 text-sm text-dim hover:text-text transition cursor-pointer">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                뒤로
              </button>

              <div>
                <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" autoFocus
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
                  onKeyDown={e => e.key === 'Enter' && handleSignup()}
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
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
          )}

          {/* ═══ Step 3: 네이버 ID 연결 ═══ */}
          {step === 3 && (
            <div key="step-3" className="space-y-4 animate-fade-in-up">
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-up/10 flex items-center justify-center">
                  <svg className="w-5 h-5 text-up" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-up">계정이 생성되었습니다!</p>
              </div>

              <div className="text-center">
                <h2 className="text-lg font-bold">
                  {userType === 'influencer' ? '인플루언서 계정 연결' : '블로그 연결'}
                </h2>
                <p className="text-sm text-dim mt-1">
                  {userType === 'influencer' ? '네이버 인플루언서 홈 주소를 입력해주세요' : '네이버 블로그 주소를 입력해주세요'}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-dim block">
                  {userType === 'influencer' ? '인플루언서 주소' : '블로그 주소'}
                </label>
                <div className="flex items-center bg-bg border border-border rounded-xl overflow-hidden focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30 transition">
                  <span className="px-3 text-sm text-dim shrink-0 border-r border-border bg-border/30">
                    {userType === 'influencer' ? 'in.naver.com/' : 'blog.naver.com/'}
                  </span>
                  <input type="text" value={naverInput} onChange={e => setNaverInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLink()}
                    placeholder="아이디를 입력하세요" autoFocus
                    className="flex-1 px-3 py-3 bg-transparent text-sm text-text placeholder:text-dim/60 focus:outline-none" />
                </div>
                <p className="text-[11px] text-dim">아이디 또는 전체 URL을 붙여넣기 할 수 있어요</p>
              </div>

              {error && (
                <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">{error}</div>
              )}

              <button type="button" onClick={handleLink} disabled={loading}
                className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {loadingStep}
                  </span>
                ) : '연결하고 시작하기'}
              </button>

              <button type="button" onClick={handleSkipLink} className="w-full py-2 text-sm text-dim hover:text-text transition cursor-pointer">
                나중에 연결하기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
