'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  PLAN_LABEL,
  calcNextBillingAt,
  formatKRW,
  invitableSeats,
  isPlanId,
  type PlanId,
} from '@/lib/pricing';

const STORE_ID = process.env.NEXT_PUBLIC_PORTONE_STORE_ID || '';
const CHANNEL_KEY = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY || '';

type OrderSummary = {
  orderId: string;
  companyName: string;
  planId: PlanId;
  seatCount: number;
  seatPrice: number;
  amount: number;
  status: 'pending_payment' | 'paid' | 'failed' | 'cancelled';
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
      <div className="mx-auto max-w-lg">{children}</div>
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

export default function CheckoutClient() {
  const params = useSearchParams();
  const orderId = params.get('order') || '';
  const { user, isLoading, isError } = useAuth();

  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 서버가 가른 '주문 없음'(404)과 '못 읽음'(500)을 화면에서 다시 합치지 않기 위한 값.
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payMessage, setPayMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);

  const loadOrder = useCallback(async () => {
    setLoadError(null);
    setErrorCode(null);
    if (!orderId) {
      setErrorCode('NOT_FOUND');
      setLoadError('주문 정보가 없습니다. 기업용 가입을 처음부터 진행해주세요.');
      setLoaded(true);
      return;
    }
    try {
      const res = await fetch(`/api/org/orders/${encodeURIComponent(orderId)}`, {
        headers: await authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorCode(body?.error?.code || 'INTERNAL_ERROR');
        setLoadError(body?.error?.message || '주문을 불러오지 못했습니다.');
        return;
      }
      setOrder(body as OrderSummary);
      // 모바일 리다이렉트 결제는 결과 콜백 없이 이 화면으로 되돌아온다.
      // 확정은 웹훅이 하므로, 돌아왔을 때 이미 paid 면 그대로 완료 화면을 보여준다.
      if (body?.status === 'paid') setDone(true);
    } catch {
      setErrorCode('NETWORK_ERROR');
      setLoadError('네트워크 오류로 주문을 불러오지 못했습니다.');
    } finally {
      setLoaded(true);
    }
  }, [orderId]);

  useEffect(() => {
    if (isLoading || isError || !user.id) return;
    void loadOrder();
  }, [isLoading, isError, user.id, loadOrder]);

  const handlePay = async () => {
    if (!order || inFlight.current) return;
    setPayMessage(null);

    if (!STORE_ID || !CHANNEL_KEY) {
      setPayMessage({ type: 'error', text: '결제 시스템이 아직 설정되지 않았습니다.' });
      return;
    }
    if (typeof window === 'undefined' || !window.PortOne) {
      setPayMessage({ type: 'error', text: '결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해주세요.' });
      return;
    }

    inFlight.current = true;
    setPaying(true);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) };

      const prepareRes = await fetch('/api/org/checkout/prepare', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const prepared = await prepareRes.json().catch(() => ({}));

      if (!prepareRes.ok) {
        // 이미 결제된 주문이면 실패가 아니라 완료다.
        if (prepared?.error?.code === 'ORG_ALREADY_ACTIVE') {
          setDone(true);
          return;
        }
        setPayMessage({ type: 'error', text: prepared?.error?.message || '결제를 준비하지 못했습니다.' });
        return;
      }

      const result = await window.PortOne.requestPayment({
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        paymentId: prepared.paymentId,
        orderName: prepared.orderName,
        totalAmount: prepared.amount,
        currency: 'CURRENCY_KRW',
        payMethod: 'CARD',
        redirectUrl: `${window.location.origin}/enterprise/checkout?order=${encodeURIComponent(order.orderId)}`,
      });

      if (result?.code) {
        setPayMessage(
          result.code === 'USER_CANCEL'
            ? { type: 'info', text: '결제가 취소되었습니다. 입력하신 내용은 그대로 남아 있습니다.' }
            : { type: 'error', text: result.message || '결제에 실패했습니다.' },
        );
        return;
      }

      const completeRes = await fetch('/api/org/checkout/complete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ paymentId: prepared.paymentId }),
      });
      const completed = await completeRes.json().catch(() => ({}));

      if (!completeRes.ok) {
        setPayMessage({
          type: 'error',
          text:
            completed?.error?.message ||
            '결제 확인에 실패했습니다. 금액이 빠져나갔다면 잠시 후 이 화면을 새로고침해주세요.',
        });
        return;
      }

      setDone(true);
    } catch (e) {
      console.error('[enterprise/checkout] error:', e);
      setPayMessage({ type: 'error', text: '네트워크 오류로 결제를 마치지 못했습니다. 잠시 후 다시 시도해주세요.' });
    } finally {
      inFlight.current = false;
      setPaying(false);
    }
  };

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
        body="결제를 진행하려면 기업 가입을 신청한 계정으로 로그인해주세요."
        action={
          <Link
            href={`/auth/login?redirect=${encodeURIComponent(`/enterprise/checkout?order=${orderId}`)}`}
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            로그인하러 가기
          </Link>
        }
      />
    );
  }

  // 주문 조회는 로그인 확인 뒤에야 시작되므로, 로그인 판정보다 먼저 볼 수 없다.
  if (!loaded) {
    return <div className="bg-bg px-4 py-24 text-center text-sm text-dim md:py-32">불러오는 중…</div>;
  }

  // 결제 직전 화면이다. '못 읽은' 것을 '주문이 없다'로 보여주면 방금 만든 주문이
  // 사라졌다고 믿고 처음부터 다시 신청한다 — 같은 주문이 두 개 생긴다.
  if (loadError && errorCode !== 'NOT_FOUND' && errorCode !== 'FORBIDDEN') {
    return (
      <Notice
        title="주문 정보를 불러오지 못했습니다"
        body={`${loadError} 주문이 취소된 것은 아닙니다. 다시 시도해도 같으면 처음부터 신청하지 마시고 고객센터로 문의해주세요.`}
        action={
          <button
            type="button"
            onClick={() => { setLoaded(false); void loadOrder(); }}
            className="inline-block rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            다시 시도
          </button>
        }
      />
    );
  }

  if (loadError || !order) {
    return (
      <Notice
        title="주문을 찾을 수 없습니다"
        body={loadError || '주문 정보를 찾을 수 없습니다. 주소가 잘못되었거나 이미 처리된 주문일 수 있습니다.'}
        action={
          <Link
            href="/enterprise/signup"
            className="inline-block rounded-xl border border-border px-5 py-3 text-sm font-bold text-text transition hover:border-accent/40"
          >
            기업용 가입으로 돌아가기
          </Link>
        }
      />
    );
  }

  const planLabel = isPlanId(order.planId) ? PLAN_LABEL[order.planId] : order.planId;

  if (done) {
    const nextBilling = calcNextBillingAt(new Date());
    return (
      <Shell>
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="font-title text-xs font-semibold tracking-[0.18em] text-accent">COMPLETE</p>
          <h1 className="font-editorial mt-3 text-2xl leading-tight text-text">결제가 완료되었습니다</h1>
          <p className="mt-3 text-sm leading-relaxed text-text-2">
            {order.companyName} 기업 계정이 활성화되었습니다.
            <br />
            초대하신 {invitableSeats(order.seatCount)}분께 초대 메일을 보내드렸습니다.
          </p>

          <dl className="mt-6 space-y-2.5 rounded-xl border border-border bg-bg p-5 text-left text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-2">주문번호</dt>
              <dd className="font-mono text-xs text-text">{order.orderId}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-2">요금제</dt>
              <dd className="font-semibold text-text tabular-nums">
                {planLabel} · {order.seatCount}좌석
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-2">결제 금액</dt>
              <dd className="font-bold text-text tabular-nums">{formatKRW(order.amount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-text-2">다음 결제 예정일</dt>
              <dd className="font-semibold text-text tabular-nums">
                {nextBilling.toLocaleDateString('ko-KR')}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-dim">
            자동으로 청구되지 않습니다. 이용 기간이 끝나기 전에 안내를 드리면 다시 결제해주세요.
          </p>

          <Link
            href="/enterprise/manage"
            className="mt-6 inline-block rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-accent-hover"
          >
            기업 계정 관리로 이동
          </Link>
          <div className="mt-4">
            <Link href="/my" className="text-sm text-text-2 underline transition hover:text-text">
              대시보드로 이동
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-8 text-center">
        <span className="font-title text-xs font-semibold tracking-[0.18em] text-accent">FOR BUSINESS</span>
        <h1 className="font-editorial mt-3 text-2xl leading-tight text-text md:text-3xl">결제</h1>
        <p className="mt-3 text-sm leading-relaxed text-text-2">
          아래 내용으로 결제를 진행합니다. 결제가 완료되면 초대 메일이 발송됩니다.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 md:p-8">
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-2">기업명</dt>
            <dd className="font-semibold text-text">{order.companyName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-2">요금제</dt>
            <dd className="font-semibold text-text">{planLabel}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-text-2">이용 인원</dt>
            <dd className="font-semibold text-text tabular-nums">
              {order.seatCount}좌석 (대표 계정 포함)
            </dd>
          </div>
        </dl>

        <div className="mt-5 border-t border-border pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-text-2 tabular-nums">
              {formatKRW(order.seatPrice)} × {order.seatCount}좌석
            </span>
            <span className="font-editorial text-2xl text-text tabular-nums">{formatKRW(order.amount)}</span>
          </div>
          <p className="mt-1 text-right text-[11px] font-semibold text-accent">월 요금 · VAT 포함</p>
        </div>

        <p className="mt-5 rounded-xl border border-border bg-bg p-4 text-xs leading-relaxed text-text-2">
          한 달치를 미리 결제하는 방식이며 <strong className="font-bold text-text">자동으로 재청구되지 않습니다</strong>.
          이용 기간이 끝나기 전에 안내를 드리면 그때 다시 결제해주세요.
        </p>

        <button
          type="button"
          onClick={handlePay}
          disabled={paying}
          className="mt-6 w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-white transition hover:bg-accent-hover disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/40"
        >
          {paying ? '결제 진행 중…' : `${formatKRW(order.amount)} 결제하기`}
        </button>

        {payMessage && (
          <p className={`mt-3 text-center text-xs ${payMessage.type === 'error' ? 'text-down' : 'text-text-2'}`}>
            {payMessage.text}
          </p>
        )}
      </div>
    </Shell>
  );
}
