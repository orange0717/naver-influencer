/**
 * 마케팅 문구에 노출되는 데이터 규모 수치 — Single Source of Truth.
 *
 * 화면에 실시간으로 뜨는 숫자는 /api/stats(stats_cache, 크론 갱신)를 쓴다.
 * 다만 SEO 메타데이터·구조화 데이터·OG 이미지는 정적으로 렌더링되어 런타임 조회를
 * 할 수 없으므로, 그 자리에 들어갈 값만 이 파일에 모은다.
 *
 * ⚠️ 이 파일을 만든 이유: 같은 수치가 layout/opengraph-image/influencers/subscribe 에
 * 각각 하드코딩돼 서로 어긋나 있었다(2026-08-27 정정). 인플루언서 수는 19,980 으로
 * 굳어 있었지만 실제는 20,379 였고, 활동 인원은 13,104 로 적혀 있었지만 실제는 9,003 이었다.
 * 앞으로는 반드시 이 파일만 고친다.
 *
 * 갱신 방법
 *   1) 인플루언서 총원·활동 인원 : https://ninfle.kr/api/stats 의
 *      influencer_count / active_count 를 그대로 반영
 *   2) 블로거 : Supabase SQL 에디터에서 `select count(*) from bloggers;`
 *   3) 키워드 : `select count(*) from keyword_challenges;`
 *   4) MEASURED_AT 를 측정일로 갱신
 */

export const SITE_STATS = {
  /** influencers 총원 — /api/stats influencer_count (2026-08-27 실측) */
  influencers: 20379,
  /** 활동 인플루언서 — /api/stats active_count (2026-08-27 실측) */
  activeInfluencers: 9003,
  /**
   * bloggers 총원 — 미실측 값이라 "명+"(이상) 형태로만 노출한다.
   * bloggers 는 발굴 배치로 누적만 되고 수집 제외 요청 외에는 삭제되지 않으므로
   * 과거 측정치를 하한으로 쓰는 것은 성립한다. 정확한 값이 필요하면 위 2) 를 실행할 것.
   */
  bloggersAtLeast: 83933,
  /** keyword_challenges 총원 (2026-08-27 실측) */
  keywords: 115483,
  /** 지원 카테고리 수 — 네이버 키워드챌린지 공식 분류 */
  categories: 20,
  measuredAt: '2026-08-27',
} as const;

/** 1,234 형태로 포맷 */
export function statNum(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 자주 쓰는 조합 문구 */
export const STAT_TEXT = {
  /** "20,379명" */
  influencers: `${statNum(SITE_STATS.influencers)}명`,
  /** "9,003명" */
  activeInfluencers: `${statNum(SITE_STATS.activeInfluencers)}명`,
  /** "83,933명+" */
  bloggers: `${statNum(SITE_STATS.bloggersAtLeast)}명+`,
  /** "115,483개" */
  keywords: `${statNum(SITE_STATS.keywords)}개`,
} as const;
