import { NextRequest, NextResponse } from 'next/server';
import {
  fetchCategoryPage,
  fetchAllKeywordsSummary,
  searchKeywordsAcrossCategories,
  fetchCategories,
} from '@/lib/naver-api';
import { createServiceClient } from '@/lib/supabase-server';
import { getCompetitionLevel, getCompetitionLevelAdvanced } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50') || 50), 100);
  const category = searchParams.get('category')?.slice(0, 50) || undefined;
  const search = searchParams.get('search')?.slice(0, 100) || undefined;
  const cursor = searchParams.get('cursor')?.slice(0, 100) || undefined;

  try {
    const categories = await fetchCategories();
    const categoryNames = ['전체', ...categories.map(c => c.name)];

    // 특정 카테고리 선택
    if (category && category !== '전체') {
      const sort = searchParams.get('sort') || undefined;

      // 정렬 모드: DB에서 해당 카테고리 전체 키워드 조회
      if (sort) {
        const sortOrder = searchParams.get('order') === 'asc' ? true : false;
        const dbKeywords = await getAllKeywordsFromDB(category, sort, sortOrder);
        return NextResponse.json({
          keywords: dbKeywords,
          categories: categoryNames,
          total: dbKeywords.length,
          nextCursor: null,
        });
      }

      // 카테고리 + 검색: DB에서 해당 카테고리 내 키워드 검색
      if (search?.trim()) {
        const dbKeywords = await searchKeywordsInCategory(category, search.trim());
        return NextResponse.json({
          keywords: dbKeywords,
          categories: categoryNames,
          total: dbKeywords.length,
          nextCursor: null,
        });
      }

      // 기본: 커서 기반 페이지네이션 (네이버 API)
      const result = await fetchCategoryPage(category, limit, cursor, undefined);
      const keywords = result.keywords.map(kw => toUIKeyword(kw));
      const enriched = await enrichWithDB(keywords);
      return NextResponse.json({
        keywords: enriched,
        categories: categoryNames,
        total: result.total,
        nextCursor: result.nextCursor,
      });
    }

    // 전체 카테고리에서 검색
    if (search?.trim()) {
      const result = await searchKeywordsAcrossCategories(search.trim(), 100);
      const keywords = result.keywords.map(kw => toUIKeyword(kw));
      const enriched = await enrichWithDB(keywords);
      return NextResponse.json({
        keywords: enriched,
        categories: categoryNames,
        total: result.total,
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

/** DB에서 카테고리 내 키워드 검색 */
async function searchKeywordsInCategory(category: string, search: string) {
  const supabase = createServiceClient();

  const allKeywords: {
    id: string; keyword: string; category: string;
    participant_count: number; search_volume_monthly: number;
    first_seen_at: string;
  }[] = [];

  const PAGE = 500;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: batch } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, category, participant_count, search_volume_monthly, first_seen_at')
      .eq('category', category)
      .eq('is_active', true)
      .ilike('keyword', `%${search}%`)
      .order('participant_count', { ascending: false })
      .range(from, from + PAGE - 1);

    if (batch && batch.length > 0) {
      allKeywords.push(...batch);
      from += PAGE;
      hasMore = batch.length === PAGE;
    } else {
      hasMore = false;
    }
  }

  return allKeywords.map(kw => ({
    id: kw.id,
    keyword: kw.keyword,
    category: kw.category,
    participant_count: kw.participant_count || 0,
    content_count: 0,
    search_volume_monthly: kw.search_volume_monthly || 0,
    search_volume_pc: 0,
    search_volume_mobile: 0,
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
  }));
}

/** DB에서 카테고리 전체 키워드 조회 (정렬 모드용) */
async function getAllKeywordsFromDB(category: string, sort: string, ascending: boolean) {
  const supabase = createServiceClient();
  const sortColumn = sort === 'competition_level' ? 'participant_count' : 'participant_count';

  const allKeywords: {
    id: string; keyword: string; category: string;
    participant_count: number; search_volume_monthly: number;
    first_seen_at: string; is_active: boolean;
  }[] = [];

  const PAGE = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: batch } = await supabase
      .from('keyword_challenges')
      .select('id, keyword, category, participant_count, search_volume_monthly, first_seen_at, is_active')
      .eq('category', category)
      .eq('is_active', true)
      .order(sortColumn, { ascending })
      .range(from, from + PAGE - 1);

    if (batch && batch.length > 0) {
      allKeywords.push(...batch);
      from += PAGE;
      hasMore = batch.length === PAGE;
    } else {
      hasMore = false;
    }
  }

  return allKeywords.map(kw => ({
    id: kw.id,
    keyword: kw.keyword,
    category: kw.category,
    participant_count: kw.participant_count || 0,
    content_count: 0,
    search_volume_monthly: kw.search_volume_monthly || 0,
    search_volume_pc: 0,
    search_volume_mobile: 0,
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
  }));
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
