'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { signUp as gaSignUp } from '@/lib/gtag';
import { KEYWORD_CHALLENGE_CATEGORIES } from '@/lib/keyword-challenge-categories';
import LegalModal from '@/components/legal/LegalModal';
import TermsContent from '@/components/legal/TermsContent';
import PrivacyContent from '@/components/legal/PrivacyContent';

const RequiredMark = () => <span className="text-down ml-0.5">*</span>;

// blog.naver.com/foo, https://blog.naver.com/foo?bar 등에서 'foo' 만 추출
function extractBlogId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const m = trimmed.match(/blog\.naver\.com\/([^/?#]+)/i);
  return (m ? m[1] : trimmed).toLowerCase();
}

// next 파라미터를 같은 origin 의 내부 경로로만 허용 (open redirect 방지) — auth/callback과 동일 규칙.
function sanitizeNext(raw: string | null): string {
  const fallback = '/my';
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

type Step = 'checking' | 'profile' | 'blog';

export default function OnboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const next = sanitizeNext(searchParams.get('next'));

  const [step, setStep] = useState<Step>('checking');
  const [authId, setAuthId] = useState('');
  const [email, setEmail] = useState('');

  // ── 프로필 단계 ──
  const [nickname, setNickname] = useState('');
  const [keywordCategory, setKeywordCategory] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  // ── 블로그 연결 단계 (선택) ──
  const [blogInput, setBlogInput] = useState('');
  const [pageCode, setPageCode] = useState('');
  const [instruction, setInstruction] = useState('');
  const [codeIssued, setCodeIssued] = useState(false);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogError, setBlogError] = useState('');

  const allAgreed = agreeTerms && agreePrivacy;

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setAuthId(user.id);
      setEmail(user.email ?? '');
      setStep('profile');
    })();
  }, [router]);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileError('');

    if (!nickname.trim()) {
      setProfileError('닉네임을 입력해주세요.');
      return;
    }
    if (nickname.trim().length > 20) {
      setProfileError('닉네임은 20자 이하로 입력해주세요.');
      return;
    }
    if (!keywordCategory) {
      setProfileError('활동 주제(키워드챌린지 분야)를 선택해주세요.');
      return;
    }
    if (!allAgreed) {
      setProfileError('이용약관과 개인정보처리방침에 동의해주세요.');
      return;
    }

    setProfileLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authId, email, nickname: nickname.trim(), keywordCategory }),
      });
      if (!res.ok) {
        const data = await res.json();
        setProfileError(data.error || '프로필 생성에 실패했습니다.');
        return;
      }
      gaSignUp('google');
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      setStep('blog');
    } catch {
      setProfileError('프로필 생성 중 오류가 발생했습니다.');
    } finally {
      setProfileLoading(false);
    }
  }

  async function handleRequestCode() {
    setBlogError('');
    const blogId = extractBlogId(blogInput);
    if (!blogId || !/^[a-zA-Z0-9_-]{2,30}$/.test(blogId)) {
      setBlogError('네이버 블로그 주소를 다시 확인해주세요.');
      return;
    }
    setBlogLoading(true);
    try {
      const res = await fetch('/api/auth/blog/request-page-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlogError(data.error || '코드 발급에 실패했습니다.');
        return;
      }
      setPageCode(data.pageCode);
      setInstruction(data.instruction);
      setCodeIssued(true);
    } catch {
      setBlogError('코드 발급 중 오류가 발생했습니다.');
    } finally {
      setBlogLoading(false);
    }
  }

  async function handleVerify() {
    setBlogError('');
    const blogId = extractBlogId(blogInput);
    setBlogLoading(true);
    try {
      const verifyRes = await fetch('/api/auth/blog/verify-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        setBlogError(verifyData.error || '인증에 실패했습니다.');
        return;
      }
      const linkRes = await fetch('/api/my/link-blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId }),
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        setBlogError(linkData.error || '블로그 연결에 실패했습니다.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      finish();
    } catch {
      setBlogError('인증 확인 중 오류가 발생했습니다.');
    } finally {
      setBlogLoading(false);
    }
  }

  function finish() {
    router.push(next);
    router.refresh();
  }

  if (step === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-bg px-4 py-10 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-xl font-bold text-white">
            N
          </div>
          <h1 className="text-xl font-extrabold text-text">
            {step === 'profile' ? '환영합니다!' : '블로그를 연결하세요'}
          </h1>
          <p className="mt-1 text-sm text-dim">
            {step === 'profile'
              ? 'Google 계정으로 로그인했습니다. 몇 가지만 더 알려주세요.'
              : '네이버 블로그를 연결하면 방문자, 순위, 발행 데이터를 자동으로 분석합니다.'}
          </p>
        </div>

        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-dim">닉네임<RequiredMark /></label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임을 입력해주세요"
                maxLength={20}
                className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>

            <div className="space-y-2.5 rounded-xl border-2 border-accent/25 bg-accent/5 p-4">
              <label className="mb-1.5 block text-xs font-semibold text-dim" htmlFor="onboard-keyword-category">
                활동 주제 (키워드챌린지)<RequiredMark />
              </label>
              <p className="text-[11px] leading-relaxed text-dim">
                대시보드·추천 키워드는 선택한 분야 기준으로 보입니다. 네이버 챌린지 카테고리와 이름이 같습니다.
              </p>
              <select
                id="onboard-keyword-category"
                value={keywordCategory}
                onChange={(e) => setKeywordCategory(e.target.value)}
                style={!keywordCategory ? { color: 'var(--color-dim)' } : undefined}
                className={`w-full cursor-pointer appearance-auto rounded-xl border border-border bg-surface px-4 py-3 text-sm transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${
                  keywordCategory ? 'text-text' : 'text-dim'
                }`}
              >
                <option value="">주제를 선택하세요</option>
                {KEYWORD_CHALLENGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {profileError && (
              <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-center text-sm text-down">{profileError}</div>
            )}

            <div className="space-y-2 pt-2">
              <label
                className="flex cursor-pointer items-center gap-2"
                onClick={() => { setAgreeTerms(!allAgreed); setAgreePrivacy(!allAgreed); }}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${allAgreed ? 'border-accent bg-accent' : 'border-border'}`}>
                  {allAgreed && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2"><path d="M2 6l3 3 5-5" /></svg>}
                </span>
                <span className="text-sm font-bold">전체 동의</span>
              </label>
              <div className="ml-7 space-y-1.5">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
                  <span className="text-xs text-dim">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setShowTerms(true); }} className="cursor-pointer underline hover:text-accent">[필수] 이용약관</button> 동의
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} className="h-4 w-4 cursor-pointer accent-accent" />
                  <span className="text-xs text-dim">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setShowPrivacy(true); }} className="cursor-pointer underline hover:text-accent">[필수] 개인정보처리방침</button> 동의
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={profileLoading || !allAgreed}
              className="w-full cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {profileLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  처리 중...
                </span>
              ) : '다음'}
            </button>
          </form>
        )}

        {step === 'blog' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-dim">네이버 블로그 주소</label>
              <input
                type="text"
                value={blogInput}
                onChange={(e) => { setBlogInput(e.target.value); setCodeIssued(false); setPageCode(''); }}
                placeholder="blog.naver.com/blogid 또는 blogid"
                className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>

            {!codeIssued ? (
              <button
                type="button"
                onClick={handleRequestCode}
                disabled={blogLoading || !blogInput.trim()}
                className="w-full cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {blogLoading ? '코드 발급 중...' : '인증 코드 받기'}
              </button>
            ) : (
              <>
                <div className="rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm text-text">
                  <p className="mb-2 font-bold text-accent">{pageCode}</p>
                  <p className="text-xs leading-relaxed text-dim">{instruction}</p>
                </div>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={blogLoading}
                  className="w-full cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {blogLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      인증 확인 중...
                    </span>
                  ) : '인증 확인'}
                </button>
              </>
            )}

            {blogError && (
              <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-center text-sm text-down">{blogError}</div>
            )}

            <button
              type="button"
              onClick={finish}
              className="w-full cursor-pointer text-center text-xs text-dim underline hover:text-accent"
            >
              나중에 연결하기
            </button>
          </div>
        )}
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
