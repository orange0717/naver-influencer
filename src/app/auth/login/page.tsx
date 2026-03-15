'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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

export default function LoginPage() {
  const [blogInput, setBlogInput] = useState('');
  const [influencerInput, setInfluencerInput] = useState('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!agreeTerms || !agreePrivacy) {
      setError('이용약관과 개인정보처리방침에 동의해주세요.');
      return;
    }

    const blogId = blogInput.trim() ? extractBlogId(blogInput) : '';
    const naverId = influencerInput.trim() ? extractNaverId(influencerInput) : '';

    if (!blogId && !naverId) {
      setError('블로그 또는 인플루언서 중 하나 이상 입력해주세요.');
      return;
    }

    setLoading(true);
    setLoadingStep('확인 중...');

    try {
      const res = await fetch('/api/auth/unified-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blogId: blogId || undefined,
          naverId: naverId || undefined,
        }),
      });

      setLoadingStep('로그인 처리 중...');
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        return;
      }

      // 인플루언서가 있으면 /my, 블로거만이면 /my/blogger
      if (naverId) {
        router.push('/my');
      } else {
        router.push('/my/blogger');
      }
      router.refresh();
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
              N
            </div>
            <h1 className="text-2xl font-extrabold">N인플 시작하기</h1>
            <p className="text-sm text-dim mt-1">
              블로그 또는 인플루언서 정보를 입력해주세요
            </p>
          </div>

          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">
                네이버 블로그 주소
              </label>
              <input
                type="text"
                value={blogInput}
                onChange={e => setBlogInput(e.target.value)}
                placeholder="https://blog.naver.com/아이디 또는 아이디"
                autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
              <p className="text-[11px] text-dim mt-1">
                예: blog.naver.com/orangelibrary 또는 orangelibrary
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">
                네이버 인플루언서 주소
              </label>
              <input
                type="text"
                value={influencerInput}
                onChange={e => setInfluencerInput(e.target.value)}
                placeholder="https://in.naver.com/아이디 또는 아이디"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
              <p className="text-[11px] text-dim mt-1">
                예: in.naver.com/orangelibrary 또는 orangelibrary
              </p>
            </div>

            {/* 약관 동의 */}
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 cursor-pointer" onClick={handleAgreeAll}>
                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${
                  allAgreed ? 'bg-accent border-accent' : 'border-border'
                }`}>
                  {allAgreed && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2"><path d="M2 6l3 3 5-5"/></svg>
                  )}
                </span>
                <span className="text-sm font-bold">전체 동의</span>
              </label>

              <div className="ml-7 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={e => setAgreeTerms(e.target.checked)}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                  <span className="text-xs text-dim">
                    <Link href="/terms" target="_blank" className="underline hover:text-accent">[필수] 이용약관</Link> 동의
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreePrivacy}
                    onChange={e => setAgreePrivacy(e.target.checked)}
                    className="w-4 h-4 accent-accent cursor-pointer"
                  />
                  <span className="text-xs text-dim">
                    <Link href="/privacy" target="_blank" className="underline hover:text-accent">[필수] 개인정보처리방침</Link> 동의
                  </span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !allAgreed}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {loadingStep}
                </span>
              ) : '시작하기'}
            </button>
          </form>

          <p className="text-[10px] text-dim text-center leading-relaxed">
            둘 중 하나만 입력해도 시작할 수 있습니다.<br />
            별도의 이메일, 비밀번호가 필요하지 않습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
