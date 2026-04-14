import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const supabase = createServiceClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  // 30일 전
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  const [
    usersResult,
    todayUsersResult,
    subscribersResult,
    paymentsResult,
    demoResult,
    reportsResult,
    dailySignupsResult,
  ] = await Promise.all([
    // 총 회원수
    supabase.from('users').select('*', { count: 'exact', head: true }),
    // 오늘 가입
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
    // 유료 구독자
    supabase.from('users').select('*', { count: 'exact', head: true }).not('subscription_plan', 'is', null),
    // 총 결제금액
    supabase.from('payment_transactions').select('amount').eq('status', 'PAID'),
    // 활성 데모 세션
    supabase.from('demo_sessions').select('*', { count: 'exact', head: true }).gte('expires_at', new Date().toISOString()),
    // 대기 중 신고
    supabase.from('community_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    // 30일 일별 가입
    supabase.from('users').select('created_at').gte('created_at', thirtyDaysAgoISO).order('created_at', { ascending: true }),
  ]);

  // 총 결제금액 계산
  const totalRevenue = (paymentsResult.data || []).reduce((sum, t) => sum + (t.amount || 0), 0);

  // 일별 가입 집계
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const u of (dailySignupsResult.data || [])) {
    const date = new Date(u.created_at).toISOString().slice(0, 10);
    dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
  }
  const dailySignups = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

  return NextResponse.json({
    totalUsers: usersResult.count || 0,
    todaySignups: todayUsersResult.count || 0,
    subscribers: subscribersResult.count || 0,
    totalRevenue,
    activeDemos: demoResult.count || 0,
    pendingReports: reportsResult.count || 0,
    dailySignups,
  });
}
