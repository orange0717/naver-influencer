import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchBlogVisitors } from '@/lib/blog-crawler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/blog/visitors?blogId=xxx&days=30 — 블로그 방문자 이력 조회
 * DB에 데이터가 없으면 네이버에서 직접 크롤링하여 저장
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

    let { data: visitors, error } = await supabase
      .from('blog_visitor_history')
      .select('visit_date, visitor_count')
      .eq('blog_id', blogId)
      .gte('visit_date', since.toISOString().slice(0, 10))
      .order('visit_date', { ascending: true });

    if (error) throw error;

    // DB에 데이터가 없으면 네이버에서 직접 크롤링
    if (!visitors || visitors.length === 0) {
      const crawled = await fetchBlogVisitors(blogId);

      if (crawled.length > 0) {
        // DB에 저장
        const rows = crawled.map(v => ({
          blog_id: blogId,
          visit_date: v.date,
          visitor_count: v.visitors,
        }));

        await supabase
          .from('blog_visitor_history')
          .upsert(rows, { onConflict: 'blog_id,visit_date' });

        // blog_scores에도 최신 방문자수 업데이트
        const latest = crawled[crawled.length - 1];
        const avg7d = crawled.slice(-7).reduce((s, v) => s + v.visitors, 0) / Math.min(crawled.length, 7);
        const avg30d = crawled.reduce((s, v) => s + v.visitors, 0) / crawled.length;
        const crawlTrend = avg30d > 0 ? ((avg7d - avg30d) / avg30d) * 100 : 0;

        await supabase
          .from('blog_scores')
          .upsert({
            blog_id: blogId,
            latest_visitors: latest.visitors,
            visitor_trend: Math.round(crawlTrend * 100) / 100,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'blog_id' });

        // 크롤링 결과를 바로 반환
        visitors = crawled.map(v => ({
          visit_date: v.date,
          visitor_count: v.visitors,
        }));
      }
    }

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
