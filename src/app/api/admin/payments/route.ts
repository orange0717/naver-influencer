import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const search = (url.searchParams.get('search') || '').trim();
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  // 구독 현황 요약
  const [subscribersResult, expiringResult, totalRevenueResult] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).not('subscription_plan', 'is', null),
    supabase.from('users').select('*', { count: 'exact', head: true })
      .not('subscription_plan', 'is', null)
      .lte('subscription_expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('payment_transactions').select('amount').eq('status', 'PAID'),
  ]);

  const totalRevenue = (totalRevenueResult.data || []).reduce((sum, t) => sum + (t.amount || 0), 0);

  // 결제 내역 조회
  let query = supabase
    .from('payment_transactions')
    .select('id, user_id, order_id, payment_key, amount, plan_name, duration_days, status, created_at', { count: 'exact' });

  if (search) {
    query = query.or(`order_id.ilike.%${search}%,user_id.ilike.%${search}%`);
  }

  const { data: payments, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[admin/payments] error:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  // user_id로 닉네임/이메일 매핑
  const userIds = [...new Set((payments || []).map(p => p.user_id).filter(Boolean))];
  const userMap = new Map<string, { nickname: string; email: string }>();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, nickname, email')
      .in('id', userIds);
    for (const u of (users || [])) {
      userMap.set(u.id, { nickname: u.nickname, email: u.email });
    }
  }

  const result = (payments || []).map(p => ({
    ...p,
    user_nickname: userMap.get(p.user_id)?.nickname || null,
    user_email: userMap.get(p.user_id)?.email || null,
  }));

  return NextResponse.json({
    payments: result,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
    summary: {
      subscribers: subscribersResult.count || 0,
      expiringSoon: expiringResult.count || 0,
      totalRevenue,
    },
  });
}
