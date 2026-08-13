import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createRouteHandlerClient, getUserWithTimeout } from '@/lib/supabase-server';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LIST_JSON_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
} as const;

/**
 * 계정 연결(/my/link) 전용 경량 검색.
 * - 유료 리스트(/api/influencers)와 달리 로그인만 있으면 되지만, 챌린지·순위 등 유료 지표는
 *   응답하지 않고 "본인 계정 확인"에 필요한 신원 필드(이름·ID·프로필·이미지·주제·팬수)만 돌려준다.
 * - 유료 데이터 대량 열람을 막으면서도 무료 회원의 계정 연결은 계속 가능하게 하려는 분리.
 * - 검색어가 있어야만 결과를 주고, limit도 소량으로 제한해 전체 명단 열거를 방지한다.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await searchLimiter.check(ip)) return rateLimitResponse();

  // 로그인 회원 누구나 (계정 연결은 결제 여부와 무관하게 열려 있어야 함) — 비로그인만 차단
  const supabaseAuth = await createRouteHandlerClient();
  const authUser = await getUserWithTimeout(supabaseAuth);
  if (!authUser) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401, headers: LIST_JSON_HEADERS },
    );
  }

  const { searchParams } = request.nextUrl;
  const rawSearch = (searchParams.get('search') || '').trim();
  const limit = Math.min(10, Math.max(1, parseInt(searchParams.get('limit') || '5') || 5));

  // 검색어 없으면 전체 명단 열거가 되므로 빈 결과 반환
  const qq = rawSearch.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s._-]/g, '');
  if (!qq) {
    return NextResponse.json({ influencers: [] }, { headers: LIST_JSON_HEADERS });
  }

  const supabase = createServiceClient();

  try {
    // 신원 확인에 필요한 최소 컬럼만 — 유료 지표(챌린지/순위/키워드 스코어 등)는 제외
    const { data, error } = await supabase
      .from('influencers')
      .select('naver_id, display_name, profile_url, image_url, subscriber_count, total_follower_count, my_keyword_category, category')
      .or(`display_name.ilike.%${qq}%,naver_id.ilike.%${qq}%`)
      .limit(limit);

    if (error) throw error;

    const influencers = (data || []).map(inf => ({
      naverId: inf.naver_id,
      name: inf.display_name,
      profileUrl: inf.profile_url || `https://in.naver.com/${inf.naver_id}`,
      imageUrl: inf.image_url || '',
      subscriberCount: inf.subscriber_count || inf.total_follower_count || 0,
      totalFollowerCount: inf.total_follower_count || 0,
      myKeywordCategory: inf.my_keyword_category || inf.category || '',
    }));

    return NextResponse.json({ influencers }, { headers: LIST_JSON_HEADERS });
  } catch (err) {
    logger.error('influencers-search', 'data fetch error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: '인플루언서 검색 중 오류가 발생했습니다.' },
      { status: 500, headers: LIST_JSON_HEADERS },
    );
  }
}
