'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

type InviteInfo = {
  companyName: string;
  email: string;
  planLabel: string | null;
  expiresAt: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase-browser');
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg px-4 py-16 md:py-24">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">{children}</div>
      </div>
    </div>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Shell>
      <h1 className="font-title mb-3 text-lg text-text">{title}</h1>
      <p className="text-sm leading-relaxed text-text-2">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Shell>
  );
}

export default function InviteClient() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';
  const { user, isLoading, isError } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);
  const inFlight = useRef(false);

  const loadInvite = useCallback(async () => {
    if (!token) {
      setLoadError('초대 링크가 올바르지 않습니다. 받으신 메일의 링크를 다시 눌러주세요.');
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch(`/api/org/invite?token=${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(body?.error?.message || '초대 정보를 불러오지 못했습니다.');
        return;
      }
      setInvite(body as InviteInfo);
    } catch {
      setLoadError('네트워크 오류로 초대 정보를 불러오지 못했습니다.');
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  const handleAccept = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAccepting(true);
    setAcceptError(null);
    try {
      const res = await fetch('/api/org/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ token }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAcceptError(body?.error?.message || '초대를 수락하지 못했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      setJoined(body.companyName || invite?.companyName || '기업');
      setTimeout(() => router.push('/my'), 1600);
    } catch {
      setAcceptError('네트워크 오류로 초대를 수락하지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      inFlight.current = false;
      setAccepting(false);
    }
  };

  if (isLoading || !loaded) {
    return <div className="bg-bg px-4 py-24 text-center text-sm text-dim md:py-32">불러오는 중…</div>;
  }

  if (loadError || !invite) {
    return (
      <Notice
        title="초대를 확인할 수 없습니다"
        body={loadError || '초대 정보를 찾을 수 없습니다.'}
        action={
          <Link
            href="/"
            className="inline-block rounded-xl border border-border px-5 py-3 text-sm font-bold text-text transition hover:border-accent/40"
          >
            홈으로
          </Link>
        }
      />
    );
  }

  if (joined) {
    return (
      <Notice
        title="합류가 완료되었습니다"
        body={`${joined} 기업 계정의 멤버가 되셨습니다. 대시보드로 이동합니다.`}
      />
    );
  }

  // 백엔드 일시 장애를 "비회원"으로 확정해 로그인부터 다시 시키지 않는다.
  if (isError) {
    return (
      <Notice
        title="잠시 후 다시 시도해주세요"
        body="로그인 상태를 확인하지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침해주세요."
      />
    );
  }

  const backHere = `/enterprise/invite?token=${encodeURIComponent(token)}`;

  return (
    <Shell>
      <span className="font-title text-xs font-semibold tracking-[0.18em] text-accent">INVITATION</span>
      <h1 className="font-editorial mt-3 text-2xl leading-tight text-text">
        {invite.companyName}에서
        <br />
        초대하셨습니다
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-text-2">
        수락하시면 {invite.companyName}의 좌석으로 N인플
        {invite.planLabel ? ` ${invite.planLabel}` : ''} 기능을 이용하실 수 있습니다.
      </p>

      <p className="mt-5 rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text">
        초대받은 계정
        <br />
        <strong className="font-bold">{invite.email}</strong>
      </p>

      {!user.id ? (
        <>
          <p className="mt-5 text-xs leading-relaxed text-dim">
            위 주소로 로그인하셔야 초대를 수락하실 수 있습니다.
          </p>
          <Link
            href={`/auth/login?redirect=${encodeURIComponent(backHere)}`}
            className="mt-4 inline-block w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            로그인하고 수락하기
          </Link>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting}
            className="mt-5 w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-white transition hover:bg-accent-hover disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {accepting ? '수락하는 중…' : '초대 수락하기'}
          </button>
          {acceptError && <p className="mt-3 text-xs leading-relaxed text-down">{acceptError}</p>}
          <p className="mt-3 text-xs leading-relaxed text-dim">
            다른 계정으로 로그인되어 있다면{' '}
            <Link href={`/auth/login?redirect=${encodeURIComponent(backHere)}`} className="underline">
              계정을 바꿔
            </Link>{' '}
            수락해주세요.
          </p>
        </>
      )}

      <p className="mt-5 text-[11px] text-dim tabular-nums">
        초대 유효기간: {new Date(invite.expiresAt).toLocaleDateString('ko-KR')}까지
      </p>
    </Shell>
  );
}
