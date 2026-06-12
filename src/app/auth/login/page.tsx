'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { login as gaLogin } from '@/lib/gtag';
import DemoModal from '@/components/DemoModal';
import { LandingPrimaryCta } from '@/components/landing/LandingPrimaryCta';
import { LandingTrialCta } from '@/components/landing/LandingTrialCta';
import { subscribeNewInfluencerWeekBoundaryRefresh } from '@/lib/new-influencer-week-kst';

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
  const [maintenance, setMaintenance] = useState(false);
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
    const load = () => {
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
    };
    load();
    const unsub = subscribeNewInfluencerWeekBoundaryRefresh(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
      unsub();
    };
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
    let settled = false;
    // Supabase 가 응답하지 않으면(점검·장애) getUser 가 영영 resolve 되지 않아
    // 스피너가 무한히 돈다. 8초 내 응답이 없으면 점검 안내 화면으로 전환.
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      setMaintenance(true);
    }, 8000);
    supabase.auth
      .getUser()
      .then(async ({ data: { user: authUser } }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
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
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        setMaintenance(true);
      });
    return () => clearTimeout(timer);
  }, [redirectTo, router]);

  if (maintenance) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-bg px-6">
        <div className="w-full max-w-sm space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-extrabold tracking-tight text-text">시스템 점검 중입니다</h2>
            <p className="text-sm leading-relaxed text-dim">
              현재 서비스 점검으로 일시적으로 로그인이 어렵습니다.<br />
              빠르게 정상화하겠습니다. 잠시 후 다시 이용해 주세요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div data-landing-login
      className="fixed inset-0 z-[200] bg-bg flex items-center justify-center">
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
    <div className="fixed inset-0 z-[200] bg-bg overflow-y-auto overflow-x-hidden overscroll-y-contain">
      <div className="flex min-h-[100svh] min-h-[100dvh] flex-col lg:h-[100svh] lg:max-h-[100svh] lg:min-h-0 lg:flex-row lg:overflow-hidden">
        {/* ─── 좌측: 그라디언트 히어로 ─── */}
        <aside className="relative flex min-h-[280px] flex-1 flex-col overflow-x-hidden bg-gradient-to-br from-[#7A4F45] via-[#BF877A] to-[#D9ABA0] text-white lg:min-h-0 lg:h-full lg:overflow-y-auto">
          <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-[#F2E2DC]/40 blur-3xl" />
          <div className="pointer-events-none absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-[#7A4F45]/30 blur-3xl" />

          {/* 모바일 */}
          <div className="relative px-6 pb-12 pt-10 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2 text-white/90 transition hover:text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white font-extrabold text-accent">N</span>
              <span className="font-bold tracking-tight">N인플</span>
              <span className="ml-1 rounded-md border border-white/30 bg-white/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider backdrop-blur-sm">BETA</span>
            </Link>
            <p className="mt-9 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-white/95 backdrop-blur-sm">
              블로거에서 인플루언서로
            </p>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight">
              감으로 쓰던 블로그를,<br />
              데이터로 다시 씁니다.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/85">
              키워드 분석부터 글 피드백까지,<br />
              네이버 블로그 성장에 필요한 모든 것
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-3">
              <LandingTrialCta size="sm" onClick={() => setDemoOpen(true)} />
              <LandingPrimaryCta size="sm" href="/stories">
                성장후기
              </LandingPrimaryCta>
            </div>
          </div>

          {/* 데스크탑 */}
          <div className="relative hidden min-h-0 flex-1 flex-col justify-between p-12 xl:p-16 lg:flex">
            <Link href="/" className="group mb-10 inline-flex w-fit items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-xl font-extrabold text-accent shadow-lg shadow-black/10 transition group-hover:scale-105">
                N
              </span>
              <span className="text-lg font-bold tracking-tight">N인플</span>
              <span className="ml-1 rounded-md border border-white/30 bg-white/20 px-2 py-0.5 text-[10px] font-bold tracking-wider backdrop-blur-sm">
                BETA
              </span>
            </Link>

            <div className="max-w-xl space-y-6">
              <span className="inline-block rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold tracking-tight text-white/95 backdrop-blur-sm">
                블로거에서 인플루언서로
              </span>
              <h1 className="text-5xl font-extrabold leading-[1.15] tracking-tight xl:text-6xl">
                감으로 쓰던 블로그를,<br />
                데이터로 다시 씁니다.
              </h1>
              <p className="text-lg leading-relaxed text-white/90 xl:text-xl">
                키워드 분석부터 글 피드백까지,<br />
                네이버 블로그 성장에 필요한 모든 것
              </p>

              <div className="grid max-w-md grid-cols-2 gap-3 pt-6">
                <div className="rounded-2xl border border-white/25 bg-white/15 p-4 backdrop-blur-sm">
                  <div className="mb-1 text-xs text-white/75">이번 주 신규 인플루언서</div>
                  <div className="font-mono text-2xl font-extrabold tracking-tight">
                    {stats.new_count === null ? '—' : `+${stats.new_count.toLocaleString()}`}
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-emerald-200">▲ 새로 합류</div>
                  <div className="mt-2 text-[10px] leading-snug text-white/65">집계 주간: 매주 월요일 0시(KST) 전환</div>
                </div>
                <div className="rounded-2xl border border-white/25 bg-white/15 p-4 backdrop-blur-sm">
                  <div className="mb-1 text-xs text-white/75">활동하는 인플루언서</div>
                  <div className="font-mono text-2xl font-extrabold tracking-tight">
                    {stats.active_count === null ? '—' : stats.active_count.toLocaleString()}
                  </div>
                  <div className="mt-1 text-[11px] text-white/75">실시간 집계</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <LandingTrialCta size="md" onClick={() => setDemoOpen(true)} />
                <LandingPrimaryCta size="md" href="/stories">
                  성장후기
                </LandingPrimaryCta>
              </div>
            </div>

            <div className="mt-12 flex items-center gap-2 text-xs text-white/70">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                현재 베타 프로그램 운영 중
              </span>
              <span className="text-white/40">·</span>
              <span>© {new Date().getFullYear()} N인플</span>
            </div>
          </div>
        </aside>

        {/* ─── 우측: 로그인 — 세로 정중앙 ─── */}
        <section className="relative flex w-full min-h-[100svh] min-h-[100dvh] flex-col bg-surface lg:h-full lg:min-h-0 lg:w-[480px] lg:flex-shrink-0 xl:w-[520px]">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-6 pt-6 lg:px-10">
            <Link
              href="/"
              className="pointer-events-auto inline-flex items-center gap-1 text-xs text-dim transition hover:text-accent"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              홈으로
            </Link>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center px-6 lg:px-10">
            <div className="mx-auto w-full max-w-sm space-y-6 ">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-text">로그인</h2>
                <p className="mt-1.5 text-sm text-dim">N인플 계정으로 로그인해 주세요</p>
              </div>

              {error && (
                <div className="rounded-xl border border-down/30 bg-down/10 p-3 text-sm text-down">{error}</div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-dim">이메일</label>
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    autoFocus
                    className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-dim">비밀번호</label>
                  <input
                    type="password"
                    name="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="비밀번호를 입력해주세요"
                    className="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text transition placeholder:text-dim/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full cursor-pointer rounded-xl bg-accent py-3 font-bold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      로그인 중...
                    </span>
                  ) : (
                    '로그인'
                  )}
                </button>
                <div className="flex items-center justify-center gap-3 text-xs text-dim">
                  <Link href={`/auth/signup?redirect=${encodedRedirectTo}`} className="transition hover:text-accent">
                    회원가입
                  </Link>
                  <span className="text-border">|</span>
                  <Link href="/auth/forgot" className="transition hover:text-accent">
                    ID/PW 찾기
                  </Link>
                </div>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-wider">
                  <span className="bg-surface px-3 text-dim">또는</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleLoading || loading}
                  aria-label="Google로 로그인"
                  title="Google로 로그인"
                  className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-border bg-white transition hover:border-accent/50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {googleLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400/30 border-t-gray-600" />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
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

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-3 px-6 pb-6 text-[11px] text-dim lg:px-10">
            <Link href="/terms" className="pointer-events-auto transition hover:text-accent">
              이용약관
            </Link>
            <span className="text-border">·</span>
            <Link href="/privacy" className="pointer-events-auto transition hover:text-accent">
              개인정보처리방침
            </Link>
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
      <div className="fixed inset-0 z-[200] bg-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
