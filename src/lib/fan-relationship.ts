/**
 * 맞팬 관계 상태 어휘 — 페이지(/my/fans)와 대시보드 요약 카드가 공유한다.
 * React 비의존(상수만) → 서버/클라이언트 양쪽에서 import 가능.
 *
 * 사람별 관계는 내 인증 목록의 집합연산 결과라 "확정값"만 존재한다(추정 없음).
 * '관계 없음/확인 중/확인 실패'는 사람별이 아니라 데이터셋 수준 개념이다.
 */

export type Relationship = 'mutual' | 'onlyIFollow' | 'onlyFollowsMe';
export type HistoryStatus = 'mutual' | 'only_i_follow' | 'only_follows_me' | 'none';

export const RELATIONSHIP_LABEL: Record<Relationship, string> = {
  mutual: '맞팬',
  onlyIFollow: '내가 팬함',
  onlyFollowsMe: '상대만 팬함',
};

/** Tailwind 배지 클래스(테마 토큰 기반, /my 대시보드에서 이미 사용 중인 유틸) */
export const RELATIONSHIP_BADGE: Record<Relationship, string> = {
  mutual: 'bg-up/10 text-up border-up/30',
  onlyIFollow: 'bg-accent/10 text-accent border-accent/30',
  onlyFollowsMe: 'bg-gold/10 text-gold border-gold/40',
};

/** 요약 바 점 색상 */
export const RELATIONSHIP_DOT: Record<Relationship, string> = {
  mutual: 'bg-up',
  onlyIFollow: 'bg-accent',
  onlyFollowsMe: 'bg-gold',
};

export const HISTORY_LABEL: Record<HistoryStatus, string> = {
  mutual: '맞팬',
  only_i_follow: '내가 팬함',
  only_follows_me: '상대만 팬함',
  none: '관계 없음',
};
