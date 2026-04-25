import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

// 런타임 실행 + Vercel CDN 5분 캐시 (빌드 시 prerender 방지)
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServiceClient();

  try {
    // 사전 집계된 stats_cache 테이블에서 1행만 SELECT (cron 으로 5분마다 갱신)
    const { data, error } = await supabase
      .from('stats_cache')
      .select('total_count, active_count, inactive_count, new_count, total_users, updated_at')
      .eq('key', 'landing')
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        {
          influencer_count: 0,
          active_count: 0,
          inactive_count: 0,
          new_count: 0,
          category_count: 20,
          keyword_count: 0,
          total_users: 0,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
          },
        },
      );
    }

    return NextResponse.json(
      {
        influencer_count: data.total_count,
        active_count: data.active_count,
        inactive_count: data.inactive_count,
        new_count: data.new_count,
        category_count: 20,
        keyword_count: 0,
        total_users: data.total_users,
        updated_at: data.updated_at,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: '통계 정보를 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
