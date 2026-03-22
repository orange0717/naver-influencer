import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/visitors?blogId=xxx&days=30 — 블로그 방문자 이력 조회
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const blogId = searchParams.get('blogId');
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30') || 30));

  if (!blogId) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data: visitors, error } = await supabase
      .from('blog_visitor_history')
      .select('visit_date, visitor_count')
      .eq('blog_id', blogId)
      .gte('visit_date', since.toISOString().slice(0, 10))
      .order('visit_date', { ascending: true });

    if (error) throw error;

    const items = (visitors || []).map(v => ({
      date: v.visit_date,
      count: v.visitor_count,
    }));

    const todayStr = new Date().toISOString().slice(0, 10);
    const todayVisitors = items.find(v => v.date === todayStr)?.count || 0;
    const avgVisitors = items.length > 0
      ? Math.round(items.reduce((s, v) => s + v.count, 0) / items.length)
      : 0;

    // 트렌드: 최근 7일 평균 vs 전체 평균
    const recent7 = items.slice(-7);
    const avg7 = recent7.length > 0 ? recent7.reduce((s, v) => s + v.count, 0) / recent7.length : 0;
    const trend = avgVisitors > 0 ? Math.round(((avg7 - avgVisitors) / avgVisitors) * 100) : 0;

    return NextResponse.json({
      visitors: items,
      todayVisitors,
      avgVisitors,
      trend,
    });
  } catch (err) {
    console.error('[blog/visitors] error:', err);
    return NextResponse.json({ error: '방문자 데이터 조회 실패' }, { status: 500 });
  }
}
