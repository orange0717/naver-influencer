/** 경쟁도 분류 기준 */
export const COMPETITION_THRESHOLDS = {
  HIGH: 100,
  MEDIUM: 30,
} as const;

/** 경쟁도 점수 가중치 */
export const COMPETITION_WEIGHTS = {
  PARTICIPANT: 0.6,      // 참여자 수 비중
  SEARCH_VOLUME: 0.25,   // 월검색량 비중 (검색량 대비 참여자가 많으면 경쟁 높음)
  RECENCY: 0.15,         // 최근 등록 여부 비중 (최근에 등록된 키워드일수록 경쟁 활발)
} as const;

/** 기본 경쟁도 (참여자 수 기반 - 폴백용) */
export function getCompetitionLevel(participantCount: number): 'high' | 'medium' | 'low' {
  if (participantCount > COMPETITION_THRESHOLDS.HIGH) return 'high';
  if (participantCount > COMPETITION_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

/**
 * 복합 경쟁도 계산 (참여자 수 + 월검색량 + 등록일)
 * - 참여자 많을수록 경쟁도 높음
 * - 검색량 대비 참여자가 많으면 경쟁도 높음
 * - 최근 등록된 키워드일수록 경쟁이 활발
 */
export function getCompetitionLevelAdvanced(
  participantCount: number,
  searchVolumeMonthly?: number,
  firstSeenAt?: string,
): 'high' | 'medium' | 'low' {
  // 검색량/등록일 데이터가 없으면 기본 로직 사용
  if (!searchVolumeMonthly && !firstSeenAt) {
    return getCompetitionLevel(participantCount);
  }

  const w = COMPETITION_WEIGHTS;
  let score = 0;

  // 참여자 수 점수 (0~100)
  const participantScore = Math.min(100, (participantCount / 150) * 100);
  score += participantScore * w.PARTICIPANT;

  // 검색량 대비 참여율 점수 (검색량이 있을 때만)
  if (searchVolumeMonthly && searchVolumeMonthly > 0) {
    const ratio = participantCount / searchVolumeMonthly;
    // ratio가 높을수록 (검색량 대비 참여자가 많을수록) 경쟁도 높음
    const volumeScore = Math.min(100, ratio * 500);
    score += volumeScore * w.SEARCH_VOLUME;
  } else {
    // 검색량 데이터 없으면 참여자 수로 보정
    score += participantScore * w.SEARCH_VOLUME;
  }

  // 등록 시점 점수 (최근일수록 경쟁 활발)
  if (firstSeenAt) {
    const daysSinceCreated = (Date.now() - new Date(firstSeenAt).getTime()) / (1000 * 60 * 60 * 24);
    // 최근 30일 이내 → 높은 점수, 1년 이상 → 낮은 점수
    const recencyScore = Math.max(0, Math.min(100, 100 - (daysSinceCreated / 365) * 80));
    score += recencyScore * w.RECENCY;
  } else {
    score += 50 * w.RECENCY;
  }

  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}
