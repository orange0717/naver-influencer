import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { KEYWORD_CHALLENGE_CATEGORIES } from '@/lib/keyword-challenge-categories';

/** 무료 플랜 명단 전용 — 이름·프로필 링크·선정일자·주제만 조회/응답한다 (팬수·챌린지 데이터는 미포함) */
const LIST_JSON_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
} as const;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await searchLimiter.check(ip)) return rateLimitResponse();

  // 로그인 회원 누구나 무료 열람 가능 — 비로그인만 차단 (/api/influencers/list 와 동일 정책)
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
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const ascending = order === 'asc';
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();

  try {
    const categories = ['전체', ...KEYWORD_CHALLENGE_CATEGORIES];

    // 이름(display_name) + 프로필 링크(profile_url) + 선정일자(naver_created_at) + 주제(my_keyword_category/category)만 셀렉트
    const SELECT_COLS = 'display_name, profile_url, naver_created_at, first_seen_at, my_keyword_category, category';

    let query = supabase.from('influencers').select(SELECT_COLS, { count: 'exact' });

    if (category && category !== '전체') {
      const safeCategory = category.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s·/&.]/g, '');
      if (safeCategory) {
        query = query.or(`my_keyword_category.eq.${safeCategory},category.eq.${safeCategory}`);
      }
    }

    query = query
      .order('naver_created_at', { ascending, nullsFirst: false })
      .order('first_seen_at', { ascending })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    const items = (data || []).map(inf => ({
      name: inf.display_name || '',
      profileUrl: inf.profile_url || '',
      selectionDate: inf.naver_created_at || inf.first_seen_at || null,
      subject: inf.my_keyword_category || inf.category || '',
    }));

    return NextResponse.json(
      {
        items,
        categories,
        total,
        page,
        total_pages: totalPages,
      },
      { headers: LIST_JSON_HEADERS },
    );
  } catch (err) {
    logger.error('influencers-free-plan', 'data fetch error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: '무료 플랜 인플루언서 명단을 불러오는 중 오류가 발생했습니다.' },
      { status: 500, headers: LIST_JSON_HEADERS },
    );
  }
}
