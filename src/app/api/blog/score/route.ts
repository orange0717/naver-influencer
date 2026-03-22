import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/blog/score — 블로거 점수 저장 (위젯용)
 * 클라이언트에서 순위 확인 후 점수를 서버에 저장합니다.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      blog_id,
      blog_name,
      total_score,
      crank_score,
      dia_score,
      diaplus_score,
      grade,
      keyword_count,
      ranked_count,
      avg_rank,
      top5_count,
      top10_count,
      exposure_rate,
      exposure_score,
      exposure_grade,
    } = body;

    if (!blog_id) {
      return NextResponse.json({ error: 'blog_id가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from('blog_scores')
      .upsert(
        {
          blog_id,
          blog_name: blog_name || blog_id,
          total_score: total_score || 0,
          crank_score: crank_score || 0,
          dia_score: dia_score || 0,
          diaplus_score: diaplus_score || 0,
          grade: grade || 'D',
          keyword_count: keyword_count || 0,
          ranked_count: ranked_count || 0,
          avg_rank: avg_rank || 0,
          top5_count: top5_count || 0,
          top10_count: top10_count || 0,
          exposure_rate: exposure_rate ?? 0,
          exposure_score: exposure_score ?? 0,
          exposure_grade: exposure_grade || 'D',
          scored_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'blog_id' },
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[blog/score] POST error:', err);
    return NextResponse.json({ error: '점수 저장에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * GET /api/blog/score?blogId=xxx — 블로거 점수 조회
 */
export async function GET(req: NextRequest) {
  const blogId = new URL(req.url).searchParams.get('blogId');
  if (!blogId) {
    return NextResponse.json({ error: 'blogId가 필요합니다.' }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('blog_scores')
      .select('*')
      .eq('blog_id', blogId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: '점수 데이터가 없습니다.' }, { status: 404 });
    }

    // 전체 블로거 중 랭킹(등수) 계산 (노출 점수 기반)
    const { count: totalBloggers } = await supabase
      .from('blog_scores')
      .select('*', { count: 'exact', head: true });

    const { count: higherCount } = await supabase
      .from('blog_scores')
      .select('*', { count: 'exact', head: true })
      .gt('exposure_score', data.exposure_score || 0);

    return NextResponse.json({
      ...data,
      rank: (higherCount || 0) + 1,
      totalBloggers: totalBloggers || 1,
    });
  } catch (err) {
    console.error('[blog/score] GET error:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
