import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 최근 등록된 인플루언서 조회
 * GET /api/influencers/recent
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    // 최근 7일 이내 등록된 인플루언서만
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const sinceDate = weekAgo.toISOString();

    const { data, error } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, first_seen_at')
      .gte('first_seen_at', sinceDate)
      .order('first_seen_at', { ascending: false })
      .limit(8);

    if (error) throw error;

    const influencers = (data || []).map(inf => ({
      id: inf.id,
      naver_id: inf.naver_id,
      display_name: inf.display_name,
      image_url: inf.image_url,
      category: inf.my_keyword_category || inf.category || '기타',
      subscriber_count: inf.subscriber_count || 0,
      first_seen_at: inf.first_seen_at,
    }));

    return NextResponse.json({ influencers });
  } catch {
    return NextResponse.json({ influencers: [] });
  }
}
