import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { searchLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { KEYWORD_CHALLENGE_CATEGORIES } from '@/lib/keyword-challenge-categories';
import { runAliveParticipationQuery } from '@/lib/keyword/participation';
import { effectiveTop3, type Top3Source } from '@/lib/influencer-list';

export const dynamic = 'force-dynamic';

/** 리스트/정렬이 CDN·브라우저에 캐시되면 배포 직후에도 옛 데이터가 보일 수 있음 */
const LIST_JSON_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
} as const;

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await searchLimiter.check(ip)) return rateLimitResponse();

  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') || undefined;
  const search = searchParams.get('search') || undefined;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
  const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));
  const newOnly = searchParams.get('new') === 'true';
  const showInactive = searchParams.get('inactive') === 'true';
  const sortBy = searchParams.get('sort') || 'first_seen_at';
  const order = searchParams.get('order') || 'desc';
  const ninflRanking = searchParams.get('ninfl') === 'true';

  // service client 사용 (RLS 우회 — 인플루언서 테이블은 공개 데이터)
  const supabase = createServiceClient();

  try {
    // DB 기반 조회
    return await getInfluencersFromDB(supabase, { category, search, page, limit, newOnly, showInactive, sortBy, order, ninflRanking });
  } catch (err) {
    logger.error('influencers', 'data fetch error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: '인플루언서 데이터를 불러오는 중 오류가 발생했습니다.' },
      { status: 500, headers: LIST_JSON_HEADERS },
    );
  }
}

/** DB 기반 인플루언서 조회 */
async function getInfluencersFromDB(
  supabase: ReturnType<typeof createServiceClient>,
  opts: { category?: string; search?: string; page: number; limit: number; newOnly: boolean; showInactive: boolean; sortBy: string; order: string; ninflRanking?: boolean },
) {
  const { category, search, page, limit, newOnly, sortBy, order, ninflRanking } = opts;
  const offset = (page - 1) * limit;

  // 카테고리 목록: 키워드 페이지와 동일 순서 (상위 주제별 그룹핑)
  const INFLUENCER_CATEGORIES = [...KEYWORD_CHALLENGE_CATEGORIES];
  const categories = ['전체', ...INFLUENCER_CATEGORIES];

  // stopped_manual 은 migration-062 적용 전에는 존재하지 않으므로 별도 쿼리로 조회 (fallback 지원)
  const SELECT_COLS = 'id, naver_id, display_name, profile_url, image_url, introduction, category, my_keyword_category, my_keyword, category_my_type, subscriber_count, total_follower_count, total_keywords, top1_count, top2_count, top3_count, integrated_top3_count, naver_created_at, first_seen_at, created_at, last_crawled_at, last_challenged_at, keyword_score, best_rank, avg_rank, ninfl_rank';

  // 공통 필터 적용 헬퍼 (배치 페치 때 재사용)
  const applyFilters = <T extends { or: (f: string) => T; not: (c: string, op: string, v: unknown) => T; gt: (c: string, v: unknown) => T; gte: (c: string, v: unknown) => T }>(q: T): T => {
    if (category && category !== '전체') {
      const safeCategory = category.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s·/&.]/g, '');
      if (safeCategory) {
        q = q.or(`my_keyword_category.eq.${safeCategory},category.eq.${safeCategory}`);
      }
    }
    if (search?.trim()) {
      const qq = search.trim().replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s._-]/g, '');
      if (qq) {
        q = q.or(
          `display_name.ilike.%${qq}%,naver_id.ilike.%${qq}%,my_keyword_category.ilike.%${qq}%,my_keyword.ilike.%${qq}%,category_my_type.ilike.%${qq}%`,
        );
      }
    }
    // ninflRanking: 전체 포함, 비활성(1년 이상 미활동)은 UI에서 배지로 표시하고 뒤로 정렬
    if (newOnly) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      q = q.gte('first_seen_at', sevenDaysAgo.toISOString());
    }
    return q;
  };

  // 메인 쿼리 구성 (필요한 컬럼만 조회)
  let query = applyFilters(
    supabase.from('influencers').select(SELECT_COLS, { count: 'exact' })
  );

  // 정렬 + 페이지네이션
  const allowedSorts: Record<string, string> = {
    subscriber_count: 'subscriber_count',
    first_seen_at: 'naver_created_at',
    last_crawled_at: 'last_crawled_at',
    last_challenged_at: 'last_challenged_at',
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
  const isDateSort = sortColumn === 'naver_created_at' || sortColumn === 'last_challenged_at' || sortColumn === 'last_crawled_at';

  /** ninfl 그룹 정렬: 날짜 컬럼에 Number() 를 쓰면 NaN → 순서 깨짐 → ms 로 비교 */
  const sortKeyForGroup = (row: Record<string, unknown>): number => {
    const raw = row[sortColumn];
    if (raw == null || raw === '') {
      return ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    if (isDateSort) {
      const t = new Date(String(raw)).getTime();
      return Number.isFinite(t) ? t : (ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  // N인플 순위: 활성 → 활동중단(관리자 수동 지정)
  // stopped_manual = true 인 인플루언서만 활동중단 그룹으로 이동.
  // Supabase max-rows(1000) 캡 때문에 배치로 전부 가져와서 서버에서 분류·정렬·페이지네이션
  const isGroupSort = ninflRanking && !isRatioSort;

  let influencers: Record<string, unknown>[] | null = null;
  let count: number | null = null;
  let error: { message: string } | null = null;

  if (isGroupSort) {
    // 배치 페치 (Supabase max-rows 1000 우회)
    const BATCH = 1000;
    const MAX_FETCH = 30000;
    const allRows: Record<string, unknown>[] = [];
    let exactCount = 0;
    for (let start = 0; start < MAX_FETCH; start += BATCH) {
      let q = applyFilters(
        supabase.from('influencers').select(SELECT_COLS, { count: start === 0 ? 'exact' : undefined })
      );
      q = q.order(sortColumn, { ascending, nullsFirst: false }).range(start, start + BATCH - 1);
      const { data, count: cnt, error: batchErr } = await q;
      if (batchErr) { error = batchErr; break; }
      if (start === 0 && cnt != null) exactCount = cnt;
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < BATCH) break;
    }
    influencers = allRows;
    count = exactCount;
  } else if (!isRatioSort) {
    query = query.order(sortColumn, { ascending, nullsFirst: false });
    if (isDateSort) {
      query = query.order('first_seen_at', { ascending });
    }
    query = query.range(offset, offset + limit - 1);
    const res = await query;
    influencers = res.data; count = res.count; error = res.error;
  } else {
    // 비율 정렬: 키워드 참여 인플루언서만 가져와서 서버에서 정렬 (최대 5000건)
    query = query.not('total_keywords', 'is', null).gt('total_keywords', 0).limit(5000);
    const res = await query;
    influencers = res.data; count = res.count; error = res.error;
  }

  if (error) throw new Error(error.message);

  // stopped_manual 플래그 별도 조회 (migration-062 미적용 환경에서도 동작하도록 fallback)
  // 컬럼이 없으면 stoppedSet 은 비어 있어 "모두 활성"으로 처리됨 — 기존 자동 분류 제거 효과와 동일.
  const stoppedSet = new Set<string>();
  if (influencers && influencers.length > 0) {
    try {
      const { data: stoppedRows, error: stoppedErr } = await supabase
        .from('influencers')
        .select('id')
        .in('id', influencers.map(i => i.id as string))
        .eq('stopped_manual', true);
      if (!stoppedErr && stoppedRows) {
        for (const r of stoppedRows) stoppedSet.add(r.id as string);
      }
      // 컬럼이 없으면 stoppedErr 가 발생하지만 무시하고 빈 Set 유지
    } catch {
      // swallow — migration 미적용 상태
    }
  }

  // 활동 그룹 판정: 3단계
  // 0 = 활성 (keyword_score > 0 이거나 최근 1년 내 챌린지 참여)
  // 1 = 비활성 (1년 이상 챌린지 이력 없음)
  // 2 = 활동중단 (관리자 수동 지정)
  const activityGroup = (inf: Record<string, unknown>): number => {
    if (stoppedSet.has(inf.id as string)) return 2;
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const lastMs = inf.last_challenged_at ? new Date(inf.last_challenged_at as string).getTime() : 0;
    const hasRecentChallenge = lastMs > 0 && lastMs >= oneYearAgo;
    const hasTop3 = ((Number(inf.top1_count) || 0) + (Number(inf.top2_count) || 0) + (Number(inf.top3_count) || 0)) > 0;
    const isActive = hasRecentChallenge || hasTop3;
    const isEmpty = !inf.image_url
      && (inf.subscriber_count || 0) === 0
      && (inf.total_follower_count || 0) === 0;
    if (!isActive || isEmpty) return 1;
    return 0;
  };

  // N인플 그룹 정렬 + 활성 그룹만 ninflRank 부여 (slice 전 전체 기준)
  const groupRankMap = new Map<string, number>();
  if (isGroupSort && influencers) {
    influencers.sort((a, b) => {
      const ga = activityGroup(a);
      const gb = activityGroup(b);
      if (ga !== gb) return ga - gb;
      const sa = sortKeyForGroup(a);
      const sb = sortKeyForGroup(b);
      if (sa !== sb) return ascending ? sa - sb : sb - sa;
      return String(a.naver_id).localeCompare(String(b.naver_id));
    });
    let activeRank = 0;
    for (const inf of influencers) {
      if (activityGroup(inf) === 0 && (Number(inf.keyword_score) || 0) > 0) {
        activeRank++;
        groupRankMap.set(inf.id as string, activeRank);
      }
    }
    // count 는 배치 페치 시 이미 exactCount 로 설정되어 있음 — 덮어쓰지 않음
    influencers = influencers.slice(offset, offset + limit);
  }

  // 비율 정렬 시 서버에서 정렬 + 페이지네이션
  if (isRatioSort && influencers) {
    // 화면이 찍는 분자와 반드시 같은 것을 써야 한다. 예전에는 여기만 top1+top2+top3 을 쓰고
    // 화면은 integrated_top3_count 를 써서, 정렬을 눌러도 % 가 순서대로 보이지 않았다.
    const getTop3 = (inf: Record<string, unknown>) => effectiveTop3(inf as Top3Source);
    influencers.sort((a, b) => {
      const top3A = getTop3(a);
      const top3B = getTop3(b);
      const totalA = Number(a.total_keywords) || 0;
      const totalB = Number(b.total_keywords) || 0;
      const ratioA = totalA > 0 ? top3A / totalA : 0;
      const ratioB = totalB > 0 ? top3B / totalB : 0;
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
  const keywordMap = new Map<string, string[]>();

  if (influencerIds.length > 0) {
    // tombstone 된 참여는 "발견된 키워드"에서 뺀다 (이미 떠난 챌린지를 보여주지 않는다).
    const ikData = await runAliveParticipationQuery<{ influencer_id: string; keyword_id: string }>(
      (useFilter) => {
        const q = supabase
          .from('influencer_keywords')
          .select('influencer_id, keyword_id')
          .in('influencer_id', influencerIds);
        return useFilter ? q.is('deleted_at', null) : q;
      },
      'influencers foundInKeywords',
    );

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

  // N인플 순위: 그룹 정렬 시 groupRankMap 그대로 사용, 그 외 경로(비율 정렬 등)는 offset 기반
  const ninflRankMap = isGroupSort ? groupRankMap : new Map<string, number>();
  if (!isGroupSort && ninflRanking && influencers && influencers.length > 0) {
    for (let i = 0; i < influencers.length; i++) {
      const inf = influencers[i];
      if ((Number(inf.keyword_score) || 0) > 0) {
        ninflRankMap.set(inf.id as string, offset + i + 1);
      }
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
    subscriberCount: inf.subscriber_count || inf.total_follower_count || 0,
    totalFollowerCount: inf.total_follower_count || 0,
    myKeywordCategory: inf.my_keyword_category || inf.category || '',
    myKeyword: inf.my_keyword || '',
    categoryMyType: inf.category_my_type || '',
    foundInKeywords: keywordMap.get(inf.id as string) || [],
    totalKeywords: Number(inf.total_keywords) || 0,
    top1Count: Number(inf.top1_count) || 0,
    top2Count: Number(inf.top2_count) || 0,
    top3Count: Number(inf.top3_count) || 0,
    integratedTop3Count: effectiveTop3(inf as Top3Source),
    naverCreatedAt: inf.naver_created_at || null,
    firstSeenAt: inf.first_seen_at || inf.created_at,
    lastCrawledAt: inf.last_crawled_at || null,
    lastChallengedAt: inf.last_challenged_at || null,
    // 비활성 판정: 마지막 챌린지 기록이 존재하면서 1년 이상 경과했고 TOP3 이력도 없는 경우
    // last_challenged_at 이 NULL 인 경우(데이터 미수집/신규 인플루언서)는 "판단 불가"이므로 비활성으로 분류하지 않음
    // → 모든 인플루언서에 동일 규칙 적용
    isInactive: (() => {
      const lastMs = inf.last_challenged_at ? new Date(inf.last_challenged_at as string).getTime() : 0;
      if (lastMs === 0) return false; // 챌린지 기록이 없으면 판단 보류
      const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const hasRecentChallenge = lastMs >= oneYearAgo;
      const hasTop3 = ((Number(inf.top1_count) || 0) + (Number(inf.top2_count) || 0) + (Number(inf.top3_count) || 0)) > 0;
      return !hasRecentChallenge && !hasTop3;
    })(),
    // 활동중단 판정: 관리자 수동 지정(stopped_manual)만 사용 — 자동 분류 없음
    isStopped: stoppedSet.has(inf.id as string),
    keywordScore: Number(inf.keyword_score) || 0,
    // DB 의 ninfl_rank 컬럼(전체 순위)을 우선 사용, 없으면 subset 기반 fallback
    ninflRank: (inf.ninfl_rank != null ? Number(inf.ninfl_rank) : null) ?? ninflRankMap.get(inf.id as string) ?? null,
    isMember: memberSet.has(inf.id as string),
  }));

  // 활성 인플루언서 수 (검색 없을 때만 조회, 카테고리 필터가 있으면 그 안에서)
  // ⚠️ 검색 중에는 이 값을 구하지 않는다. 그때 0 을 내려보내면 화면이 "활성 0명"으로 단정한다 —
  //    세지 않은 것과 세어봤더니 0인 것은 다르다. 구하지 않았으면 null 을 내려 화면이 감추게 한다.
  let activeTotal: number | null = null;
  if (!search?.trim()) {
    let activeQuery = supabase
      .from('influencers')
      .select('id', { count: 'exact', head: true })
      .gt('subscriber_count', 0);

    if (category && category !== '전체') {
      // my_keyword_category 또는 category 어느 쪽이든 매칭
      activeQuery = activeQuery.or(
        `my_keyword_category.eq.${category},category.eq.${category}`,
      );
    }

    const { count: activeCount } = await activeQuery;
    activeTotal = activeCount || 0;
  }

  return NextResponse.json(
    {
      influencers: items,
      categories,
      total,
      activeTotal,
      page,
      total_pages: totalPages,
      source: 'db',
    },
    { headers: LIST_JSON_HEADERS },
  );
}
