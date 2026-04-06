/**
 * AI 자연어 인플루언서 검색 — 규칙 기반 파서
 */

export interface InfluencerSearchFilters {
  category?: string;
  keyword_text?: string;
  min_subscriber_count?: number;
  min_fan_count?: number;
  min_total_keywords?: number;
  min_top3_count?: number;
  sort_by?: 'subscriber_count' | 'fan_count' | 'total_keywords' | 'integrated_top3_count' | 'top3_ratio' | 'top1_count' | 'last_crawled_at' | 'first_seen_at';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  recency_days?: number;
  ranking_top_n?: number;
}

// 실제 DB/API 카테고리명에 맞춤
export const CATEGORIES = [
  '여행', '패션', '뷰티', '푸드', 'IT테크', '자동차', '리빙', '육아',
  '생활건강', '게임', '동물/펫', '운동/레저', '프로스포츠', '방송/연예',
  '대중음악', '영화', '공연/전시/예술', '도서', '경제/비즈니스', '어학/교육',
] as const;

// 카테고리 별칭 매핑 (자연어 표현 → 실제 DB 카테고리명)
const CATEGORY_ALIASES: Record<string, string> = {
  '뷰티': '뷰티', '화장품': '뷰티', '메이크업': '뷰티', '스킨케어': '뷰티', '미용': '뷰티',
  '도서': '도서', '책': '도서', '독서': '도서',
  '여행': '여행', '관광': '여행', '해외여행': '여행', '국내여행': '여행',
  '맛집': '푸드', '음식': '푸드', '먹방': '푸드', '레스토랑': '푸드', '푸드': '푸드', '요리': '푸드', '레시피': '푸드', '베이킹': '푸드',
  '동물': '동물/펫', '반려동물': '동물/펫', '펫': '동물/펫', '강아지': '동물/펫', '고양이': '동물/펫',
  '어학': '어학/교육', '외국어': '어학/교육', '영어': '어학/교육', '일본어': '어학/교육', '교육': '어학/교육',
  '공연': '공연/전시/예술', '전시': '공연/전시/예술', '예술': '공연/전시/예술',
  '경제': '경제/비즈니스', '비즈니스': '경제/비즈니스', '재테크': '경제/비즈니스', '부동산': '경제/비즈니스', '주식': '경제/비즈니스', '금융': '경제/비즈니스',
  '패션': '패션', '옷': '패션', '의류': '패션', '잡화': '패션',
  '생활건강': '생활건강', '건강': '생활건강', '다이어트': '생활건강',
  '인테리어': '리빙', '리빙': '리빙', '집꾸미기': '리빙',
  '육아': '육아', '아기': '육아', '임신': '육아', '출산': '육아',
  '게임': '게임',
  'it테크': 'IT테크', '컴퓨터': 'IT테크', '테크': 'IT테크', '프로그래밍': 'IT테크',
  '운동': '운동/레저', '레저': '운동/레저', '헬스': '운동/레저', '필라테스': '운동/레저', '요가': '운동/레저', '등산': '운동/레저', '캠핑': '운동/레저', '낚시': '운동/레저',
  '스포츠': '프로스포츠', '프로스포츠': '프로스포츠', '축구': '프로스포츠', '야구': '프로스포츠', '골프': '프로스포츠',
  '자동차': '자동차', '차': '자동차', '드라이브': '자동차',
  '음악': '대중음악', '대중음악': '대중음악', '노래': '대중음악',
  '영화': '영화', '드라마': '영화', '넷플릭스': '영화',
  '방송': '방송/연예', '연예': '방송/연예', '엔터테인먼트': '방송/연예',
};

// 키워드 주제 (카테고리에 매핑되지만 keyword_text로도 검색할 주제들)
const TOPIC_KEYWORDS = [
  '부동산', '주식', '재테크', '다이어트', '스킨케어', '메이크업',
  '캠핑', '등산', '낚시', '골프', '헬스', '필라테스', '요가',
  '인테리어', '집꾸미기', '요리', '베이킹', '카페',
  '강아지', '고양이', '육아', '임신', '출산',
];

/**
 * 자연어 쿼리를 구조화된 필터로 변환하는 규칙 기반 파서
 */
export function parseQueryToFilters(query: string): InfluencerSearchFilters {
  const filters: InfluencerSearchFilters = {};
  const q = query.toLowerCase();

  // ── 카테고리 감지 (긴 별칭 우선 매칭) ──
  const sortedAliases = Object.entries(CATEGORY_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, category] of sortedAliases) {
    if (q.includes(alias.toLowerCase())) {
      filters.category = category;
      break;
    }
  }

  // ── 키워드 텍스트 감지 (토픽 키워드) ──
  for (const topic of TOPIC_KEYWORDS) {
    if (q.includes(topic.toLowerCase())) {
      filters.keyword_text = topic;
      break;
    }
  }

  // ── 숫자 파싱 ──
  // "상위 N명" / "탑 N" / "TOP N"
  const topNMatch = q.match(/(?:상위|탑|top)\s*(\d+)\s*(?:명|위|개)?/i);
  if (topNMatch) {
    filters.ranking_top_n = parseInt(topNMatch[1]);
    filters.limit = parseInt(topNMatch[1]);
  }

  // "N명" (단독 사용 시 limit)
  if (!filters.limit) {
    const limitMatch = q.match(/(\d+)\s*명/);
    if (limitMatch) {
      filters.limit = parseInt(limitMatch[1]);
    }
  }

  // "팬수 1만명 이상" / "팬 1만명 이상" / "구독자 5천명 이상" / "팔로워 1k 이상"
  const fanMatch = q.match(/(?:팬수?|구독자수?|팔로워)\s*(\d+)\s*(만|천|k)?\s*(?:명)?\s*이상/i);
  if (fanMatch) {
    let num = parseInt(fanMatch[1]);
    if (fanMatch[2] === '만') num *= 10000;
    else if (fanMatch[2] === '천' || fanMatch[2]?.toLowerCase() === 'k') num *= 1000;
    if (q.includes('팬')) filters.min_fan_count = num;
    else filters.min_subscriber_count = num;
  }

  // "키워드 N개 이상"
  const kwCountMatch = q.match(/키워드\s*(\d+)\s*개?\s*이상/);
  if (kwCountMatch) {
    filters.min_total_keywords = parseInt(kwCountMatch[1]);
  }

  // "TOP3 N회 이상"
  const top3Match = q.match(/(?:top\s*3|탑3)\s*(\d+)\s*(?:회|번)?\s*이상/i);
  if (top3Match) {
    filters.min_top3_count = parseInt(top3Match[1]);
  }

  // ── 정렬 감지 ──
  if (q.includes('top3 비율') || q.includes('탑3 비율') || q.includes('top3비율')) {
    filters.sort_by = 'top3_ratio';
    filters.sort_order = 'desc';
  } else if (q.includes('구독자') && (q.includes('많은') || q.includes('높은') || q.includes('순'))) {
    filters.sort_by = 'subscriber_count';
    filters.sort_order = 'desc';
  } else if (q.includes('팬') && (q.includes('많은') || q.includes('높은') || q.includes('순'))) {
    filters.sort_by = 'fan_count';
    filters.sort_order = 'desc';
  } else if (q.includes('1위') || q.includes('1등')) {
    filters.sort_by = 'top1_count';
    filters.sort_order = 'desc';
  } else if (q.includes('신규') || q.includes('새로') || q.includes('최근 선정') || q.includes('새로운')) {
    filters.sort_by = 'first_seen_at';
    filters.sort_order = 'desc';
  } else if (q.includes('키워드') && (q.includes('많은') || q.includes('많이'))) {
    filters.sort_by = 'total_keywords';
    filters.sort_order = 'desc';
  }

  // ── 최근 활동 감지 ──
  if (q.includes('꾸준히') || q.includes('꾸준한') || q.includes('활발') || q.includes('활동') || q.includes('포스팅')) {
    filters.recency_days = filters.recency_days || 30;
  }
  if (q.includes('최근')) {
    const recentMatch = q.match(/최근\s*(\d+)\s*(?:일|개월)/);
    if (recentMatch) {
      const num = parseInt(recentMatch[1]);
      filters.recency_days = q.includes('개월') ? num * 30 : num;
    } else {
      filters.recency_days = filters.recency_days || 30;
    }
  }

  // ── keyword_text가 있으면 카테고리 필터 제거 (너무 좁아짐) ──
  // "부동산"은 경제·비즈니스로 매핑되지만, 실제로는 keyword_text로 검색하는 게 적합
  if (filters.keyword_text && filters.category) {
    delete filters.category;
  }

  // ── 기본값 ──
  if (!filters.limit) filters.limit = 10;
  if (!filters.sort_by) filters.sort_by = 'integrated_top3_count';
  if (!filters.sort_order) filters.sort_order = 'desc';

  return filters;
}

/**
 * 규칙 기반 요약 생성
 */
export function buildRuleSummary(query: string, filters: InfluencerSearchFilters, totalResults: number): string {
  if (totalResults === 0) {
    return '조건에 맞는 인플루언서를 찾지 못했습니다. 검색 조건을 조정해보세요.';
  }

  const parts: string[] = [];

  if (filters.category) parts.push(`${filters.category} 카테고리`);
  if (filters.keyword_text) parts.push(`"${filters.keyword_text}" 관련`);
  if (filters.min_subscriber_count) parts.push(`구독자 ${filters.min_subscriber_count.toLocaleString()}명 이상`);
  if (filters.min_fan_count) parts.push(`팬 ${filters.min_fan_count.toLocaleString()}명 이상`);
  if (filters.ranking_top_n) parts.push(`상위 ${filters.ranking_top_n}명`);
  if (filters.recency_days) parts.push(`최근 ${filters.recency_days}일 내 활동`);

  const sortLabels: Record<string, string> = {
    subscriber_count: '구독자 수',
    fan_count: '팬 수',
    total_keywords: '참여 키워드 수',
    integrated_top3_count: 'TOP3 횟수',
    top3_ratio: 'TOP3 비율',
    top1_count: '1위 횟수',
    last_crawled_at: '최근 활동',
    first_seen_at: '선정일',
  };
  const sortLabel = filters.sort_by ? sortLabels[filters.sort_by] || '' : '';

  const condition = parts.length > 0 ? parts.join(', ') + ' 조건으로' : '';
  const sortInfo = sortLabel ? `${sortLabel} 기준으로 정렬하여` : '';

  return `${condition} ${sortInfo} 총 ${totalResults}명의 인플루언서를 찾았습니다. 상위 ${Math.min(filters.limit || 10, totalResults)}명을 표시합니다.`.trim().replace(/\s+/g, ' ');
}
