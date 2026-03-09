/**
 * chart-colors.ts — Recharts용 공통 색상 상수
 *
 * Recharts는 CSS 변수를 직접 사용할 수 없으므로
 * globals.css @theme 변수를 여기서 hex 상수로 미러링합니다.
 */

/* ── 차트 공통 (그리드, 축, 툴팁) ── */
export const CHART = {
  grid: '#FDE4CF',
  axis: '#FDE4CF',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#FDE4CF',
  tickFill: '#8C7A6E',
  labelFill: '#8C7A6E',
} as const;

/* ── 다중 시리즈 색상 (최대 7개) ── */
export const SERIES_COLORS = [
  '#CC9486', // accent (피치)
  '#B8612A', // accent2 (딥 오렌지)
  '#2E8B57', // up (그린)
  '#4D8FCC', // blue
  '#D4A017', // gold
  '#D94848', // down (레드)
  '#A0A0A0', // silver
];

/* ── 방향별 색상 (TrendAreaChart) ── */
export const DIRECTION_COLORS = {
  up: '#2E8B57',
  down: '#D94848',
  stable: '#CC9486',
} as const;

/* ── 경쟁자 비교 (CompetitorBarChart) ── */
export const COMPETITOR = {
  me: '#CC9486',
  other: '#FDE4CF',
} as const;
