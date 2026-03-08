import { NextRequest, NextResponse } from 'next/server';
import {
  fetchCategoryPage,
  fetchAllKeywordsSummary,
  searchKeywordsAcrossCategories,
  fetchCategories,
} from '@/lib/naver-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = parseInt(searchParams.get('limit') || '50');
  const category = searchParams.get('category') || undefined;
  const search = searchParams.get('search') || undefined;
  const cursor = searchParams.get('cursor') || undefined;

  try {
    const categories = await fetchCategories();
    const categoryNames = ['전체', ...categories.map(c => c.name)];

    // 검색어가 있으면 → 전체 카테고리에서 검색
    if (search?.trim()) {
      const result = await searchKeywordsAcrossCategories(search.trim(), 100);
      const keywords = result.keywords.map(kw => toUIKeyword(kw));
      return NextResponse.json({
        keywords,
        categories: categoryNames,
        total: result.total,
        nextCursor: null,
      });
    }

    // 특정 카테고리 선택 → 커서 기반 페이지네이션
    if (category && category !== '전체') {
      const result = await fetchCategoryPage(category, limit, cursor, undefined);
      const keywords = result.keywords.map(kw => toUIKeyword(kw));
      return NextResponse.json({
        keywords,
        categories: categoryNames,
        total: result.total,
        nextCursor: result.nextCursor,
      });
    }

    // 전체 → 카테고리별 집계
    const result = await fetchAllKeywordsSummary(200);
    const totalAll = result.totalAll;

    // 클라이언트 요청 페이지에 맞게 슬라이싱
    const page = parseInt(searchParams.get('page') || '1');
    const start = (page - 1) * limit;
    const sliced = result.keywords.slice(start, start + limit);
    const keywords = sliced.map(kw => toUIKeyword(kw));

    return NextResponse.json({
      keywords,
      categories: categoryNames,
      total: totalAll,
      page,
      total_pages: Math.ceil(result.keywords.length / limit),
      nextCursor: null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch keywords' },
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
    competition_level: kw.participantCount > 100 ? 'high' : kw.participantCount > 30 ? 'medium' : 'low',
    recommendation_score: 0,
    trend_direction: 'stable' as const,
    trend_percentage: 0,
    is_new: false,
    first_seen_at: '',
  };
}
