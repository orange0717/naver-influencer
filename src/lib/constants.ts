/** 경쟁도 분류 기준 (참여자 수) */
export const COMPETITION_THRESHOLDS = {
  HIGH: 100,
  MEDIUM: 30,
} as const;

/** 위젯 설정 */
export const WIDGET = {
  MAX_WIDTH: 170,
} as const;

/** 페이지네이션 기본값 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
} as const;

/** 키워드 제한 */
export const LIMITS = {
  MAX_KEYWORDS_PER_USER: 20,
  NEW_INFLUENCER_DAYS: 7,
} as const;

export function getCompetitionLevel(participantCount: number): 'high' | 'medium' | 'low' {
  if (participantCount > COMPETITION_THRESHOLDS.HIGH) return 'high';
  if (participantCount > COMPETITION_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}
