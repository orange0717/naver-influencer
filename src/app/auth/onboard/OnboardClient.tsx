'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { signUp as gaSignUp } from '@/lib/gtag';
import { KEYWORD_CHALLENGE_CATEGORIES } from '@/lib/keyword-challenge-categories';
import { extractBlogId } from '@/lib/blog-utils';
import LegalModal from '@/components/legal/LegalModal';
import TermsContent from '@/components/legal/TermsContent';
import PrivacyContent from '@/components/legal/PrivacyContent';

const RequiredMark = () => <span className="text-down ml-0.5">*</span>;

// next 파라미터를 같은 origin 의 내부 경로로만 허용 (open redirect 방지) — auth/callback과 동일 규칙.
function sanitizeNext(raw: string | null): string {
  const fallback = '/my';
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  return raw;
}

type Step = 'checking' | 'identify' | 'profile' | 'blog';

interface Candidate {
  id: string;
  nickname: string;
  blogId: string;
  createdAt: string;
}

export default function OnboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const next = sanitizeNext(searchParams.get('next'));

  const [step, setStep] = useState<Step>('checking');
  const [authId, setAuthId] = useState('');
  const [email, setEmail] = useState('');

  // ── 기존 회원 매칭 단계 ──
  const [identifyNickname, setIdentifyNickname] = useState('');
  const [identifyBlogInput, setIdentifyBlogInput] = useState('');
  const [identifyLoading, setIdentifyLoading] = useState(false);
  const [identifyError, setIdentifyError] = useState('');
  /** 하루 조회 한도(429)에 걸린 상태. 조회 버튼을 막고 신규 가입 경로만 남긴다. */
  const [identifyBlocked, setIdentifyBlocked] = useState(false);
  const [matchMethod, setMatchMethod] = useState<'blog_id' | 'nickname' | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [matchPageCode, setMatchPageCode] = useState('');
  const [matchInstruction, setMatchInstruction] = useState('');
  const [matchCodeIssued, setMatchCodeIssued] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState('');

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
      setStep('identify');
    })();
  }, [router]);

  async function handleIdentifySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (identifyLoading) return; // 버튼 disabled 만으로는 Enter 연타를 못 막는다
    setIdentifyError('');

    if (!identifyNickname.trim()) {
      setIdentifyError('닉네임을 입력해주세요.');
      return;
    }
    if (identifyNickname.trim().length > 20) {
      setIdentifyError('닉네임은 20자 이하로 입력해주세요.');
      return;
    }

    const blogId = extractBlogId(identifyBlogInput);
    if (identifyBlogInput.trim() && !blogId) {
      setIdentifyError('네이버 블로그 주소를 다시 확인해주세요.');
      return;
    }

    setIdentifyLoading(true);
    try {
      const res = await fetch('/api/auth/match-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(blogId ? { blogId } : {}),
          nickname: identifyNickname.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 하루 5회 조회 제한(429)에 걸리면 이 단계에서 **가입 자체를 끝낼 수 없었다.**
        // 닉네임 오타로 5번 조회한 신규 사용자는 세션만 살아 있고 users 행이 없는 상태로
        // 갇혀서, 어느 메뉴를 가도 비로그인 취급을 받고 UTC 자정까지 손쓸 방법이 없었다.
        // 조회 제한은 남의 계정을 캐내는 걸 막는 장치이므로 그대로 두고,
        // '조회를 건너뛰고 신규 가입' 경로를 열어 준다 — 조회를 안 하니 제한과 무관하다.
        if (res.status === 429) {
          setIdentifyBlocked(true);
          setIdentifyError('오늘 계정 찾기 조회 횟수를 모두 사용했습니다. 아래 "N인플이 처음이에요 — 바로 가입하기"로 가입을 계속할 수 있습니다.');
          return;
        }
        setIdentifyError(data.error || '조회 중 오류가 발생했습니다.');
        return;
      }
      if (data.candidates && data.candidates.length > 0) {
        setMatchMethod(data.method);
        setCandidates(data.candidates);
        if (data.method === 'blog_id') {
          setSelectedCandidate(data.candidates[0]);
        }
        return;
      }
      // 후보 없음 — 신규 가입 플로우로 진행 (입력값 이어받기)
      goToProfile();
    } catch {
      setIdentifyError('조회 중 오류가 발생했습니다.');
    } finally {
      setIdentifyLoading(false);
    }
  }

  function goToProfile() {
    setNickname(identifyNickname.trim());
    setBlogInput(identifyBlogInput);
    setMatchMethod(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setStep('profile');
  }

  function cancelMatch() {
    setSelectedCandidate(null);
    setCandidates([]);
    setMatchMethod(null);
    setMatchCodeIssued(false);
    setMatchPageCode('');
    setMatchError('');
  }

  async function handleMatchRequestCode() {
    if (!selectedCandidate) return;
    setMatchError('');
    setMatchLoading(true);
    try {
      const res = await fetch('/api/auth/blog/request-page-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: selectedCandidate.blogId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMatchError(data.error || '코드 발급에 실패했습니다.');
        return;
      }
      setMatchPageCode(data.pageCode);
      setMatchInstruction(data.instruction);
      setMatchCodeIssued(true);
    } catch {
      setMatchError('코드 발급 중 오류가 발생했습니다.');
    } finally {
      setMatchLoading(false);
    }
  }

  async function handleMatchVerify() {
    if (!selectedCandidate || !matchMethod) return;
    setMatchError('');
    setMatchLoading(true);
    try {
      const verifyRes = await fetch('/api/auth/blog/verify-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: selectedCandidate.blogId }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        setMatchError(verifyData.error || '인증에 실패했습니다.');
        return;
      }
      const linkRes = await fetch('/api/auth/match-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: selectedCandidate.id, matchMethod }),
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        setMatchError(linkData.error || '연결에 실패했습니다.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      finish();
    } catch {
      setMatchError('인증 확인 중 오류가 발생했습니다.');
    } finally {
      setMatchLoading(false);
    }
  }

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
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-xl font-bold text-white">
            N
          </div>
          <h1 className="type-page-title text-text">
            {step === 'identify' && '환영합니다!'}
            {step === 'profile' && '환영합니다!'}
            {step === 'blog' && '블로그를 연결하세요'}
          </h1>
          <p className="mt-1 text-sm text-dim">
            {step === 'identify' && '기존에 N인플 회원이셨다면 닉네임과 블로그 주소로 계정을 찾아드릴게요.'}
            {step === 'profile' && 'Google 계정으로 로그인했습니다. 몇 가지만 더 알려주세요.'}
            {step === 'blog' && '네이버 블로그를 연결하면 방문자, 순위, 발행 데이터를 자동으로 분석합니다.'}
          </p>
        </div>

        {step === 'identify' && !selectedCandidate && candidates.length === 0 && (
          <form onSubmit={handleIdentifySubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-dim">닉네임<RequiredMark /></label>
              <input
                type="text"
                value={identifyNickname}
                onChange={(e) => setIdentifyNickname(e.target.value)}
                placeholder="닉네임을 입력해주세요"
                maxLength={20}
                className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-dim">
                네이버 블로그 주소 <span className="font-normal text-dim/60">(기존 회원이면 입력)</span>
              </label>
              <input
                type="text"
                value={identifyBlogInput}
                onChange={(e) => setIdentifyBlogInput(e.target.value)}
                placeholder="blog.naver.com/blogid 또는 blogid"
                className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              />
            </div>

            {identifyError && (
              <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-center text-sm text-down">{identifyError}</div>
            )}

            <button
              type="submit"
              disabled={identifyLoading || identifyBlocked}
              className="w-full cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {identifyLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  확인 중...
                </span>
              ) : '다음'}
            </button>

            {/* 이 우회 경로는 **항상** 보여야 한다. 예전에는 기존 회원 후보가 발견됐을 때만
                나타나서, 첫 화면에서 조회 한도(하루 5회)에 걸린 신규 사용자는 가입을 끝낼
                방법이 전혀 없었다. 계정 찾기는 어디까지나 선택 단계다. */}
            <button
              type="button"
              onClick={goToProfile}
              disabled={identifyLoading}
              className={`w-full cursor-pointer text-center text-xs underline transition disabled:cursor-not-allowed disabled:opacity-50 ${
                identifyBlocked ? 'font-bold text-accent' : 'text-dim hover:text-accent'
              }`}
            >
              N인플이 처음이에요 — 바로 가입하기
            </button>
          </form>
        )}

        {step === 'identify' && matchMethod === 'nickname' && !selectedCandidate && candidates.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-text">동일한 닉네임의 계정을 찾았습니다. 본인 계정을 선택해주세요.</p>
            <div className="space-y-2">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCandidate(c)}
                  className="w-full cursor-pointer rounded-xl border border-border bg-bg px-4 py-3 text-left text-sm transition hover:border-accent"
                >
                  <p className="font-bold text-text">{c.nickname}</p>
                  <p className="mt-0.5 text-xs text-dim">blog.naver.com/{c.blogId}</p>
                  <p className="mt-0.5 text-[11px] text-dim/70">가입일 {new Date(c.createdAt).toLocaleDateString('ko-KR')}</p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={goToProfile}
              className="w-full cursor-pointer text-center text-xs text-dim underline hover:text-accent"
            >
              내 계정이 없습니다 — 신규 가입
            </button>
          </div>
        )}

        {step === 'identify' && selectedCandidate && !matchCodeIssued && (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm text-text">
              <p className="mb-2 font-bold text-accent">기존 회원 정보를 찾았습니다.</p>
              <p>닉네임: {selectedCandidate.nickname}</p>
              <p>블로그: blog.naver.com/{selectedCandidate.blogId}</p>
              <p className="mt-2 text-xs text-dim">본인 확인을 위해 블로그 소개글에 인증 코드를 붙여넣어야 합니다.</p>
            </div>

            {matchError && (
              <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-center text-sm text-down">{matchError}</div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={cancelMatch}
                className="flex-1 cursor-pointer rounded-xl border border-border bg-bg py-3 font-bold text-text transition hover:bg-border/40"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleMatchRequestCode}
                disabled={matchLoading}
                className="flex-1 cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {matchLoading ? '코드 발급 중...' : '기존 계정 연결'}
              </button>
            </div>
          </div>
        )}

        {step === 'identify' && selectedCandidate && matchCodeIssued && (
          <div className="space-y-4">
            <div className="rounded-xl border border-accent/25 bg-accent/5 p-4 text-sm text-text">
              <p className="mb-2 font-bold text-accent">{matchPageCode}</p>
              <p className="text-xs leading-relaxed text-dim">{matchInstruction}</p>
            </div>

            {matchError && (
              <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-center text-sm text-down">{matchError}</div>
            )}

            <button
              type="button"
              onClick={handleMatchVerify}
              disabled={matchLoading}
              className="w-full cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {matchLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  인증 확인 중...
                </span>
              ) : '인증 확인'}
            </button>
            <button
              type="button"
              onClick={cancelMatch}
              className="w-full cursor-pointer text-center text-xs text-dim underline hover:text-accent"
            >
              취소
            </button>
          </div>
        )}

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
                className={`w-full cursor-pointer appearance-auto rounded-lg border border-border bg-surface px-4 py-3 text-sm transition focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30 ${
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
