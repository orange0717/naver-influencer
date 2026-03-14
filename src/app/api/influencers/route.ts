import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchInfluencersForCategory, fetchAllInfluencersSummary, fetchCategories } from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') || undefined;
  const search = searchParams.get('search') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const newOnly = searchParams.get('new') === 'true';

  // service client 사용 (RLS 우회 — 인플루언서 테이블은 공개 데이터)
  const supabase = createServiceClient();

  try {
    // DB에 인플루언서가 있는지 확인
    const { count: dbCount } = await supabase
      .from('influencers')
      .select('*', { count: 'exact', head: true });

    const hasDbData = (dbCount || 0) > 100;

    if (hasDbData) {
      // DB 기반 조회
      return await getInfluencersFromDB(supabase, { category, search, page, limit, newOnly });
    }

    // DB에 데이터 없으면 실시간 API 폴백
    return await getInfluencersFromAPI({ category, search, page, limit });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch influencers' },
      { status: 500 },
    );
  }
}

/** DB 기반 인플루언서 조회 */
async function getInfluencersFromDB(
  supabase: ReturnType<typeof createServiceClient>,
  opts: { category?: string; search?: string; page: number; limit: number; newOnly: boolean },
) {
  const { category, search, page, limit, newOnly } = opts;
  const offset = (page - 1) * limit;

  // 카테고리 목록: 키워드 페이지와 동일한 소스 사용 (네이버 API)
  const apiCategories = await fetchCategories();
  const categories = ['전체', ...apiCategories.map(c => c.name)];

  // 메인 쿼리 구성
  let query = supabase
    .from('influencers')
    .select('*', { count: 'exact' });

  // 카테고리 필터
  if (category && category !== '전체') {
    query = query.or(`my_keyword_category.eq.${category},category.eq.${category}`);
  }

  // 검색 필터
  if (search?.trim()) {
    const q = search.trim();
    query = query.or(
      `display_name.ilike.%${q}%,naver_id.ilike.%${q}%,my_keyword_category.ilike.%${q}%,my_keyword.ilike.%${q}%,category_my_type.ilike.%${q}%`,
    );
  }

  // 신규 인플루언서만
  if (newOnly) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    query = query.gte('first_seen_at', sevenDaysAgo.toISOString());
  }

  // 정렬 + 페이지네이션
  query = query
    .order('subscriber_count', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: influencers, count, error } = await query;

  if (error) throw new Error(error.message);

  const total = count || 0;
  const totalPages = Math.ceil(total / limit);

  // foundInKeywords 조인 (인플루언서 ID 리스트로)
  const influencerIds = (influencers || []).map(inf => inf.id);
  let keywordMap = new Map<string, string[]>();

  if (influencerIds.length > 0) {
    const { data: ikData } = await supabase
      .from('influencer_keywords')
      .select('influencer_id, keyword_id')
      .in('influencer_id', influencerIds);

    if (ikData && ikData.length > 0) {
      const keywordIds = [...new Set(ikData.map(ik => ik.keyword_id))];

      const { data: kwData } = await supabase
        .from('keyword_challenges')
        .select('id, keyword')
        .in('id', keywordIds);

      const kwMap = new Map<string, string>();
      kwData?.forEach(kw => kwMap.set(kw.id, kw.keyword));

      for (const ik of ikData) {
        const kwName = kwMap.get(ik.keyword_id);
        if (!kwName) continue;
        const existing = keywordMap.get(ik.influencer_id) || [];
        existing.push(kwName);
        keywordMap.set(ik.influencer_id, existing);
      }
    }
  }

  // 응답 형식 맞추기
  const items = (influencers || []).map(inf => ({
    name: inf.display_name,
    naverId: inf.naver_id,
    profileUrl: inf.profile_url || `https://in.naver.com/${inf.naver_id}`,
    imageUrl: inf.image_url || '',
    introduction: inf.introduction || '',
    subscriberCount: inf.subscriber_count || 0,
    totalFollowerCount: inf.total_follower_count || 0,
    myKeywordCategory: inf.my_keyword_category || inf.category || '',
    myKeyword: inf.my_keyword || '',
    categoryMyType: inf.category_my_type || '',
    foundInKeywords: keywordMap.get(inf.id) || [],
    firstSeenAt: inf.naver_created_at || inf.first_seen_at || inf.created_at,
  }));

  return NextResponse.json({
    influencers: items,
    categories,
    total,
    page,
    total_pages: totalPages,
    source: 'db',
  });
}

/** 실시간 API 폴백 (DB에 데이터가 없을 때) */
async function getInfluencersFromAPI(
  opts: { category?: string; search?: string; page: number; limit: number },
) {
  const { category, search, page, limit } = opts;

  if (category) {
    const result = await fetchInfluencersForCategory(category, page, limit);

    let filtered = result.influencers;
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(inf =>
        inf.name.toLowerCase().includes(q) ||
        inf.naverId.toLowerCase().includes(q) ||
        inf.myKeywordCategory.toLowerCase().includes(q) ||
        inf.myKeyword.toLowerCase().includes(q) ||
        inf.categoryMyType.toLowerCase().includes(q),
      );
    }

    const categories = await fetchCategories();
    const categoryNames = ['전체', ...categories.map(c => c.name)];

    return NextResponse.json({
      influencers: filtered,
      categories: categoryNames,
      total: search ? filtered.length : result.total,
      page,
      total_pages: search ? Math.ceil(filtered.length / limit) : result.totalPages,
      source: 'api',
    });
  }

  const result = await fetchAllInfluencersSummary();

  let filtered = result.influencers;
  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(inf =>
      inf.name.toLowerCase().includes(q) ||
      inf.naverId.toLowerCase().includes(q) ||
      inf.myKeywordCategory.toLowerCase().includes(q) ||
      inf.myKeyword.toLowerCase().includes(q) ||
      inf.categoryMyType.toLowerCase().includes(q),
    );
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit;
  const influencers = filtered.slice(start, start + limit);
  const categoryNames = ['전체', ...result.categories.map(c => c.name)];

  return NextResponse.json({
    influencers,
    categories: categoryNames,
    total,
    page,
    total_pages: totalPages,
    source: 'api',
  });
}
