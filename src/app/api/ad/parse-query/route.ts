import { NextRequest, NextResponse } from 'next/server';
import { parseQueryToFilters, matchPowerContentKeyword } from '@/lib/ai-search';

export const dynamic = 'force-dynamic';

/**
 * 광고주 자연어 검색 파싱 API
 * GET /api/ad/parse-query?q=프로폴리스+인플루언서+찾아줘
 *
 * 1단계: 파워콘텐츠 95K 키워드 정확 매칭 → 카테고리 결정
 * 2단계: 규칙 기반 파서 (CATEGORY_ALIASES + TOPIC_KEYWORDS, 숫자/정렬)
 *
 * 파워콘텐츠 키워드는 광고주 업종 키워드이므로 카테고리 매핑에만 사용.
 * (인플루언서 프로필에는 "프로폴리스", "임플란트" 같은 구체적 키워드가 없음)
 * TOPIC_KEYWORDS는 인플루언서 프로필에 나타나는 넓은 주제 키워드.
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') || '';
  if (!query.trim()) {
    return NextResponse.json({ filters: {}, matched: false });
  }

  // 1단계: 파워콘텐츠 키워드 정확 매칭 (카테고리 결정 용도)
  const pcMatch = matchPowerContentKeyword(query);

  // 2단계: 규칙 기반 파서 (숫자, 정렬, 카테고리, 토픽 키워드 등)
  const filters = parseQueryToFilters(query);

  // 파워콘텐츠 매칭 결과 적용: 카테고리만 덮어쓰기
  // (keyword_text는 TOPIC_KEYWORDS에서만 설정 — 인플루언서 프로필 검색용)
  if (pcMatch && !filters.category) {
    filters.category = pcMatch.category;
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
