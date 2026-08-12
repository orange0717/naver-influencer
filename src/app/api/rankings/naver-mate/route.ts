import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sortByMateOrder } from '@/lib/naver-mate-categories';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category')?.trim() || null;
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '100', 10) || 100));

  const supabase = createServiceClient();

  // 최신 수집 연/월 결정
  const { data: latest } = await supabase
    .from('naver_mate_monthly')
    .select('year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) {
    return NextResponse.json({ year: null, month: null, categories: [], items: [] });
  }

  const { year, month } = latest;

  const { data: catRows } = await supabase
    .from('naver_mate_monthly')
    .select('naver_mates!inner(category)')
    .eq('year', year)
    .eq('month', month);
  const categorySet = new Set<string>();
  (catRows || []).forEach((r) => {
    const mate = Array.isArray(r.naver_mates) ? r.naver_mates[0] : r.naver_mates;
    if (mate?.category) categorySet.add(mate.category);
  });
  // 네이버 메이트 공식 분야 순서로 정렬(임의의 가나다순 아님). 데이터에 존재하는 분야만 노출.
  const categories = sortByMateOrder(Array.from(categorySet));

  let query = supabase
    .from('naver_mate_monthly')
    .select(
      'ai_briefing_count, is_new, latest_post_title, latest_post_url, latest_post_date, naver_mates!inner(id, platform, category, display_name, profile_image_url, home_url)',
    )
    .eq('year', year)
    .eq('month', month)
    .order('ai_briefing_count', { ascending: false })
    .limit(limit);

  if (category) {
    query = query.eq('naver_mates.category', category);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (rows || []).map((r) => {
    const mate = Array.isArray(r.naver_mates) ? r.naver_mates[0] : r.naver_mates;
    return {
      id: mate?.id,
      platform: mate?.platform,
      category: mate?.category,
      displayName: mate?.display_name,
      profileImageUrl: mate?.profile_image_url,
      homeUrl: mate?.home_url,
      aiBriefingCount: r.ai_briefing_count,
      isNew: r.is_new,
      latestPostTitle: r.latest_post_title,
      latestPostUrl: r.latest_post_url,
      latestPostDate: r.latest_post_date,
    };
  });

  return NextResponse.json({ year, month, categories, items });
}
