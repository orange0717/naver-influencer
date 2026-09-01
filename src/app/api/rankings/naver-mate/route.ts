import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sortByMateOrder, MATE_CATEGORIES } from '@/lib/naver-mate-categories';

export const dynamic = 'force-dynamic';

// 네이버 메이트 랭킹 — 무료 기능이라 회원에게 횟수 제한이 없다(미들웨어가 로그인만 확인).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category')?.trim() || null;
  const platformParam = url.searchParams.get('platform')?.trim() || '';
  const platform = (['blog', 'cafe', 'kin', 'premium'] as const).find((p) => p === platformParam) || null;
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

  // 네이버 메이트 공식 분야 25개를 항상 전부, 공식 순서로 노출(임의의 가나다순 아님)
  const categories = MATE_CATEGORIES;

  let query = supabase
    .from('naver_mate_monthly')
    .select(
      'mate_id, ai_briefing_count, is_new, latest_post_title, latest_post_url, latest_post_date, naver_mates!inner(id, platform, category, display_name, profile_image_url, home_url)',
    )
    .eq('year', year)
    .eq('month', month)
    .order('ai_briefing_count', { ascending: false })
    .limit(limit);

  // 인용수 스케일이 서비스마다 크게 달라(카페 중앙값 154만 vs 블로그 43만) 4개 서비스를 합산
  // 정렬하면 카페가 상위를 독식한다. 네이버도 서비스끼리는 줄 세우지 않는다.
  if (platform) {
    query = query.eq('naver_mates.platform', platform);
  }

  // 분야 소속은 다대다(naver_mate_topics) — 한 메이트가 여러 분야에 선정될 수 있어
  // naver_mates.category(대표 분야) 로 거르면 겸업 메이트가 통째로 빠진다.
  let mateIds: string[] | null = null;
  if (category) {
    const { data: memberRows, error: memberErr } = await supabase
      .from('naver_mate_topics')
      .select('mate_id')
      .eq('year', year)
      .eq('month', month)
      .eq('category', category);
    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }
    mateIds = (memberRows || []).map((r) => r.mate_id);
    if (mateIds.length === 0) {
      return NextResponse.json({ year, month, categories, platformCounts: {}, items: [] });
    }
    query = query.in('mate_id', mateIds);
  }

  // 서비스 칩 인원수 — 선택된 서비스와 무관하게 항상 분야 전체 기준으로 센다
  const platformCountEntries = await Promise.all(
    (['blog', 'cafe', 'kin', 'premium'] as const).map(async (p) => {
      let q = supabase
        .from('naver_mate_monthly')
        .select('mate_id, naver_mates!inner(platform)', { count: 'exact', head: true })
        .eq('year', year)
        .eq('month', month)
        .eq('naver_mates.platform', p);
      if (mateIds) q = q.in('mate_id', mateIds);
      const { count } = await q;
      return [p, count || 0] as const;
    }),
  );
  const platformCounts = Object.fromEntries(platformCountEntries);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 노출된 메이트들이 실제로 선정된 분야 전체를 공식 순서로 붙여준다
  const shownIds = (rows || []).map((r) => r.mate_id);
  const categoriesByMate = new Map<string, string[]>();
  if (shownIds.length > 0) {
    const { data: topicRows } = await supabase
      .from('naver_mate_topics')
      .select('mate_id, category')
      .eq('year', year)
      .eq('month', month)
      .in('mate_id', shownIds);
    (topicRows || []).forEach((r) => {
      const list = categoriesByMate.get(r.mate_id);
      if (list) list.push(r.category);
      else categoriesByMate.set(r.mate_id, [r.category]);
    });
  }

  const items = (rows || []).map((r) => {
    const mate = Array.isArray(r.naver_mates) ? r.naver_mates[0] : r.naver_mates;
    const mateCategories = sortByMateOrder(categoriesByMate.get(r.mate_id) || []);
    return {
      id: mate?.id,
      platform: mate?.platform,
      category: mateCategories[0] || mate?.category,
      categories: mateCategories.length > 0 ? mateCategories : [mate?.category].filter(Boolean),
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

  return NextResponse.json({ year, month, categories, platformCounts, items });
}
