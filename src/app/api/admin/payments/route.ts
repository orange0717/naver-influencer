import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';
import { getPlan } from '@/lib/payment-config';

export const dynamic = 'force-dynamic';

/**
 * 관리자 결제 내역 조회.
 *
 * ⚠️ 이 라우트는 2026-05-03 `7e00b32a`(PortOne 재구성 Stage 5)에서 삭제된 뒤 Stage 6~8에서
 *    복구되지 않았다. 그 사이 `/admin/payments` 화면은 fetch 실패를 빈 배열로 삼켜
 *    "결제 내역 없음"을 띄웠다 — 매출 화면에서 그건 '아무도 결제하지 않았다'로 읽힌다.
 *    2026-08-28 감사에서 발견해 현재 스키마 기준으로 다시 작성했다.
 *
 * 옛 스키마와 달라진 점(화면 컬럼도 함께 갱신했다):
 *   order_id/payment_key → payment_id (PortOne paymentId, UNIQUE)
 *   plan_name            → plan_key (표시명은 payment-config.getPlan 으로 해석)
 *   duration_days        → 없음. 플랜 정의의 months 로 대체
 *   구독 요약            → users.subscription_* 가 아니라 subscriptions 테이블이 SoT
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const search = (url.searchParams.get('search') || '').trim();
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  // 결제 내역 — 이게 이 화면의 본체다. 실패하면 500 으로 알린다(빈 배열로 뭉개지 않는다).
  let query = supabase
    .from('payment_transactions')
    .select(
      'id, user_id, payment_id, transaction_id, plan_key, amount, status, pay_method, charge_type, created_at',
      { count: 'exact' },
    );

  if (search) {
    query = query.or(`payment_id.ilike.%${search}%,user_id.ilike.%${search}%`);
  }

  const { data: payments, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[admin/payments] error:', error);
    return NextResponse.json({ error: '결제 내역 조회에 실패했습니다.' }, { status: 500 });
  }

  // 구독 현황 요약. 여기가 실패해도 결제 목록은 보여준다 — 대신 summary 를 null 로 보내
  // 화면이 0원·0명을 지어내지 않게 한다(요약을 못 구한 것과 구독자가 없는 것은 다르다).
  const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const [activeResult, expiringResult, revenueResult] = await Promise.all([
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active')
      .lte('current_period_end', weekLater),
    supabase.from('payment_transactions').select('amount').eq('status', 'PAID'),
  ]);

  const summaryFailed = !!(activeResult.error || expiringResult.error || revenueResult.error);
  if (summaryFailed) {
    console.error('[admin/payments] summary error:', {
      active: activeResult.error,
      expiring: expiringResult.error,
      revenue: revenueResult.error,
    });
  }

  // 닉네임/이메일 매핑 (user_id → users)
  const userIds = [...new Set((payments || []).map(p => p.user_id).filter(Boolean))];
  const userMap = new Map<string, { nickname: string | null; email: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, nickname, email').in('id', userIds);
    for (const u of users || []) {
      userMap.set(u.id, { nickname: u.nickname, email: u.email });
    }
  }

  const result = (payments || []).map(p => {
    const plan = getPlan(p.plan_key);
    return {
      id: String(p.id),
      user_id: p.user_id,
      payment_id: p.payment_id,
      plan_key: p.plan_key,
      // 플랜 정의가 사라진 옛 키도 있을 수 있다. 그때는 지어내지 말고 원본 키를 그대로 둔다.
      plan_name: plan?.name || p.plan_key,
      months: plan?.months ?? null,
      amount: p.amount,
      status: p.status,
      pay_method: p.pay_method,
      charge_type: p.charge_type,
      created_at: p.created_at,
      user_nickname: userMap.get(p.user_id)?.nickname || null,
      user_email: userMap.get(p.user_id)?.email || null,
    };
  });

  return NextResponse.json({
    payments: result,
    total: count || 0,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit)),
    summary: summaryFailed
      ? null
      : {
          subscribers: activeResult.count || 0,
          expiringSoon: expiringResult.count || 0,
          totalRevenue: (revenueResult.data || []).reduce((sum, t) => sum + (t.amount || 0), 0),
        },
  });
}
