import { NextRequest, NextResponse } from 'next/server';
import { fetchAllKeywordsSummary, fetchCategories } from '@/lib/naver-api';
import { createServiceClient } from '@/lib/supabase-server';
import { getCompetitionLevel, getCompetitionLevelAdvanced } from '@/lib/constants';
import { requireFeature } from '@/lib/guards/requireFeature';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
/** DB 가 정렬하는 키. 경쟁도는 계산식이 constants.ts 에만 있어 따로 처리한다. */
const DB_SORT_KEYS = new Set(['participant_count', 'search_volume_monthly', 'search_volume_pc', 'search_volume_mobile']);
const COMPETITION_ORDER = { low: 1, medium: 2, high: 3 } as const;

// 이전에는 무료회원 하루 3회(withAnalysisView)였다. 키워드 챌린지가 인플루언서 전용이 되면서
// 무료·블로거는 아예 도달하지 않고 인플루언서는 원래 무제한이라, 그 래퍼는 동작하지 않는 코드가 된다.
export async function GET(request: NextRequest) {
  const gate = await requireFeature(request, 'keywords.challenge');
  if (gate.error) return gate.error;

  const { searchParams } = request.nextUrl;
  const categoryParam = searchParams.get('category')?.slice(0, 50) || undefined;
  const category = categoryParam && categoryParam !== '전체' ? categoryParam : null;
  const search = searchParams.get('search')?.trim().slice(0, 100) || null;
  // 세부분류는 카테고리 안에서만 뜻이 있다(같은 이름이 카테고리마다 다른 규칙을 가진다).
  const subParam = searchParams.get('sub')?.slice(0, 50) || undefined;
  const sub = category && subParam && subParam !== '전체' ? subParam : null;
  const sort = searchParams.get('sort') || 'participant_count';
  const ascending = searchParams.get('order') === 'asc';
  const page = Math.min(Math.max(1, parseInt(searchParams.get('page') || '1') || 1), 10000);

  try {
    const categories = await fetchCategories();
    const categoryNames = ['전체', ...categories.map(c => c.name)];

    // 카테고리를 골랐거나 검색어가 있으면 DB 에서 필터 → 정렬 → 페이지 순으로 조회한다.
    // 받아온 한 페이지를 화면에서 다시 거르면 "부산"을 골라도 50개 중 5개만 남는다.
    if (category || search) {
      const result = sort === 'competition_level'
        ? await listByCompetition({ category, sub, search, ascending, page })
        : await listFromDB({ category, sub, search, sort, ascending, page });
      return NextResponse.json({
        keywords: result.keywords,
        categories: categoryNames,
        total: result.total,
        page,
        pageSize: PAGE_SIZE,
        nextCursor: null,
      });
    }

    // 전체 → 카테고리별 그룹핑
    const result = await fetchAllKeywordsSummary(200);
    const totalAll = result.totalAll;

    // 카테고리별로 그룹핑
    const grouped: Record<string, { keywords: ReturnType<typeof toUIKeyword>[]; total: number }> = {};
    for (const cat of categories) {
      grouped[cat.name] = { keywords: [], total: cat.keywordCount };
    }
    for (const kw of result.keywords) {
      const catName = kw.categoryName || '기타';
      if (!grouped[catName]) grouped[catName] = { keywords: [], total: 0 };
      grouped[catName].keywords.push(toUIKeyword(kw));
    }

    // DB 보강 (전체 뷰의 키워드들)
    const allKws = Object.values(grouped).flatMap(g => g.keywords);
    const enrichedAll = await enrichWithDB(allKws);
    const enrichedMap = new Map(enrichedAll.map(kw => [kw.id, kw]));

    // 키워드 수 기준 정렬
    const groupedList = Object.entries(grouped)
      .filter(([, v]) => v.keywords.length > 0)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, data]) => ({
        category: name,
        total: data.total,
        keywords: data.keywords.slice(0, 10).map(kw => enrichedMap.get(kw.id) || kw),
      }));

    return NextResponse.json({
      grouped: groupedList,
      keywords: [],
      categories: categoryNames,
      total: totalAll,
      nextCursor: null,
    });
  } catch (err) {
    console.error('[keywords] error:', err);
    return NextResponse.json(
      { error: '키워드를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

function toUIKeyword(kw: { id: number; name: string; categoryName: string; participantCount: number }) {
  return {
    id: String(kw.id),
    keyword: kw.name,
    category: kw.categoryName || '기타',
    participant_count: kw.participantCount,
    content_count: 0,
    search_volume_monthly: 0,
    search_volume_pc: 0,
    search_volume_mobile: 0,
    competition_level: getCompetitionLevel(kw.participantCount),
    recommendation_score: 0,
    trend_direction: 'stable' as const,
    trend_percentage: 0,
    is_new: false,
    first_seen_at: '',
  };
}

interface ListParams {
  category: string | null;
  sub: string | null;
  search: string | null;
  ascending: boolean;
  page: number;
}

interface ListRow {
  id: string;
  keyword: string;
  category: string;
  sub_category: string | null;
  participant_count: number | null;
  search_volume_monthly: number | null;
  search_volume_pc: number | null;
  search_volume_mobile: number | null;
  first_seen_at: string | null;
}

function toListKeyword(kw: ListRow, rank: number, overallRank: number | null) {
  return {
    id: kw.id,
    keyword: kw.keyword,
    category: kw.category,
    sub_category: kw.sub_category,
    participant_count: kw.participant_count || 0,
    content_count: 0,
    search_volume_monthly: kw.search_volume_monthly || 0,
    search_volume_pc: kw.search_volume_pc || 0,
    search_volume_mobile: kw.search_volume_mobile || 0,
    competition_level: getCompetitionLevelAdvanced(
      kw.participant_count || 0,
      kw.search_volume_monthly || 0,
      kw.first_seen_at || undefined,
    ),
    recommendation_score: 0,
    trend_direction: 'stable' as const,
    trend_percentage: 0,
    is_new: false,
    first_seen_at: kw.first_seen_at || '',
    rank,
    overall_rank: overallRank,
  };
}

/** 필터 → 정렬 → 페이지를 DB(migration-206 keyword_challenge_list)에서 한 번에 처리한다. */
async function listFromDB({ category, sub, search, sort, ascending, page }: ListParams & { sort: string }) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('keyword_challenge_list', {
    p_category: category,
    p_sub: sub,
    p_search: search,
    p_sort: DB_SORT_KEYS.has(sort) ? sort : 'participant_count',
    p_asc: ascending,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(`keyword_challenge_list: ${error.message}`);

  const rows = (data || []) as (ListRow & { overall_rank: number; filter_rank: number; total_count: number })[];
  return {
    keywords: rows.map(r => toListKeyword(r, Number(r.filter_rank), Number(r.overall_rank))),
    total: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

/**
 * 경쟁도 정렬. 경쟁도는 DB 컬럼이 아니라 getCompetitionLevelAdvanced 가 계산하므로,
 * 필터는 DB 에서 걸고 정렬·페이지만 서버에서 한다. 필터 전 순위는 계산하지 않는다(overall_rank: null).
 */
async function listByCompetition({ category, sub, search, ascending, page }: ListParams) {
  const supabase = createServiceClient();
  const all: ListRow[] = [];
  const BATCH = 1000;

  for (let from = 0; ; from += BATCH) {
    let query = supabase
      .from('keyword_challenges')
      .select('id, keyword, category, sub_category, participant_count, search_volume_monthly, search_volume_pc, search_volume_mobile, first_seen_at')
      .eq('is_active', true)
      .order('participant_count', { ascending: false })
      .order('keyword_clean', { ascending: true })
      .range(from, from + BATCH - 1);
    if (category) query = query.eq('category', category);
    if (sub) query = query.eq('sub_category', sub);
    if (search) query = query.ilike('keyword', `%${search.replace(/[\\%_]/g, m => `\\${m}`)}%`);

    const { data, error } = await query;
    if (error) throw new Error(`keyword_challenges: ${error.message}`);
    if (!data || data.length === 0) break;
    all.push(...(data as ListRow[]));
    if (data.length < BATCH) break;
  }

  // DB 가 참여자순으로 줬고 sort 는 안정 정렬이라, 같은 경쟁도 안에서는 참여자순이 유지된다.
  const leveled = all.map(r => toListKeyword(r, 0, null));
  leveled.sort((a, b) => {
    const diff = COMPETITION_ORDER[a.competition_level] - COMPETITION_ORDER[b.competition_level];
    return ascending ? diff : -diff;
  });

  const start = (page - 1) * PAGE_SIZE;
  return {
    keywords: leveled.slice(start, start + PAGE_SIZE).map((kw, i) => ({ ...kw, rank: start + i + 1 })),
    total: leveled.length,
  };
}

/** DB에서 월검색량, 등록일 등 보강 데이터 가져오기 */
async function enrichWithDB(keywords: ReturnType<typeof toUIKeyword>[]) {
  if (keywords.length === 0) return keywords;

  try {
    const supabase = createServiceClient();
    const keywordNames = keywords.map(kw => kw.keyword);

    const { data: dbKeywords } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, category, search_volume_monthly, first_seen_at, participant_count')
      .in('keyword', keywordNames);

    if (!dbKeywords || dbKeywords.length === 0) return keywords;

    // keyword+category로 매칭
    const dbMap = new Map<string, typeof dbKeywords[0]>();
    for (const dbKw of dbKeywords) {
      dbMap.set(`${dbKw.keyword}::${dbKw.category}`, dbKw);
    }

    return keywords.map(kw => {
      const dbData = dbMap.get(`${kw.keyword}::${kw.category}`);
      if (!dbData) return kw;

      const participantCount = dbData.participant_count || kw.participant_count;
      const searchVolume = dbData.search_volume_monthly || 0;

      return {
        ...kw,
        db_id: dbData.id || null,
        search_volume_monthly: searchVolume,
        first_seen_at: dbData.first_seen_at || '',
        participant_count: participantCount,
        competition_level: getCompetitionLevelAdvanced(participantCount, searchVolume, dbData.first_seen_at || undefined),
      };
    });
  } catch {
    // DB 조회 실패해도 기본 데이터 반환
    return keywords;
  }
}
