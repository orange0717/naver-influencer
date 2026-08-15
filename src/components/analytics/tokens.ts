import type { StatusTone } from './types';

/* ═══════════════════════════════════════════════════════════════
   analytics-tokens.css 의 CSS 변수를 컴포넌트에서 쓰기 위한 매핑.
   색은 여기서 hex 를 다시 적지 않고 항상 var(--a-*) 를 참조한다
   (팔레트를 바꿀 곳이 css 파일 한 곳으로 유지된다).
   ═══════════════════════════════════════════════════════════════ */

/** 토큰 스코프 클래스 — AnalyticsLayout 이 최상단에 붙인다. */
export const ANALYTICS_SCOPE = 'analytics-scope';

/** CSS 밖(차트 색, SVG fill, canvas 등)에서 필요한 원시 값 */
export const ANALYTICS_TOKEN_VARS = {
  accent: 'var(--a-accent)',
  accentHover: 'var(--a-accent-hover)',
  canvas: 'var(--a-canvas)',
  surface: 'var(--a-surface)',
  border: 'var(--a-border)',
  text: 'var(--a-text)',
  text2: 'var(--a-text-2)',
  dim: 'var(--a-dim)',
} as const;

/** 상태 배지(pill) — 배경/글자 쌍 */
export const TONE_BADGE_CLASS: Record<StatusTone, string> = {
  success: 'bg-[var(--a-success-bg)] text-[var(--a-success-fg)]',
  warning: 'bg-[var(--a-warning-bg)] text-[var(--a-warning-fg)]',
  danger: 'bg-[var(--a-danger-bg)] text-[var(--a-danger-fg)]',
  neutral: 'bg-[var(--a-neutral-bg)] text-[var(--a-neutral-fg)]',
  accent: 'bg-[var(--a-accent-soft)] text-[var(--a-accent)]',
  info: 'bg-[var(--a-info-bg)] text-[var(--a-info-fg)]',
};

/** 상태 글자색만 필요할 때(표 셀 숫자 등) */
export const TONE_TEXT_CLASS: Record<StatusTone, string> = {
  success: 'text-[var(--a-success-fg)]',
  warning: 'text-[var(--a-warning-fg)]',
  danger: 'text-[var(--a-danger-fg)]',
  neutral: 'text-[var(--a-neutral-fg)]',
  accent: 'text-[var(--a-accent)]',
  info: 'text-[var(--a-info-fg)]',
};

/**
 * tone → AnimatedStatCard 의 color.
 * 지표 카드는 기존 카드 프리미티브를 그대로 쓰고 색만 톤에서 파생시킨다
 * (카드 그리드를 새로 그리면 대시보드의 다른 KPI 행과 높이·애니메이션이 어긋난다).
 */
export const TONE_STAT_COLOR: Record<StatusTone, 'accent' | 'up' | 'down' | 'gold' | 'dim'> = {
  success: 'up',
  warning: 'gold',
  danger: 'down',
  neutral: 'dim',
  accent: 'accent',
  info: 'accent',
};

/** 공용 컨트롤 문구 — 두 화면이 같은 라벨을 쓰도록 상수로 묶는다. */
export const DEFAULT_SORT_LABEL = '정렬 기준';
export const DEFAULT_SEARCH_PLACEHOLDER = '게시글 제목·대표키워드 검색';

/** 포스팅 목록 정렬 — 키워드 순위·AI 브리핑이 같은 선택지를 쓴다. */
export type PostSortKey = 'latest' | 'oldest' | 'title';
export const POST_SORT_OPTIONS: { value: PostSortKey; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'oldest', label: '오래된순' },
  { value: 'title', label: '제목순' },
];
