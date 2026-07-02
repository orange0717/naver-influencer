import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { KEYWORD_CHALLENGE_CATEGORIES } from '@/lib/keyword-challenge-categories';

/** 리스트/정렬이 CDN·브라우저에 캐시되면 배포 직후에도 옛 데이터가 보일 수 있음 */
const LIST_JSON_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
} as const;

/** 순수 명단(무료) 전용 API — 키챌 순위·점수 등은 절대 조회/응답하지 않는다 */
const ALLOWED_SORTS: Record<string, string> = {
  first_seen_at: 'naver_created_at',
  subscriber_count: 'subscriber_count',
};

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await searchLimiter.check(ip)) return rateLimitResponse();

  // 로그인 회원 누구나 무료 열람 가능 — 비로그인만 차단
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);
  if (!authUser) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401, headers: LIST_JSON_HEADERS },
    );
  }

  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') || undefined;
  const search = searchParams.get('search') || undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
  const sortKey = ALLOWED_SORTS[searchParams.get('sort') || ''] ? (searchParams.get('sort') as string) : 'first_seen_at';
  const sortColumn = ALLOWED_SORTS[sortKey];
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const ascending = order === 'asc';
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  try {
    const categories = ['전체', ...KEYWORD_CHALLENGE_CATEGORIES];

    const SELECT_COLS = 'id, naver_id, display_name, profile_url, image_url, introduction, category, my_keyword_category, my_keyword, category_my_type, subscriber_count, total_follower_count, naver_created_at, first_seen_at, created_at';

    let query = supabase.from('influencers').select(SELECT_COLS, { count: 'exact' });

    if (category && category !== '전체') {
      const safeCategory = category.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s·/&.]/g, '');
      if (safeCategory) {
        query = query.or(`my_keyword_category.eq.${safeCategory},category.eq.${safeCategory}`);
      }
    }
    if (search?.trim()) {
      const qq = search.trim().replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s._-]/g, '');
      if (qq) {
        query = query.or(
          `display_name.ilike.%${qq}%,naver_id.ilike.%${qq}%,my_keyword_category.ilike.%${qq}%,my_keyword.ilike.%${qq}%,category_my_type.ilike.%${qq}%`,
        );
      }
    }

    query = query.order(sortColumn, { ascending, nullsFirst: false });
    if (sortColumn === 'naver_created_at') {
      query = query.order('first_seen_at', { ascending });
    }
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    const items = (data || []).map(inf => ({
      name: inf.display_name,
      naverId: inf.naver_id,
      profileUrl: inf.profile_url || `https://in.naver.com/${inf.naver_id}`,
      imageUrl: inf.image_url || '',
      introduction: inf.introduction || '',
      subscriberCount: inf.subscriber_count || inf.total_follower_count || 0,
      totalFollowerCount: inf.total_follower_count || 0,
      myKeywordCategory: inf.my_keyword_category || inf.category || '',
      myKeyword: inf.my_keyword || '',
      categoryMyType: inf.category_my_type || '',
      naverCreatedAt: inf.naver_created_at || null,
      firstSeenAt: inf.first_seen_at || inf.created_at,
    }));

    return NextResponse.json(
      {
        influencers: items,
        categories,
        total,
        page,
        total_pages: totalPages,
      },
      { headers: LIST_JSON_HEADERS },
    );
  } catch (err) {
    logger.error('influencers-list', 'data fetch error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: '인플루언서 명단을 불러오는 중 오류가 발생했습니다.' },
      { status: 500, headers: LIST_JSON_HEADERS },
    );
  }
}
