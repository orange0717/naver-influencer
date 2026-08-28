'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { PLAN_LABEL, formatKRW, invitableSeats, isPlanId, type PlanId } from '@/lib/pricing';

type Member = { email: string; role: 'OWNER' | 'MEMBER'; joined_at: string };
type PendingInvite = { email: string; expires_at: string };

type Subscription = {
  orgId: string;
  companyName: string;
  status: 'pending_payment' | 'active' | 'expired' | 'cancelled';
  planId: PlanId;
  seatPrice: number;
  seatCount: number;
  usedSeats: number;
  pendingSeatCount: number | null;
  amount: number;
  nextBillingDate: string | null;
  members: Member[];
  pendingInvites: PendingInvite[];
};

const STATUS_LABEL: Record<Subscription['status'], string> = {
  pending_payment: '결제 대기',
  active: '이용 중',
  expired: '이용 기간 종료',
  cancelled: '해지됨',
};

async function authHeaders(): Promise<Record<string, string>> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase-browser');
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-bg px-4 py-12 md:py-16">
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <Shell>
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <h1 className="font-title mb-3 text-lg text-text">{title}</h1>
        <p className="text-sm leading-relaxed text-text-2">{body}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </Shell>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('ko-KR');
}

export default function ManageClient() {
  const { user, isLoading, isError } = useAuth();

  const [data, setData] = useState<Subscription | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 서버는 '소속이 없음'(404)과 '못 읽음'(500)을 이미 갈라서 준다. 코드를 버리고 문구만
  // 받으면 화면에서 다시 하나로 뭉개진다 — 실제로 그랬다.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setErrorCode(null);
    try {
      const res = await fetch('/api/org/subscription', { headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorCode(body?.error?.code || 'INTERNAL_ERROR');
        setLoadError(body?.error?.message || '기업 계정 정보를 불러오지 못했습니다.');
        return;
      }
      setData(body as Subscription);
    } catch {
      setErrorCode('NETWORK_ERROR');
      setLoadError('네트워크 오류로 기업 계정 정보를 불러오지 못했습니다.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoading || isError || !user.id) return;
    void load();
  }, [isLoading, isError, user.id, load]);

  if (isLoading) {
    return <div className="bg-bg px-4 py-24 text-center text-sm text-dim md:py-32">불러오는 중…</div>;
  }

  // 백엔드 일시 장애를 "비회원"으로 확정해 로그인 화면으로 튕기지 않는다.
  if (isError) {
    return (
      <Notice
        title="잠시 후 다시 시도해주세요"
        body="로그인 상태를 확인하지 못했습니다. 네트워크 상태를 확인한 뒤 새로고침해주세요."
      />
    );
  }

  if (!user.id) {
    return (
      <Notice
        title="로그인이 필요합니다"
        body="기업 계정 관리는 대표 계정으로 로그인하셔야 확인하실 수 있습니다."
        action={
          <Link
            href={`/auth/login?redirect=${encodeURIComponent('/enterprise/manage')}`}
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            로그인하러 가기
          </Link>
        }
      />
    );
  }

  // 조회는 로그인 확인 뒤에야 시작되므로, 로그인 판정보다 먼저 볼 수 없다.
  if (!loaded) {
    return <div className="bg-bg px-4 py-24 text-center text-sm text-dim md:py-32">불러오는 중…</div>;
  }

  // 아직 기업 계정이 없는 상태. 장애가 아니므로 '불러오지 못했습니다'라고 하면 안 된다 —
  // 가입하면 되는 사람에게 서비스가 고장 난 것처럼 보인다.
  if (errorCode === 'NOT_FOUND') {
    return (
      <Notice
        title="아직 기업 계정이 없습니다"
        body="이 계정은 어느 기업 계정에도 속해 있지 않습니다. 회사 좌석을 새로 만들려면 기업용 가입에서 시작하시고, 이미 초대를 받으셨다면 메일의 초대 링크로 들어와 주세요."
        action={
          <Link
            href="/enterprise/signup"
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            기업용 가입 안내
          </Link>
        }
      />
    );
  }

  // 멤버(비대표)에게 가입 링크를 주면 회사 좌석이 이미 있는데도 두 번째 조직을 만들러 간다.
  if (errorCode === 'FORBIDDEN') {
    return (
      <Notice
        title="대표 계정만 볼 수 있는 화면입니다"
        body={loadError || '기업 계정의 결제·좌석 정보는 대표 계정만 확인하실 수 있습니다.'}
        action={
          <Link
            href="/my"
            className="inline-block rounded-xl border border-border px-5 py-3 text-sm font-bold text-text transition hover:border-accent/40"
          >
            내 대시보드로 가기
          </Link>
        }
      />
    );
  }

  // 여기부터가 진짜 '못 읽은' 경우다. 가입을 권하지 않고 다시 시도할 방법을 준다.
  if (loadError || !data) {
    return (
      <Notice
        title="기업 계정 정보를 불러오지 못했습니다"
        body={`${loadError || '기업 계정 정보를 찾을 수 없습니다.'} 기업 계정이 사라진 것은 아니니 잠시 후 다시 시도해주세요.`}
        action={
          <button
            type="button"
            onClick={() => { setLoaded(false); void load(); }}
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            다시 시도
          </button>
        }
      />
    );
  }

  const planLabel = isPlanId(data.planId) ? PLAN_LABEL[data.planId] : data.planId;
  const emptySeats = Math.max(0, data.seatCount - data.usedSeats);

  return (
    <Shell>
      <div className="mb-8">
        <span className="font-title text-xs font-semibold tracking-[0.18em] text-accent">FOR BUSINESS</span>
        <h1 className="font-editorial mt-3 text-2xl leading-tight text-text md:text-3xl">{data.companyName}</h1>
        <p className="mt-2 text-sm text-text-2">
          {planLabel} · {STATUS_LABEL[data.status]}
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-6 md:p-8">
        <h2 className="font-title text-sm font-bold text-text">구독 현황</h2>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-2">요금제</dt>
            <dd className="font-semibold text-text">{planLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-2">좌석</dt>
            <dd className="font-semibold text-text tabular-nums">
              {data.usedSeats} / {data.seatCount}좌석 사용 중
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-2">월 요금</dt>
            <dd className="font-bold text-text tabular-nums">{formatKRW(data.amount)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-2">이용 만료일</dt>
            <dd className="font-semibold text-text tabular-nums">{formatDate(data.nextBillingDate)}</dd>
          </div>
        </dl>

        <p className="mt-5 rounded-xl border border-border bg-bg p-4 text-xs leading-relaxed text-text-2">
          대표 계정도 1좌석을 사용합니다. 지금 요금제로 초대하실 수 있는 인원은{' '}
          <strong className="font-bold text-text">{invitableSeats(data.seatCount)}명</strong>이며, 남은 좌석은{' '}
          <strong className="font-bold text-text">{emptySeats}석</strong>입니다.
          <br />
          자동으로 재청구되지 않습니다. 만료일 전에 안내를 드리면 그때 다시 결제해주세요.
        </p>
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-surface p-6 md:p-8">
        <h2 className="font-title text-sm font-bold text-text">멤버 {data.members.length}명</h2>

        <ul className="mt-4 divide-y divide-border">
          {data.members.map((m) => (
            <li key={m.email} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-text">{m.email}</p>
                <p className="mt-0.5 text-[11px] text-dim tabular-nums">{formatDate(m.joined_at)} 합류</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  m.role === 'OWNER' ? 'bg-accent/10 text-accent' : 'border border-border text-text-2'
                }`}
              >
                {m.role === 'OWNER' ? '대표' : '멤버'}
              </span>
            </li>
          ))}
        </ul>

        {data.pendingInvites.length > 0 && (
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-xs font-bold text-text-2">수락 대기 중인 초대 {data.pendingInvites.length}건</h3>
            <ul className="mt-3 space-y-2">
              {data.pendingInvites.map((inv) => (
                <li key={inv.email} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-text-2">{inv.email}</span>
                  <span className="shrink-0 text-[11px] text-dim tabular-nums">
                    {formatDate(inv.expires_at)}까지
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-dim">
              초대를 수락하기 전까지는 좌석을 차지하지 않습니다.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-surface p-6 md:p-8">
        <h2 className="font-title text-sm font-bold text-text">요금제 변경 · 해지</h2>
        <p className="mt-2 text-xs leading-relaxed text-text-2">
          좌석 증감과 해지 시 정산 방식이 확정되기 전까지는 화면에서 직접 처리하실 수 없습니다. 변경이 필요하시면
          고객센터로 문의해주세요.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-dim opacity-60"
          >
            좌석 변경 (준비 중)
          </button>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-dim opacity-60"
          >
            해지하기 (준비 중)
          </button>
        </div>
      </section>

      <div className="mt-8 text-center">
        <Link href="/my" className="text-sm text-text-2 underline transition hover:text-text">
          대시보드로 돌아가기
        </Link>
      </div>
    </Shell>
  );
}
