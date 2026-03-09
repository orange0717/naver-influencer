'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type UserType = 'select' | 'influencer' | 'blogger';

function extractNaverId(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:https?:\/\/)?in\.naver\.com\/([a-zA-Z0-9_]+)/);
  if (urlMatch) return urlMatch[1].toLowerCase();
  return trimmed.replace(/^@/, '').toLowerCase();
}

function extractBlogId(input: string): string {
  const trimmed = input.trim();
  // https://blog.naver.com/username or m.blog.naver.com/username
  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_]+)/);
  if (urlMatch) return urlMatch[1];
  // 그냥 ID만 입력한 경우
  return trimmed.replace(/^@/, '');
}

export default function LoginPage() {
  const [userType, setUserType] = useState<UserType>('select');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleInfluencerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const naverId = extractNaverId(input);
    if (!naverId) {
      setError('인플루언서 링크 또는 ID를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/influencer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ naverId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        return;
      }
      router.push('/my');
      router.refresh();
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBloggerLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const blogId = extractBlogId(input);
    if (!blogId) {
      setError('블로그 링크 또는 ID를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/blogger-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        return;
      }
      router.push('/my/blogger');
      router.refresh();
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // ─── 선택 화면 ───
  if (userType === 'select') {
    return (
      <div className="min-h-[75vh] flex items-center justify-center -mt-6">
        <div className="w-full max-w-lg mx-auto px-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4">N</div>
            <h1 className="text-2xl font-extrabold">N인플에 오신 것을 환영합니다</h1>
            <p className="text-sm text-dim mt-2">서비스 유형을 선택해주세요</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 일반 블로거 카드 */}
            <button
              onClick={() => { setUserType('blogger'); setInput(''); setError(''); }}
              className="group bg-surface rounded-2xl border-2 border-border hover:border-[#2DB400] p-6 text-left transition-all hover:shadow-lg cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-[#2DB400]/10 flex items-center justify-center mb-4 group-hover:bg-[#2DB400]/20 transition">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2DB400" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <line x1="8" y1="7" x2="16" y2="7" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </div>
              <h2 className="text-lg font-extrabold mb-1">일반 블로거</h2>
              <p className="text-xs text-dim leading-relaxed">
                네이버 블로그 키워드 순위 확인<br />
                C-Rank · DIA · DIA+ 기반 분석
              </p>
              <div className="mt-4 text-xs font-semibold text-[#2DB400] flex items-center gap-1">
                시작하기
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l4 4-4 4"/></svg>
              </div>
            </button>

            {/* 네이버 인플루언서 카드 */}
            <button
              onClick={() => { setUserType('influencer'); setInput(''); setError(''); }}
              className="group bg-surface rounded-2xl border-2 border-border hover:border-accent p-6 text-left transition-all hover:shadow-lg cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-accent">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-extrabold mb-1">네이버 인플루언서</h2>
              <p className="text-xs text-dim leading-relaxed">
                키워드챌린지 순위 · 경쟁 분석<br />
                맞춤 추천 · 랭킹 시스템
              </p>
              <div className="mt-4 text-xs font-semibold text-accent flex items-center gap-1">
                시작하기
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l4 4-4 4"/></svg>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── 로그인 폼 ───
  const isInfluencer = userType === 'influencer';

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-sm mx-auto">
        <div className="bg-surface rounded-2xl border border-border p-8 space-y-6">
          <div className="text-center">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3 ${
              isInfluencer ? 'bg-accent' : 'bg-[#2DB400]'
            }`}>
              {isInfluencer ? 'N' : 'B'}
            </div>
            <h1 className="text-2xl font-extrabold">
              {isInfluencer ? '인플루언서 로그인' : '블로거 로그인'}
            </h1>
            <p className="text-sm text-dim mt-1">
              {isInfluencer ? '인플루언서 링크로 접속하세요' : '블로그 주소로 접속하세요'}
            </p>
          </div>

          {error && (
            <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">
              {error}
            </div>
          )}

          <form onSubmit={isInfluencer ? handleInfluencerLogin : handleBloggerLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">
                {isInfluencer ? '네이버 인플루언서 링크' : '네이버 블로그 링크'}
              </label>
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={isInfluencer
                  ? 'https://in.naver.com/아이디 또는 아이디'
                  : 'https://blog.naver.com/아이디 또는 아이디'
                }
                required
                autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
              />
              <p className="text-[11px] text-dim mt-1.5">
                {isInfluencer
                  ? '예: https://in.naver.com/orangelibrary 또는 orangelibrary'
                  : '예: https://blog.naver.com/myid 또는 myid'
                }
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isInfluencer ? 'bg-accent hover:bg-accent-hover' : 'bg-[#2DB400] hover:bg-[#25a000]'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  확인 중...
                </span>
              ) : '접속하기'}
            </button>
          </form>

          <div className="text-center pt-2 border-t border-border">
            <button
              onClick={() => { setUserType('select'); setInput(''); setError(''); }}
              className="text-sm text-dim hover:text-accent transition cursor-pointer"
            >
              ← 다른 유형 선택
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
