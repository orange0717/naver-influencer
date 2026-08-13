/**
 * credit-purchase.ts — 크레딧 충전(구매) 로직 (Service Role 전용).
 *
 * 두 결제 수단:
 *   1) N캐시 즉시 차감 (PG 불필요) — useNcash → grantCredit. 실패 시 N캐시 환불.
 *   2) 현금(PortOne) — 구독과 동일한 prepare/complete 2단계 서버 검증. 성공 시에만 크레딧 지급.
 *
 * 원칙:
 *   - 상품/가격은 settings(getCreditPackage) 에서 읽는다(관리자 설정, 폴백 credit-config).
 *   - 1 N캐시 = 1원. N캐시 차감액 = 상품 amount(원).
 *   - 멱등: 현금은 payment_transactions.payment_id UNIQUE + grantCredit(ref=payment_id),
 *           N캐시는 purchaseId 기반 ref 로 useNcash/grantCredit 모두 멱등.
 *   - 크레딧 구매 intent 는 plan_key 에 CREDIT_* 키를 저장 → 구독 complete 흐름과 완전히 분리.
 */
import { createServiceClient } from '@/lib/supabase-server';
import { preRegisterPayment, getPayment } from '@/lib/portone';
import { grantCredit } from '@/lib/credits';
import { getNcashBalance, addNcash, spendNcash } from '@/lib/n-cash';
import { getCreditPackage } from '@/lib/settings';

/* ── 1) N캐시로 즉시 구매 ─────────────────────────────────────────────── */
export async function purchaseCreditsWithNcash(opts: {
  userId: string;
  packageKey: string;
  /** 클라이언트 재제출 방지용 멱등 키(선택). 없으면 서버 생성 — 이 경우 재시도는 새 구매가 된다. */
  idempotencyKey?: string;
}): Promise<
  | { ok: true; credits: number; creditBalance: number; ncashBalance: number; idempotent?: boolean }
  | { ok: false; error: string; code: 'invalid_package' | 'insufficient_ncash'; ncashBalance?: number; required?: number }
> {
  const pkg = await getCreditPackage(opts.packageKey);
  if (!pkg) return { ok: false, error: '유효하지 않은 크레딧 상품입니다.', code: 'invalid_package' };

  const cost = pkg.amount; // 1 N캐시 = 1원
  const purchaseId = opts.idempotencyKey || crypto.randomUUID();
  const ref = `credit_purchase:${purchaseId}`;

  // N캐시 차감 (원자적·멱등)
  const spend = await spendNcash(opts.userId, cost, 'credit_purchase', { referenceId: ref });
  if (!spend.ok) {
    return {
      ok: false,
      error: `N캐시가 부족합니다. (필요 ${cost} · 보유 ${spend.balance})`,
      code: 'insufficient_ncash',
      ncashBalance: spend.balance,
      required: cost,
    };
  }

  // 크레딧 지급 (멱등 — 동일 ref 재지급 안 함)
  try {
    const creditBalance = await grantCredit(opts.userId, pkg.credits, 'purchase', { referenceId: ref });
    return {
      ok: true,
      credits: pkg.credits,
      creditBalance,
      ncashBalance: spend.balance,
      idempotent: spend.idempotent,
    };
  } catch (e) {
    // 크레딧 지급 실패 → N캐시 환불(멱등)
    console.error('[CreditPurchase] grant after ncash spend failed, refunding:', e, { userId: opts.userId, ref });
    await addNcash(opts.userId, cost, 'refund', { referenceId: `refund:${ref}` });
    const ncashBalance = await getNcashBalance(opts.userId);
    return { ok: false, error: '크레딧 지급 중 오류가 발생했습니다. N캐시는 환불되었습니다.', code: 'invalid_package', ncashBalance };
  }
}

/* ── 2) 현금(PortOne) 구매: prepare ──────────────────────────────────── */
export async function prepareCreditPurchase(
  userId: string,
  packageKey: string,
): Promise<{ paymentId: string; name: string; amount: number; credits: number } | { error: string }> {
  const pkg = await getCreditPackage(packageKey);
  if (!pkg) return { error: '유효하지 않은 크레딧 상품입니다.' };

  // KPN PG 제약: 영숫자만 + 32바이트 이하 → 'p' + UUID 24자 = 25자 (billing.ts 와 동일 규칙)
  const paymentId = 'p' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const supa = createServiceClient();

  const { error: intentErr } = await supa.from('payment_intents').insert({
    payment_id: paymentId,
    user_id: userId,
    plan_key: pkg.key, // CREDIT_* 키 저장 → complete 에서 상품/금액 재검증의 기준
    amount: pkg.amount,
    type: 'charge',
  });
  if (intentErr) {
    console.error('[CreditPurchase] intent insert failed:', intentErr);
    return { error: '결제 준비 중 오류가 발생했습니다.' };
  }

  const pre = await preRegisterPayment(paymentId, pkg.amount);
  if (!pre.ok) return { error: '결제 게이트웨이 오류. 잠시 후 다시 시도해주세요.' };

  return { paymentId, name: pkg.name, amount: pkg.amount, credits: pkg.credits };
}

/* ── 2) 현금(PortOne) 구매: complete (서버 검증 → 크레딧 지급, 구독 생성 없음) ── */
export async function completeCreditPurchase(opts: {
  userId: string;
  paymentId: string;
}): Promise<{ ok: true; credits: number; creditBalance: number } | { ok: false; error: string }> {
  // 1. PortOne 결제 상태 조회
  const payData = await getPayment(opts.paymentId);
  if (!payData) return { ok: false, error: '결제 정보를 조회할 수 없습니다.' };
  if (payData.status !== 'PAID') {
    return { ok: false, error: `결제가 완료되지 않았습니다. (status=${payData.status})` };
  }

  const supa = createServiceClient();

  // 2. intent 검증 — 상품/금액은 서버가 사전등록한 intent 로만 결정(클라 값 불신)
  const { data: intent } = await supa
    .from('payment_intents')
    .select('*')
    .eq('payment_id', opts.paymentId)
    .single();
  if (!intent || intent.user_id !== opts.userId) {
    return { ok: false, error: '결제 사전등록을 찾을 수 없습니다.' };
  }

  const pkg = await getCreditPackage(intent.plan_key as string);
  if (!pkg) return { ok: false, error: '유효하지 않은 크레딧 상품입니다.' };

  // 3중 금액 검증: 상품 정가 == 사전등록 금액 == 실제 결제 금액
  const paidTotal = Number(payData.amount?.total);
  if (Number(pkg.amount) !== Number(intent.amount) || paidTotal !== Number(intent.amount)) {
    console.error('[CreditPurchase] amount mismatch:', { pkgAmount: pkg.amount, intentAmount: intent.amount, paidTotal });
    return { ok: false, error: '결제 금액이 일치하지 않습니다.' };
  }

  // 3. 결제 내역 기록 (멱등 — payment_id UNIQUE). charge_type='manual', plan_key=CREDIT_*.
  const { error: txErr } = await supa.from('payment_transactions').insert({
    user_id: opts.userId,
    payment_id: opts.paymentId,
    transaction_id: payData.transactionId || null,
    plan_key: pkg.key,
    amount: intent.amount,
    status: 'PAID',
    pay_method: payData.method?.type || 'CARD',
    charge_type: 'manual',
    raw_response: payData as object,
  });
  if (txErr && !txErr.message?.includes('duplicate')) {
    console.error('[CreditPurchase] tx insert failed:', txErr);
  }

  // 4. 크레딧 지급 (멱등 — payment_id 기준). 콜백 중복 호출에도 1회만 지급.
  const creditBalance = await grantCredit(opts.userId, pkg.credits, 'purchase', { referenceId: `credit_cash:${opts.paymentId}` });

  return { ok: true, credits: pkg.credits, creditBalance };
}
