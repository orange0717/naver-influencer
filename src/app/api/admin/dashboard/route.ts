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

  // 이번 달 1일
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const [
    usersResult,
    todayUsersResult,
    monthUsersResult,
    subscribersResult,
    paymentsResult,
    reportsResult,
    reportsAllResult,
    dailySignupsResult,
    recentUsersResult,
    recentReportsResult,
    recentMatchLogsResult,
    newEnterpriseInquiriesResult,
    enterpriseInquiriesAllResult,
  ] = await Promise.all([
    // 총 회원수
    supabase.from('users').select('*', { count: 'exact', head: true }),
    // 오늘 가입
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', todayISO),
    // 이번 달 가입
    supabase.from('users').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
    // 유료 구독자
    supabase.from('users').select('*', { count: 'exact', head: true }).not('subscription_plan', 'is', null),
    // 총 결제금액
    supabase.from('payment_transactions').select('amount').eq('status', 'PAID'),
    // 대기 중 신고
    supabase.from('community_reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    // 전체 신고
    supabase.from('community_reports').select('*', { count: 'exact', head: true }),
    // 30일 일별 가입
    supabase.from('users').select('created_at').gte('created_at', thirtyDaysAgoISO).order('created_at', { ascending: true }),
    // 최근 가입 회원 5명
    supabase.from('users').select('nickname, email, created_at').order('created_at', { ascending: false }).limit(5),
    // 최근 대기 신고 5건
    supabase.from('community_reports').select('id, reason, status, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    // 최근 Google 자동매칭 로그 20건
    supabase
      .from('account_match_logs')
      .select('id, match_method, created_at, matched_user:matched_user_id(id, nickname)')
      .order('created_at', { ascending: false })
      .limit(20),
    // 미확인 기업용 문의
    supabase.from('enterprise_inquiries').select('*', { count: 'exact', head: true }).eq('status', 'new'),
    // 전체 기업용 문의
    supabase.from('enterprise_inquiries').select('*', { count: 'exact', head: true }),
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
    monthSignups: monthUsersResult.count || 0,
    subscribers: subscribersResult.count || 0,
    totalRevenue,
    pendingReports: reportsResult.count || 0,
    totalReports: reportsAllResult.count || 0,
    dailySignups,
    recentUsers: recentUsersResult.data || [],
    recentReports: recentReportsResult.data || [],
    recentMatchLogs: recentMatchLogsResult.data || [],
    newEnterpriseInquiries: newEnterpriseInquiriesResult.count || 0,
    totalEnterpriseInquiries: enterpriseInquiriesAllResult.count || 0,
  });
}
