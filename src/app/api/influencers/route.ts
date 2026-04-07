import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { fetchInfluencersForCategory, fetchAllInfluencersSummary, fetchCategories } from '@/lib/naver-api';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await searchLimiter.check(ip)) return rateLimitResponse();

  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') || undefined;
  const search = searchParams.get('search') || undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
  const newOnly = searchParams.get('new') === 'true';
  const showInactive = searchParams.get('inactive') === 'true';
  const sortBy = searchParams.get('sort') || 'first_seen_at';
  const order = searchParams.get('order') || 'desc';
  const officialOnly = searchParams.get('official') === 'true';
  const ninflRanking = searchParams.get('ninfl') === 'true';

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
      return await getInfluencersFromDB(supabase, { category, search, page, limit, newOnly, showInactive, sortBy, order, officialOnly, ninflRanking });
    }

    // DB에 데이터 없으면 실시간 API 폴백
    return await getInfluencersFromAPI({ category, search, page, limit });
  } catch (err) {
    logger.error('influencers', 'data fetch error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: '인플루언서 데이터를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

/** DB 기반 인플루언서 조회 */
async function getInfluencersFromDB(
  supabase: ReturnType<typeof createServiceClient>,
  opts: { category?: string; search?: string; page: number; limit: number; newOnly: boolean; showInactive: boolean; sortBy: string; order: string; officialOnly?: boolean; ninflRanking?: boolean },
) {
  const { category, search, page, limit, newOnly, showInactive, sortBy, order, officialOnly, ninflRanking } = opts;
  const offset = (page - 1) * limit;

  // 카테고리 목록: 키워드 페이지와 동일 순서 (상위 주제별 그룹핑)
  const INFLUENCER_CATEGORIES = [
    '여행',
    '패션', '뷰티',
    '푸드',
    'IT테크', '자동차',
    '리빙', '육아', '생활건강',
    '게임',
    '동물/펫',
    '운동/레저', '프로스포츠',
    '방송/연예', '대중음악', '영화',
    '공연/전시/예술', '도서',
    '경제/비즈니스', '어학/교육',
  ];
  const categories = ['전체', ...INFLUENCER_CATEGORIES];

  // 메인 쿼리 구성
  let query = supabase
    .from('influencers')
    .select('*', { count: 'exact' });

  // 카테고리 필터 (화이트리스트: 한글/영문/숫자/공백/특수구분자만 허용)
  if (category && category !== '전체') {
    const safeCategory = category.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s·/&.]/g, '');
    if (safeCategory) {
      query = query.or(`my_keyword_category.eq.${safeCategory},category.eq.${safeCategory}`);
    }
  }

  // 검색 필터 (화이트리스트: 한글/영문/숫자/공백만 허용)
  if (search?.trim()) {
    const q = search.trim().replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s._-]/g, '');
    if (q) {
      query = query.or(
        `display_name.ilike.%${q}%,naver_id.ilike.%${q}%,my_keyword_category.ilike.%${q}%,my_keyword.ilike.%${q}%,category_my_type.ilike.%${q}%`,
      );
    }
  }

  // 공식 순위 인플루언서만
  if (officialOnly) {
    query = query.not('official_naver_rank', 'is', null);
  }

  // N인플 순위: keyword_score > 0
  if (ninflRanking) {
    query = query.gt('keyword_score', 0);
  }

  // 신규 인플루언서만
  if (newOnly) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    query = query.gte('first_seen_at', sevenDaysAgo.toISOString());
  }

  // 정렬 + 페이지네이션
  const allowedSorts: Record<string, string> = {
    official_naver_rank: 'official_naver_rank',
    subscriber_count: 'subscriber_count',
    first_seen_at: 'naver_created_at',
    last_crawled_at: 'last_crawled_at',
    total_keywords: 'total_keywords',
    integrated_top3_count: 'integrated_top3_count',
    top1_count: 'top1_count',
    top2_count: 'top2_count',
    top3_count: 'top3_count',
    keyword_score: 'keyword_score',
  };
  const isRatioSort = sortBy === 'top3_ratio';
  const sortColumn = isRatioSort ? 'integrated_top3_count' : (allowedSorts[sortBy] || 'naver_created_at');
  const ascending = order === 'asc';
  // NULL은 항상 맨 뒤로
  const isDateSort = sortColumn === 'naver_created_at';

  if (!isRatioSort) {
    query = query.order(sortColumn, { ascending, nullsFirst: false });
    if (isDateSort) {
      query = query.order('first_seen_at', { ascending });
    }
    query = query.range(offset, offset + limit - 1);
  } else {
    // 비율 정렬: 키워드 참여 인플루언서만 가져와서 서버에서 정렬 (최대 5000건)
    query = query.not('total_keywords', 'is', null).gt('total_keywords', 0).limit(5000);
  }

  let { data: influencers, count, error } = await query;

  if (error) throw new Error(error.message);

  // 비율 정렬 시 서버에서 정렬 + 페이지네이션
  if (isRatioSort && influencers) {
    const getTop3 = (inf: Record<string, unknown>) => (Number(inf.top1_count) || 0) + (Number(inf.top2_count) || 0) + (Number(inf.top3_count) || 0);
    influencers.sort((a, b) => {
      const top3A = getTop3(a);
      const top3B = getTop3(b);
      const ratioA = (a.total_keywords || 0) > 0 ? top3A / (a.total_keywords as number) : 0;
      const ratioB = (b.total_keywords || 0) > 0 ? top3B / (b.total_keywords as number) : 0;
      if (ratioA !== ratioB) return ascending ? ratioA - ratioB : ratioB - ratioA;
      // 비율 같으면 TOP3 개수순
      return ascending ? top3A - top3B : top3B - top3A;
    });
    count = influencers.length;
    influencers = influencers.slice(offset, offset + limit);
  }

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

  // N인플 순위 계산: 검색/필터 시 실제 순위 표기를 위해
  // keyword_score가 자신보다 높은 인플루언서 수를 카운트
  const ninflRankMap = new Map<string, number>();
  if (ninflRanking && influencers && influencers.length > 0) {
    for (const inf of influencers) {
      const score = inf.keyword_score || 0;
      if (score <= 0) continue;
      let rankQuery = supabase
        .from('influencers')
        .select('*', { count: 'exact', head: true })
        .gt('keyword_score', score);
      if (category && category !== '전체') {
        const safeCat = category.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s·/&.]/g, '');
        if (safeCat) rankQuery = rankQuery.or(`my_keyword_category.eq.${safeCat},category.eq.${safeCat}`);
      }
      const { count: higherCount } = await rankQuery;
      ninflRankMap.set(inf.id, (higherCount || 0) + 1);
    }
  }

  // 가입 회원 여부 조회
  const infIds = (influencers || []).map(inf => inf.id);
  const memberSet = new Set<string>();
  if (infIds.length > 0) {
    const { data: memberData } = await supabase
      .from('users')
      .select('linked_influencer_id')
      .in('linked_influencer_id', infIds);
    memberData?.forEach(u => { if (u.linked_influencer_id) memberSet.add(u.linked_influencer_id); });
  }

  // 응답 형식 맞추기 (top1/2/3_count는 influencers 테이블에서 직접 읽기)
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
    totalKeywords: inf.total_keywords || 0,
    top1Count: inf.top1_count || 0,
    top2Count: inf.top2_count || 0,
    top3Count: inf.top3_count || 0,
    integratedTop3Count: (inf.top1_count || 0) + (inf.top2_count || 0) + (inf.top3_count || 0),
    naverCreatedAt: inf.naver_created_at || null,
    firstSeenAt: inf.first_seen_at || inf.created_at,
    lastCrawledAt: inf.last_crawled_at || null,
    isInactive: !inf.image_url && (inf.subscriber_count || 0) === 0,
    isStopped: inf.last_crawled_at
      ? (Date.now() - new Date(inf.last_crawled_at).getTime()) > 365 * 24 * 60 * 60 * 1000
      : !!(inf.official_naver_rank && !inf.last_crawled_at),
    officialNaverRank: inf.official_naver_rank || null,
    officialRankCategory: inf.official_rank_category || null,
    keywordScore: inf.keyword_score || 0,
    ninflRank: ninflRankMap.get(inf.id) || null,
    isMember: memberSet.has(inf.id),
  }));

  // 활성 인플루언서 수 (구독자 > 0)
  const { count: activeCount } = await supabase
    .from('influencers')
    .select('*', { count: 'exact', head: true })
    .gt('subscriber_count', 0);

  return NextResponse.json({
    influencers: items,
    categories,
    total,
    activeTotal: activeCount || 0,
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
