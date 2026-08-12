/**
 * 네이버 메이트(mate.naver.com) 공식 분야 목록 — 유일한 원본(single source of truth).
 *
 * mate.naver.com 의 "이달의 메이트" 화면이 노출하는 25개 주제(TOPIC_001~025)를 그대로 옮긴 것으로,
 * 이름·순서·분류 기준을 네이버 메이트의 실제 카테고리 체계와 1:1로 일치시킨다(2026-07-07 실측 확인).
 *
 * - 크롤러(naver-mate-crawler.ts)는 이 목록으로 각 서비스의 topic-contributors API를 순회 수집한다.
 * - 랭킹 API/화면은 이 배열의 인덱스를 카테고리 정렬 기준으로 삼아, 네이버 메이트와 동일한 순서로 노출한다.
 *   (임의의 가나다순 정렬을 쓰지 않는다.)
 */

export interface MateTopic {
  topicId: string;
  category: string;
}

/** 네이버 메이트 공식 분야 25개 — 노출 순서 그대로 유지할 것 */
export const MATE_TOPICS: MateTopic[] = [
  { topicId: 'TOPIC_001', category: '국내여행' },
  { topicId: 'TOPIC_002', category: '해외여행' },
  { topicId: 'TOPIC_003', category: '푸드' },
  { topicId: 'TOPIC_004', category: '레시피' },
  { topicId: 'TOPIC_005', category: '패션' },
  { topicId: 'TOPIC_006', category: '뷰티' },
  { topicId: 'TOPIC_007', category: '리빙' },
  { topicId: 'TOPIC_008', category: '반려동물' },
  { topicId: 'TOPIC_009', category: '건강' },
  { topicId: 'TOPIC_010', category: '육아' },
  { topicId: 'TOPIC_011', category: '영화' },
  { topicId: 'TOPIC_012', category: '방송' },
  { topicId: 'TOPIC_013', category: '애니메이션' },
  { topicId: 'TOPIC_014', category: '공연ㆍ전시' },
  { topicId: 'TOPIC_015', category: '음악' },
  { topicId: 'TOPIC_016', category: '책' },
  { topicId: 'TOPIC_017', category: '예술' },
  { topicId: 'TOPIC_018', category: 'ITㆍ테크' },
  { topicId: 'TOPIC_019', category: '자동차' },
  { topicId: 'TOPIC_020', category: '교육' },
  { topicId: 'TOPIC_021', category: '경제' },
  { topicId: 'TOPIC_022', category: '사회' },
  { topicId: 'TOPIC_023', category: '스포츠' },
  { topicId: 'TOPIC_024', category: '게임' },
  { topicId: 'TOPIC_025', category: '취미' },
];

/** 공식 분야명 배열(순서 유지) */
export const MATE_CATEGORIES: string[] = MATE_TOPICS.map((t) => t.category);

/** 공식 순서 인덱스 조회용 맵. 목록에 없는 값은 undefined. */
const MATE_CATEGORY_ORDER = new Map<string, number>(MATE_CATEGORIES.map((c, i) => [c, i]));

/**
 * 카테고리 문자열 배열을 네이버 메이트 공식 순서로 정렬한다.
 * 공식 목록에 없는 값(예: 과거 데이터)은 뒤로 밀되 가나다순으로 안정 정렬한다.
 */
export function sortByMateOrder(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const ia = MATE_CATEGORY_ORDER.get(a);
    const ib = MATE_CATEGORY_ORDER.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b, 'ko');
  });
}
