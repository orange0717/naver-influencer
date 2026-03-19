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
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50') || 50), 100);
  const category = searchParams.get('category')?.slice(0, 50) || undefined;
  const search = searchParams.get('search')?.slice(0, 100) || undefined;
  const cursor = searchParams.get('cursor')?.slice(0, 100) || undefined;

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

    // 키워드 수 기준 정렬
    const groupedList = Object.entries(grouped)
      .filter(([, v]) => v.keywords.length > 0)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, data]) => ({
        category: name,
        total: data.total,
        keywords: data.keywords.slice(0, 10), // 카테고리당 TOP 10
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
    competition_level: kw.participantCount > 100 ? 'high' : kw.participantCount > 30 ? 'medium' : 'low',
    recommendation_score: 0,
    trend_direction: 'stable' as const,
    trend_percentage: 0,
    is_new: false,
    first_seen_at: '',
  };
}
