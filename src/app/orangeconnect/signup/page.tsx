'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { validatePassword, PASSWORD_PLACEHOLDER, isValidEmail, EMAIL_FORMAT_ERROR } from '@/lib/validations/auth';
import { mapSupabaseAuthError } from '@/lib/auth-error-messages';

const INDUSTRIES = [
  '음식/외식', '뷰티/화장품', '패션/의류', '여행/숙박', '건강/의료',
  'IT/테크', '교육/학원', '부동산', '인테리어', '육아/유아',
  '반려동물', '자동차', '금융/보험', '엔터테인먼트', '기타',
];

export default function AdSignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [industry, setIndustry] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');

  const router = useRouter();
  const queryClient = useQueryClient();
  const allAgreed = agreeTerms && agreePrivacy;

  const handleAgreeAll = () => {
    const next = !allAgreed;
    setAgreeTerms(next);
    setAgreePrivacy(next);
  };

  // 사업자번호 자동 포맷 (xxx-xx-xxxxx)
  const handleBusinessNumberChange = (val: string) => {
    const digits = val.replace(/[^0-9]/g, '').slice(0, 10);
    if (digits.length <= 3) setBusinessNumber(digits);
    else if (digits.length <= 5) setBusinessNumber(`${digits.slice(0, 3)}-${digits.slice(3)}`);
    else setBusinessNumber(`${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`);
  };

  const handleSignup = async () => {
    setError('');

    if (!contactName.trim()) return setError('담당자명을 입력해주세요.');
    if (!email.trim()) return setError('이메일을 입력해주세요.');
    if (!isValidEmail(email)) return setError(EMAIL_FORMAT_ERROR);
    {
      const pwCheck = validatePassword(password);
      if (!pwCheck.ok) return setError(pwCheck.error);
    }
    if (password !== passwordConfirm) return setError('비밀번호가 일치하지 않습니다.');
    if (!companyName.trim()) return setError('회사명/상호를 입력해주세요.');
    if (businessNumber) {
      const digits = businessNumber.replace(/[^0-9]/g, '');
      if (digits.length !== 10) return setError('사업자등록번호는 10자리여야 합니다.');
    }
    if (!allAgreed) return setError('이용약관과 개인정보처리방침에 동의해주세요.');

    setLoading(true);
    setLoadingStep('계정 생성 중...');

    try {
      const supabase = createSupabaseBrowserClient();

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('이미 가입된 이메일입니다. 로그인해주세요.');
        } else {
          // Supabase 원문은 영문이라 그대로 띄우면 무엇을 해야 하는지 알 수 없다.
          // 특히 재발송 쿨다운("...after N seconds")은 몇 초를 기다릴지조차 안 보인다.
          setError(mapSupabaseAuthError(authError, '회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.'));
        }
        return;
      }

      if (!authData.user || !authData.session) {
        setError('이미 가입된 이메일입니다. 로그인 페이지에서 로그인해주세요.');
        return;
      }

      setLoadingStep('광고주 프로필 생성 중...');

      const res = await fetch('/api/ad/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authId: authData.user.id,
          email: email.trim(),
          companyName: companyName.trim(),
          businessNumber: businessNumber ? businessNumber.replace(/[^0-9]/g, '') : undefined,
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim() || undefined,
          industry: industry || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        await supabase.auth.signOut();
        setError(data.error || '프로필 생성에 실패했습니다.');
        return;
      }

      // useAuth 캐시 무효화 — Header/모달 등이 새 사용자 정보를 즉시 반영
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      router.push('/orangeconnect/dashboard');
      router.refresh();
    } catch {
      setError('회원가입 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-8">
      <div className="w-full max-w-md mx-auto px-4">
        <div className="bg-surface rounded-lg border border-border p-8 space-y-6">
          {/* 헤더 */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
              AD
            </div>
            <h1 className="type-page-title">광고주 회원가입</h1>
            <p className="text-sm text-dim mt-1">인플루언서 마케팅을 시작하세요</p>
          </div>

          {/* <div> 이던 시절엔 Enter 키가 아무 일도 하지 않았다. 같은 광고주 화면인데
              /orangeconnect/login 은 onKeyDown 으로 Enter 가 되므로, 로그인은 Enter 로
              되는데 가입만 안 되는 상태였다 — 사용자는 "가입 버튼이 고장났다"고 느낀다.
              noValidate: 브라우저 기본 말풍선이 submit 을 막으면 위 handleSignup 이
              실행조차 안 돼 오류 상자에 직전 메시지가 그대로 남는다. */}
          <form onSubmit={(e) => { e.preventDefault(); handleSignup(); }} noValidate className="space-y-4 animate-fade-in-up">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">담당자명</label>
              <input type="text" value={contactName} onChange={e => setContactName(e.target.value)} placeholder="홍길동" maxLength={50} autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@company.com"
                className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={PASSWORD_PLACEHOLDER}
                className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호 확인</label>
              <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="비밀번호를 다시 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">회사명 / 상호</label>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="(주)오렌지" maxLength={100}
                className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">사업자등록번호 (선택)</label>
              <input type="text" value={businessNumber} onChange={e => handleBusinessNumberChange(e.target.value)} placeholder="000-00-00000"
                className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
              <p className="text-[11px] text-dim mt-1">나중에 입력할 수 있습니다</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">연락처 (선택)</label>
              <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="010-0000-0000"
                className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">업종 (선택)</label>
              <select value={industry} onChange={e => setIndustry(e.target.value)}
                className="w-full px-4 py-3 bg-bg border border-border rounded-lg text-sm text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition">
                <option value="">선택해주세요</option>
                {INDUSTRIES.map(ind => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
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

            <button type="submit" disabled={loading || !allAgreed}
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
              <Link href="/orangeconnect/login" className="text-accent underline hover:text-accent-hover">로그인</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
