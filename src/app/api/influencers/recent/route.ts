import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 최근 선정된 인플루언서 조회 (메인페이지용)
 * naver_created_at (네이버 선정일) 기준 최근 90일
 * GET /api/influencers/recent
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    // 최근 90일 이내 선정된 인플루언서
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const { data, error } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, first_seen_at, naver_created_at')
      .not('naver_created_at', 'is', null)
      .gte('naver_created_at', since.toISOString())
      .order('naver_created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    const influencers = (data || []).map(inf => ({
      id: inf.id,
      naver_id: inf.naver_id,
      display_name: inf.display_name,
      image_url: inf.image_url,
      category: inf.my_keyword_category || inf.category || '기타',
      subscriber_count: inf.subscriber_count || 0,
      first_seen_at: inf.naver_created_at || inf.first_seen_at,
    }));

    return NextResponse.json({ influencers });
  } catch {
    return NextResponse.json({ influencers: [] });
  }
}
