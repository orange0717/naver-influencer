import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 최근 선정된 인플루언서 조회 (메인페이지용)
 * naver_created_at 또는 first_seen_at 기준 최근 7일
 * GET /api/influencers/recent
 */
export async function GET() {
  try {
    const supabase = createServiceClient();

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const sinceStr = since.toISOString();

    // 1) naver_created_at이 있는 최근 인플루언서
    const { data: withDate } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, first_seen_at, naver_created_at')
      .not('naver_created_at', 'is', null)
      .gte('naver_created_at', sinceStr)
      .order('naver_created_at', { ascending: false })
      .limit(10);

    // 2) naver_created_at이 없지만 최근 추가된 인플루언서 (first_seen_at 기준)
    //    단, 키챌 참여 이력이 있는 활동 인플루언서만 (비활동 오래된 인플루언서 제외)
    const { data: withoutDate } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, first_seen_at, naver_created_at')
      .is('naver_created_at', null)
      .not('last_challenged_at', 'is', null)
      .gte('first_seen_at', sinceStr)
      .order('first_seen_at', { ascending: false })
      .limit(5);

    // 합치고 날짜순 정렬, 최대 10개
    const seen = new Set<string>();
    const all = [...(withDate || []), ...(withoutDate || [])];
    const unique = all.filter(inf => {
      if (seen.has(inf.id)) return false;
      seen.add(inf.id);
      return true;
    });

    unique.sort((a, b) => {
      const dateA = new Date(a.naver_created_at || a.first_seen_at).getTime();
      const dateB = new Date(b.naver_created_at || b.first_seen_at).getTime();
      return dateB - dateA;
    });

    // Naver API 이중 인코딩 정리 (\u002F → /)
    const fix = (s: string) => s.replace(/\\u002F/g, '/');

    const influencers = unique.slice(0, 10).map(inf => ({
      id: inf.id,
      naver_id: inf.naver_id,
      display_name: inf.display_name,
      image_url: fix(inf.image_url || ''),
      category: fix(inf.my_keyword_category || inf.category || '기타'),
      subscriber_count: inf.subscriber_count || 0,
      first_seen_at: inf.naver_created_at || inf.first_seen_at,
    }));

    return NextResponse.json({ influencers });
  } catch {
    return NextResponse.json({ influencers: [] });
  }
}
