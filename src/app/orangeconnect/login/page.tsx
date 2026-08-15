'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { withTimeout, TimeoutError } from '@/lib/with-timeout';

export default function AdLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const router = useRouter();

  const handleLogin = async () => {
    setError('');
    if (!email.trim()) return setError('이메일을 입력해주세요.');
    if (!password) return setError('비밀번호를 입력해주세요.');
    if (loading) return; // 중복 클릭 방지

    setLoading(true);
    const t0 = performance.now();
    let stage = 'auth';

    // 콘솔 출력 + 서버 집계(로그인 성공률/실패원인) 동시 기록. 집계 실패가
    // 로그인 흐름을 막으면 안 되므로 응답을 기다리지 않는다(fire-and-forget).
    const report = (result: 'success' | 'fail', reason?: string) => {
      const totalMs = Math.round(performance.now() - t0);
      const line = `[ad-login] result=${result}${reason ? ` reason=${reason}` : ''} total=${totalMs}ms`;
      if (result === 'success') console.info(line);
      else console.error(line);
      fetch('/api/auth/login-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'ad', result, reason, totalMs }),
      }).catch(() => {});
    };

    try {
      const supabase = createSupabaseBrowserClient();

      // signInWithPassword가 응답 없이 멈추면 finally가 실행되지 않아 버튼이
      // "로그인 중..."에 무한정 멈춘다 → 8초 타임아웃으로 강제 종료시킨다.
      stage = 'auth';
      const tAuth = performance.now();
      const { error: authError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
        8000,
        '로그인 인증',
      );
      console.info(`[ad-login] auth stage=${Math.round(performance.now() - tAuth)}ms`);

      if (authError) {
        setError('이메일 또는 비밀번호가 일치하지 않습니다.');
        report('fail', 'auth_error');
        return;
      }

      // 광고주 계정인지 확인
      stage = 'ad-check';
      const tCheck = performance.now();
      const res = await withTimeout(fetch('/api/ad/auth/me'), 6000, '광고주 계정 확인');
      console.info(`[ad-login] ad-check stage=${Math.round(performance.now() - tCheck)}ms`);
      if (!res.ok) {
        await supabase.auth.signOut().catch(() => {});
        setError('광고주 계정이 아닙니다. 일반 회원은 N인플 로그인을 이용해주세요.');
        report('fail', 'not_ad_account');
        return;
      }
      const data = await res.json();
      if (!data.id) {
        await supabase.auth.signOut().catch(() => {});
        setError('광고주 계정이 아닙니다. 일반 회원은 N인플 로그인을 이용해주세요.');
        report('fail', 'no_ad_id');
        return;
      }

      // 동시 로그인 기기 제한 — 디바이스 등록
      stage = 'session-register';
      const tSession = performance.now();
      try {
        const { getDeviceId } = await import('@/lib/device-id');
        getDeviceId();
        await fetch('/api/session/register', { method: 'POST' });
      } catch { /* ignore */ }
      console.info(`[ad-login] session-register stage=${Math.round(performance.now() - tSession)}ms`);

      stage = 'redirect';
      const tRedirect = performance.now();
      router.push('/orangeconnect/dashboard');
      router.refresh();
      console.info(`[ad-login] redirect stage=${Math.round(performance.now() - tRedirect)}ms`);

      report('success');
    } catch (err) {
      const timedOut = err instanceof TimeoutError;
      setError(
        timedOut
          ? '로그인 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          : '로그인 중 오류가 발생했습니다.',
      );
      console.error(`[ad-login] stage=${stage}`, err);
      report('fail', timedOut ? 'timeout' : 'exception');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleLogin();
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center -mt-6">
      <div className="w-full max-w-sm mx-auto px-4">
        <div className="bg-surface rounded-lg border border-border p-8 space-y-6">
          {/* 헤더 */}
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
              AD
            </div>
            <h1 className="type-page-title">광고주 로그인</h1>
            <p className="text-sm text-dim mt-1">인플루언서 마케팅 플랫폼</p>
          </div>

          <div className="space-y-4 animate-fade-in-up">
            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="example@company.com" autoFocus
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            <div>
              <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="비밀번호를 입력해주세요"
                className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder:text-dim/60 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition" />
            </div>

            {error && (
              <div className="bg-down/10 border border-down/30 rounded-xl p-3 text-sm text-down text-center">{error}</div>
            )}

            <button type="button" onClick={handleLogin} disabled={loading}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : '로그인'}
            </button>

            <p className="text-[10px] text-dim text-center">
              계정이 없으신가요?{' '}
              <Link href="/orangeconnect/signup" className="text-accent underline hover:text-accent-hover">회원가입</Link>
            </p>

            <div className="border-t border-border pt-3">
              <p className="text-[10px] text-dim text-center">
                인플루언서/블로거이신가요?{' '}
                <Link href="/auth/login" className="text-accent underline hover:text-accent-hover">N인플 로그인</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
