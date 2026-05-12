'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { login as gaLogin } from '@/lib/gtag';
import DemoModal from '@/components/DemoModal';

function sanitizeRedirect(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authChecked, setAuthChecked] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [stats, setStats] = useState<{ new_count: number | null; active_count: number | null }>({
    new_count: null,
    active_count: null,
  });

  const [googleLoading, setGoogleLoading] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const redirectTo = sanitizeRedirect(searchParams.get('redirect') || searchParams.get('next'));
  const encodedRedirectTo = encodeURIComponent(redirectTo);

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodedRedirectTo}`,
        },
      });
      if (oauthError) {
        setError(oauthError.message);
        setGoogleLoading(false);
      }
    } catch {
      setError('구글 로그인 중 오류가 발생했습니다.');
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        setStats({
          new_count: typeof d?.new_count === 'number' ? d.new_count : 0,
          active_count: typeof d?.active_count === 'number' ? d.active_count : 0,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const reason = searchParams.get('reason');
    if (reason === 'session_taken') {
      setError('다른 기기에서 로그인되어 자동 로그아웃되었습니다. 다시 로그인해 주세요.');
    } else if (reason === 'oauth_no_account') {
      setError('가입되지 않은 구글 계정입니다. 먼저 회원가입을 완료해주세요.');
    }
  }, [searchParams]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user: authUser } }) => {
      if (authUser) {
        await supabase
          .from('users')
          .select('linked_influencer_id, blog_id')
          .eq('auth_id', authUser.id)
          .single();

        router.replace(redirectTo);
      } else {
        setAuthChecked(true);
      }
    });
  }, [redirectTo, router]);

  if (!authChecked) {
    return (
      <div className="fixed inset-0 z-50 bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const form = e.target as HTMLFormElement;
    const emailValue = (form.elements.namedItem('email') as HTMLInputElement)?.value || email;
    const passwordValue = (form.elements.namedItem('password') as HTMLInputElement)?.value || password;

    if (!emailValue.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    if (!passwordValue) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createSupabaseBrowserClient();

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailValue.trim(),
        password: passwordValue,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else {
          setError(authError.message);
        }
        return;
      }

      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', authData.user?.id)
        .single();

      if (!userRecord) {
        await supabase.auth.signOut();
        setError('회원가입이 완료되지 않은 계정입니다. 회원가입 페이지에서 다시 가입해주세요.');
        return;
      }

      await fetch('/api/auth/sync-cookies', { method: 'POST' }).catch(() => {});

      try {
        const { getDeviceId } = await import('@/lib/device-id');
        getDeviceId();
        await fetch('/api/session/register', { method: 'POST' });
      } catch { /* 등록 실패해도 로그인 흐름은 계속 */ }

      gaLogin('email');

      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError('로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg overflow-y-auto lg:overflow-hidden">
      <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row">
        {/* ─── 좌측: 풀블리드 그라디언트 패널 (lg+ 표시, 모바일은 상단 헤더로 축소) ─── */}
        <aside className="relative lg:flex-1 lg:min-w-0 overflow-hidden bg-gradient-to-br from-[#7A4F45] via-[#BF877A] to-[#D9ABA0] text-white">
          {/* 데코레이션 — blur orbs */}
          <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -right-20 w-[28rem] h-[28rem] rounded-full bg-[#F2E2DC]/40 blur-3xl" />
          <div className="pointer-events-none absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-[#7A4F45]/30 blur-3xl" />

          {/* 모바일 — 컴팩트 헤더 */}
          <div className="lg:hidden relative px-6 pt-10 pb-12">
            <Link href="/" className="inline-flex items-center gap-2 text-white/90 hover:text-white transition">
              <span className="w-9 h-9 rounded-lg bg-white text-accent flex items-center justify-center font-extrabold">N</span>
              <span className="font-bold tracking-tight">N인플</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-md bg-white/20 backdrop-blur-sm text-[10px] font-bold tracking-wider text-white">BETA</span>
            </Link>
            <p className="mt-6 inline-block px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm text-[11px] font-semibold tracking-tight text-white/95">
              블로거에서 인플루언서로
            </p>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight">
              감으로 쓰던 블로그를,<br/>데이터로 다시 씁니다.
            </h1>
            <p className="mt-3 text-sm text-white/85 leading-relaxed">
              키워드 분석부터 글 피드백까지,<br/>네이버 블로그 성장에 필요한 모든 것
            </p>
            <button
              type="button"
              onClick={() => setDemoOpen(true)}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/30 text-xs font-bold text-white transition cursor-pointer"
            >
              가입 없이 3일 무료체험 시작 <span aria-hidden>→</span>
            </button>
          </div>

          {/* 데스크탑 — 풀 사이즈 카피 */}
          <div className="hidden lg:flex relative h-full flex-col justify-between p-12 xl:p-16">
            <Link href="/" className="inline-flex items-center gap-2.5 group w-fit">
              <span className="w-11 h-11 rounded-xl bg-white text-accent flex items-center justify-center font-extrabold text-xl shadow-lg shadow-black/10 group-hover:scale-105 transition">
                N
              </span>
              <span className="text-lg font-bold tracking-tight">N인플</span>
              <span className="ml-1 px-2 py-0.5 rounded-md bg-white/20 backdrop-blur-sm border border-white/30 text-[10px] font-bold tracking-wider">BETA</span>
            </Link>

            <div className="space-y-6 max-w-xl">
              <span className="inline-block px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold tracking-tight text-white/95">
                블로거에서 인플루언서로
              </span>
              <h1 className="text-5xl xl:text-6xl font-extrabold leading-[1.15] tracking-tight">
                감으로 쓰던 블로그를,<br/>데이터로 다시 씁니다.
              </h1>
              <p className="text-lg xl:text-xl text-white/90 leading-relaxed">
                키워드 분석부터 글 피드백까지,<br/>네이버 블로그 성장에 필요한 모든 것
              </p>

              {/* 미리보기 카드 — 신규 인플루언서 + 활동하는 인플루언서 (실데이터) */}
              <div className="pt-6 grid grid-cols-2 gap-3 max-w-md">
                <div className="rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 p-4">
                  <div className="text-xs text-white/75 mb-1">이번 주 신규 인플루언서</div>
                  <div className="text-2xl font-extrabold font-mono tracking-tight">
                    {stats.new_count === null ? '—' : `+${stats.new_count.toLocaleString()}`}
                  </div>
                  <div className="mt-1 text-[11px] text-emerald-200 font-semibold">▲ 새로 합류</div>
                </div>
                <div className="rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 p-4">
                  <div className="text-xs text-white/75 mb-1">활동하는 인플루언서</div>
                  <div className="text-2xl font-extrabold font-mono tracking-tight">
                    {stats.active_count === null ? '—' : stats.active_count.toLocaleString()}
                  </div>
                  <div className="mt-1 text-[11px] text-white/75">실시간 집계</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/30 text-sm font-bold text-white transition cursor-pointer w-fit"
              >
                가입 없이 3일 무료체험 시작 <span aria-hidden>→</span>
              </button>
            </div>

            <div className="text-xs text-white/70 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                현재 베타 프로그램 운영 중
              </span>
              <span className="text-white/40">·</span>
              <span>© {new Date().getFullYear()} N인플</span>
            </div>
          </div>
        </aside>

        {/* ─── 우측: 로그인 폼 ─── */}
        <section className="relative w-full lg:w-[480px] xl:w-[520px] lg:flex-shrink-0 bg-surface lg:overflow-y-auto">
          <div className="min-h-full flex flex-col">
            {/* 우측 상단 — 홈으로 */}
            <div className="px-6 lg:px-10 pt-6">
              <Link href="/" className="text-xs text-dim hover:text-accent transition inline-flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                홈으로
              </Link>
            </div>

            <div className="flex-1 flex items-center justify-center px-6 lg:px-10 py-10">
              <div className="w-full max-w-sm space-y-6">
                {/* ─── 헤더 ─── */}
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight">로그인</h2>
                  <p className="text-sm text-dim mt-1.5">N인플 계정으로 로그인해 주세요</p>
                </div>

                {error && (
                  <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down">
                    {error}
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
                    <input
                      type="email"
                      name="email"
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
                      name="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="비밀번호를 입력해주세요"
                      className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
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

                  <div className="flex items-center justify-center gap-3 text-xs text-dim">
                    <Link href={`/auth/signup?redirect=${encodedRedirectTo}`} className="hover:text-accent transition">회원가입</Link>
                    <span className="text-border">|</span>
                    <Link href="/auth/forgot" className="hover:text-accent transition">ID/PW 찾기</Link>
                  </div>
                </form>

                {/* ─── 또는 ─── */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                    <span className="bg-surface px-3 text-dim">또는</span>
                  </div>
                </div>

                {/* ─── 소셜 로그인 (가로 아이콘) ─── */}
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={googleLoading || loading}
                    aria-label="Google로 로그인"
                    title="Google로 로그인"
                    className="w-12 h-12 rounded-full bg-white border border-border hover:border-accent/50 hover:shadow-md flex items-center justify-center transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {googleLoading ? (
                      <span className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
                        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
                        <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
                      </svg>
                    )}
                  </button>
                </div>

              </div>
            </div>

            {/* 우측 하단 — 푸터 링크 */}
            <div className="px-6 lg:px-10 pb-6 flex items-center justify-center gap-3 text-[11px] text-dim">
              <Link href="/terms" className="hover:text-accent transition">이용약관</Link>
              <span className="text-border">·</span>
              <Link href="/privacy" className="hover:text-accent transition">개인정보처리방침</Link>
            </div>
          </div>
        </section>
      </div>

      <DemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 z-50 bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
