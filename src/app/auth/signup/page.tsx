'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { signUp as gaSignUp } from '@/lib/gtag';
import LegalModal from '@/components/legal/LegalModal';
import TermsContent from '@/components/legal/TermsContent';
import PrivacyContent from '@/components/legal/PrivacyContent';

const RequiredMark = () => <span className="text-down ml-0.5">*</span>;

// 입력값에서 ID 만 뽑아낸다.
//   blog.naver.com/foo, https://blog.naver.com/foo?bar 등에서 'foo' 만 추출
const extractBlogId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/blog\.naver\.com\/([^/?#]+)/i);
  return (m ? m[1] : trimmed).toLowerCase();
};

// in.naver.com/foo → foo
const extractNaverId = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/in\.naver\.com\/([^/?#]+)/i);
  return (m ? m[1] : trimmed).toLowerCase();
};

export default function SignupPage() {

  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [blogInput, setBlogInput] = useState('');
  const [naverInput, setNaverInput] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

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

    const blogId = extractBlogId(blogInput);
    const naverId = extractNaverId(naverInput);
    if (!blogId) {
      setError('네이버 블로그 주소를 입력해주세요.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(blogId)) {
      setError('네이버 블로그 주소를 다시 확인해주세요.');
      return;
    }
    if (naverId && !/^[a-zA-Z0-9._-]{2,30}$/.test(naverId)) {
      setError('네이버 인플루언서홈 주소를 다시 확인해주세요.');
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

      if (!authData.session) {
        setError('이미 가입된 이메일입니다. 로그인 페이지에서 로그인해주세요.');
        return;
      }

      setLoadingStep('프로필 생성 중...');

      // 2. users 테이블에 레코드 생성 (블로그 ID 포함)
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authId: authData.user.id,
          email: email.trim(),
          nickname: nickname.trim(),
          ...(blogId ? { blogId } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        await supabase.auth.signOut();
        setError(data.error || '프로필 생성에 실패했습니다.');
        return;
      }

      // 레거시 쿠키 동기화 (헤더 닉네임 표시용)
      await fetch('/api/auth/sync-cookies', { method: 'POST' }).catch(() => {});

      // GA4 회원가입 이벤트
      gaSignUp('email');

      // 인플루언서홈을 입력했으면 본인 인증 페이지로, 아니면 블로그 대시보드로
      if (naverId) {
        router.push(`/my/link?naverId=${encodeURIComponent(naverId)}`);
      } else {
        router.push('/my/blogger');
      }
      router.refresh();
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="min-h-[75vh] flex items-start sm:items-center justify-center pt-10 pb-10">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          {/* ─── 헤더 ─── */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
              N
            </div>
            <h1 className="text-2xl font-extrabold">N인플 회원가입</h1>
            <p className="text-sm text-dim mt-1">블로거 & 인플루언서 대시보드</p>
          </div>

          <div className="space-y-4 animate-fade-in-up">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">닉네임<RequiredMark /></label>
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="닉네임을 입력해주세요" maxLength={20} autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">이메일<RequiredMark /></label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호<RequiredMark /></label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="6자 이상 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호 확인<RequiredMark /></label>
              <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="비밀번호를 다시 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">네이버 블로그 주소<RequiredMark /></label>
              <input type="text" value={blogInput} onChange={e => setBlogInput(e.target.value)} placeholder="blog.naver.com/blogid 또는 blogid"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">네이버 인플루언서홈 주소 <span className="text-dim/60 font-normal">(선택)</span></label>
              <input type="text" value={naverInput} onChange={e => setNaverInput(e.target.value)} placeholder="in.naver.com/naverid 또는 naverid"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
              <p className="text-[11px] text-dim mt-1">가입 후 본인 인증 페이지로 이동합니다.</p>
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
                  <span className="text-xs text-dim">
                    <button type="button" onClick={e => { e.stopPropagation(); setShowTerms(true); }} className="underline hover:text-accent cursor-pointer">[필수] 이용약관</button> 동의
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={agreePrivacy} onChange={e => setAgreePrivacy(e.target.checked)} className="w-4 h-4 accent-accent cursor-pointer" />
                  <span className="text-xs text-dim">
                    <button type="button" onClick={e => { e.stopPropagation(); setShowPrivacy(true); }} className="underline hover:text-accent cursor-pointer">[필수] 개인정보처리방침</button> 동의
                  </span>
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

            <p className="text-[11px] text-dim text-center leading-relaxed">
              구글 로그인은 회원가입 완료 후 사용 가능합니다.
            </p>

            <p className="text-sm text-dim text-center">
              이미 계정이 있으신가요?{' '}
              <Link href="/auth/login" className="text-accent underline hover:text-accent-hover">로그인</Link>
            </p>
          </div>
        </div>
      </div>

      <LegalModal open={showTerms} title="이용약관" onClose={() => setShowTerms(false)}>
        <TermsContent />
      </LegalModal>
      <LegalModal open={showPrivacy} title="개인정보처리방침" onClose={() => setShowPrivacy(false)}>
        <PrivacyContent />
      </LegalModal>
    </div>
  );
}
