import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 최근 선정된 인플루언서 조회 (메인페이지용)
 * 네이버가 실제로 최근 7일 내 인플루언서로 선정한 사람만 반환 (naver_created_at 기준)
 * GET /api/influencers/recent
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString();

    // naver_created_at(네이버가 인플루언서로 선정한 날짜)이 최근 7일인 사람만
    // first_seen_at(우리 크롤러가 처음 발견한 날짜)은 사용하지 않음
    // → 크롤링 일괄 수집 시 기존 인플루언서가 "신규"로 잘못 노출되는 문제 방지
    const { data } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, total_follower_count, naver_created_at')
      .not('naver_created_at', 'is', null)
      .gte('naver_created_at', sinceStr)
      .order('naver_created_at', { ascending: false })
      .limit(10);

    // Naver API 이중 인코딩 정리 (\u002F → /)
    const fix = (s: string) => s.replace(/\\u002F/g, '/');

    const influencers = (data || []).map(inf => ({
      id: inf.id,
      naver_id: inf.naver_id,
      display_name: inf.display_name,
      image_url: fix(inf.image_url || ''),
      category: fix(inf.my_keyword_category || inf.category || '기타'),
      subscriber_count: inf.total_follower_count || inf.subscriber_count || 0,
      first_seen_at: inf.naver_created_at,
    }));

    return NextResponse.json({ influencers });
  } catch {
    return NextResponse.json({ influencers: [] });
  }
}
