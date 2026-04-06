import { NextRequest, NextResponse } from 'next/server';
import { parseQueryToFilters, matchPowerContentKeyword } from '@/lib/ai-search';

export const dynamic = 'force-dynamic';

/**
 * 광고주 자연어 검색 파싱 API
 * GET /api/ad/parse-query?q=프로폴리스+인플루언서+찾아줘
 *
 * 1단계: 규칙 기반 파서 (CATEGORY_ALIASES + TOPIC_KEYWORDS)
 * 2단계: 파워콘텐츠 95K 키워드 매칭 (서버사이드)
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || '';
  if (!query.trim()) {
    return NextResponse.json({ filters: {}, matched: false });
  }

  // 1단계: 규칙 기반 파서
  const filters = parseQueryToFilters(query);

  // 2단계: keyword_text가 없으면 파워콘텐츠 키워드 매칭 시도
  if (!filters.keyword_text) {
    const pcMatch = matchPowerContentKeyword(query);
    if (pcMatch) {
      filters.keyword_text = pcMatch.keyword;
      // 카테고리도 없으면 파워콘텐츠 카테고리 사용
      if (!filters.category) {
        filters.category = pcMatch.category;
      }
    }
  }

  // keyword_text가 있으면 카테고리 필터 제거 (너무 좁아짐)
  if (filters.keyword_text && filters.category) {
    delete filters.category;
  }

  const hasMeaningfulFilters = !!(
    filters.category || filters.keyword_text || filters.min_subscriber_count ||
    filters.min_fan_count || filters.min_total_keywords || filters.min_top3_count ||
    filters.ranking_top_n || filters.recency_days
  );

  return NextResponse.json({
    filters,
    matched: hasMeaningfulFilters,
  });
}
