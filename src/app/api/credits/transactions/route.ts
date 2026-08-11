import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { CREDIT_FEATURE_LABELS, type CreditFeature } from '@/lib/credit-config';

export const dynamic = 'force-dynamic';

const TYPE_LABELS: Record<string, string> = {
  signup_bonus: '가입 보너스',
  subscription_grant: '구독 크레딧 지급',
  purchase: '크레딧 충전',
  feature_use: '기능 사용',
  admin_adjust: '관리자 조정',
  refund: '환불',
};

/** GET /api/credits/transactions?limit=50 — 로그인 사용자의 크레딧 거래 내역. */
export async function GET(request: Request) {
  const auth = await getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);

  const supa = createServiceClient();
  const { data, error } = await supa
    .from('credit_transactions')
    .select('amount, balance_after, type, feature, created_at')
    .eq('user_id', auth.authId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Credits] transactions query failed:', error);
    return NextResponse.json({ error: '거래 내역을 불러오지 못했습니다.' }, { status: 500 });
  }

  const transactions = (data ?? []).map((tx) => {
    const featureLabel = tx.feature ? CREDIT_FEATURE_LABELS[tx.feature as CreditFeature] : null;
    return {
      amount: tx.amount as number,
      balanceAfter: tx.balance_after as number,
      type: tx.type as string,
      label: featureLabel || TYPE_LABELS[tx.type as string] || tx.type,
      createdAt: tx.created_at as string,
    };
  });

  return NextResponse.json({ transactions });
}
