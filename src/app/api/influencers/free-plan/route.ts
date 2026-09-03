import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { KEYWORD_CHALLENGE_CATEGORIES } from '@/lib/keyword-challenge-categories';
import { cacheGet, cacheSet } from '@/lib/kv-cache';

// ⚠️ 2026-07-19: naver_created_at/first_seen_at에 인덱스가 없어 DB 쿼리가 간헐적으로
// "canceling statement due to statement timeout"로 실패한다(마이그레이션 113 적용 전까지
// 임시 완화). 명단은 자주 안 바뀌므로 결과를 짧게 캐싱해 같은 조합(category/page/order)의
// 반복 요청이 매번 무거운 쿼리를 다시 타지 않도록 한다 — 실패율을 줄이는 것이지 근본 해결은
// 아니다(캐시가 비어있는 최초 요청은 여전히 타임아웃 위험 있음).
const CACHE_TTL_SECONDS = 300;

/** Free 플랜 명단 전용 — 이름·프로필 링크·선정일자·주제만 조회/응답한다 (팬수·챌린지 데이터는 미포함) */
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

  // v2: selectionDate 의미가 바뀌었다(아래 items 매핑 주석 참고). 이전 캐시가 남아 있으면
  // 옛 모양(first_seen_at 이 선정일 자리에 채워진)이 그대로 나가므로 키를 갈랐다.
  const cacheKey = `influencers-free-plan:v2:${category || '전체'}:${page}:${limit}:${order}`;
  const cached = await cacheGet<{ items: unknown[]; categories: string[]; total: number; total_pages: number }>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, page }, { headers: LIST_JSON_HEADERS });
  }

  const supabase = createServiceClient();

  try {
    const categories = ['전체', ...KEYWORD_CHALLENGE_CATEGORIES];

    // 이름(display_name) + 프로필 링크(profile_url) + 선정일자(naver_created_at) + 주제(my_keyword_category/category)만 셀렉트
    const SELECT_COLS = 'display_name, profile_url, naver_created_at, first_seen_at, my_keyword_category, category';

    // ⚠️ 2026-07-19 실측 확인: count:'exact'는 naver_created_at/first_seen_at에 인덱스가 없는
    // 상태에서 정렬+정확한 전체 개수 세기를 매번 강제해 대량 테이블에서 통계 timeout
    // ("canceling statement due to statement timeout")을 유발하고 있었다(프로덕션 로그로 확인).
    // 페이지네이션 UI는 정확한 총합이 필요 없으므로 훨씬 가벼운 estimated로 전환.
    let query = supabase.from('influencers').select(SELECT_COLS, { count: 'estimated' });

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

    // 선정일은 naver_created_at 하나뿐이다. 백필이 안 된 사람은 null 로 내보내고,
    // 우리가 그 사람을 처음 발견한 날(first_seen_at)은 별도 필드로 구분해 보낸다.
    //
    // 예전에는 `naver_created_at || first_seen_at` 으로 합쳐 보냈다. 그러면 선정일을 모르는
    // 사람에게도 "선정 일자" 칸에 우리가 크롤링을 시작한 날짜가 박혀서, 2021년 선정자가
    // 2026년 선정자로 보였다. 모르는 값을 아는 값처럼 단언한 셈이고, 같은 데이터를 쓰는
    // /stats 의 '선정일 미확인' 집계와도 서로 어긋났다(거긴 NULL 을 정직하게 뺀다).
    const items = (data || []).map(inf => ({
      name: inf.display_name || '',
      profileUrl: inf.profile_url || '',
      selectionDate: inf.naver_created_at || null,
      firstSeenAt: inf.first_seen_at || null,
      subject: inf.my_keyword_category || inf.category || '',
    }));

    const responseBody = { items, categories, total, total_pages: totalPages };
    await cacheSet(cacheKey, responseBody, CACHE_TTL_SECONDS);

    return NextResponse.json(
      { ...responseBody, page },
      { headers: LIST_JSON_HEADERS },
    );
  } catch (err) {
    logger.error('influencers-free-plan', 'data fetch error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: 'Free 플랜 인플루언서 명단을 불러오는 중 오류가 발생했습니다.' },
      { status: 500, headers: LIST_JSON_HEADERS },
    );
  }
}
