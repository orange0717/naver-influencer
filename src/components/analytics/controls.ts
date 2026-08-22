// 필터 줄 컨트롤 공통 치수.
// globals.css 의 base 규칙(button 14px / input·select 15px)이 부모에 준 text-[11px] 를 덮어써서
// 탭 37px · 날짜 40px · 검색창 30px 로 높이가 제각각이 되던 문제가 있었다.
// 컨트롤 자신에게 높이와 글자 크기를 직접 박아 세 종류를 32px 로 맞춘다.
export const CONTROL_HEIGHT = 'h-8';

/** 날짜·검색 input, select 공통 박스 */
export const controlBoxClass = 'h-8 px-3 rounded-lg border border-border bg-surface text-xs';

/** 세그먼트 탭 그룹 테두리 */
export const segmentGroupClass = 'flex h-8 rounded-lg border border-border overflow-hidden';

/** 세그먼트 탭 버튼 (active/inactive 색은 호출측이 덧붙인다) */
export const segmentButtonClass = 'h-full px-3 text-[11px] font-semibold transition cursor-pointer';

/** 필터 줄 안에서 input·select 와 같은 32px 로 서는 버튼 */
export const filterButtonClass =
  'h-8 px-4 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-hover transition cursor-pointer disabled:opacity-50';

/** 페이지 헤더 액션 버튼 — 키워드 순위/AI 브리핑 상단 버튼과 동일 치수 */
export const actionButtonClass =
  'px-4 py-2 rounded-xl bg-accent text-white text-sm font-bold hover:bg-accent-hover transition cursor-pointer disabled:opacity-50';
export const actionButtonSecondaryClass =
  'px-4 py-2 rounded-xl border border-border bg-surface text-sm font-semibold text-dim hover:text-accent hover:border-accent/40 transition cursor-pointer disabled:opacity-50';
/** 진행 중단 등 파괴적 헤더 액션 — 색만 다르고 치수는 위 둘과 같다 */
export const actionButtonDangerClass =
  'px-4 py-2 rounded-xl border border-down/30 bg-down/10 text-sm font-bold text-down hover:bg-down/20 transition cursor-pointer disabled:opacity-50';

/** 페이지 주 내비게이션용 큰 세그먼트(예: 경쟁자 분석 상단 탭) */
export const segmentGroupLgClass = 'flex h-12 rounded-xl border border-border overflow-hidden';
export const segmentButtonLgClass = 'h-full px-5 text-sm font-bold transition cursor-pointer';
