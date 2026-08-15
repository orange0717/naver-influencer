import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { sortByMateOrder, MATE_CATEGORIES } from '@/lib/naver-mate-categories';
import { withAnalysisView } from '@/lib/analysis-quota';

export const dynamic = 'force-dynamic';

// 무료회원 하루 3회 조회 제한(메이트 랭킹 분석). PRO·관리자·비회원 통과.
export const GET = withAnalysisView('rank_analysis', async (request: NextRequest) => {
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

  // 분야 소속은 다대다(naver_mate_topics) — 한 메이트가 여러 분야에 선정될 수 있어
  // naver_mates.category(대표 분야) 로 거르면 겸업 메이트가 통째로 빠진다.
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
    const mateIds = (memberRows || []).map((r) => r.mate_id);
    if (mateIds.length === 0) {
      return NextResponse.json({ year, month, categories, items: [] });
    }
    query = query.in('mate_id', mateIds);
  }

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

  return NextResponse.json({ year, month, categories, items });
});
