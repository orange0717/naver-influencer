import type { ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════
   분석 화면 공용 타입.
   컴포넌트 파일이 서로를 import 하지 않도록 타입만 여기에 모은다.
   ═══════════════════════════════════════════════════════════════ */

/** 상태 색 토큰 하나. 배지·지표 아이콘·표 셀이 전부 이 6개만 쓴다. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent' | 'info';

export type TrendDirection = 'up' | 'down' | 'stable';

export interface TrendValue {
  direction: TrendDirection;
  /** 변화량(절대값). 0이면 표시하지 않는다. */
  value: number;
  /** "전주 대비" 같은 기준 설명 — 툴팁으로만 쓰인다. */
  label?: string;
}

/* ── MetricCardGrid ───────────────────────────────────────────── */

export interface MetricCardItem {
  key: string;
  label: string;
  value: number;
  /** 지표 성격(달성/주의/실패/중립). 아이콘·숫자 색이 여기서 파생된다. */
  tone?: StatusTone;
  /** tone 기본 아이콘 대신 쓸 아이콘 */
  icon?: ReactNode;
  trend?: TrendValue;
  /** 값 아래 보조 설명(예: "78%", "브리핑·탭 중 1곳 이상") */
  description?: string;
  /** 지정 시 카드 전체가 상세 화면 링크가 된다 */
  href?: string;
  /**
   * 숫자 대신 표시할 상태 문구(예: '미확인'·'연결 필요').
   * 확인 전 지표에 0을 지어내지 않기 위한 값.
   */
  statusText?: string;
}

export interface MetricCardGridProps {
  metrics: MetricCardItem[];
  /** 로딩 중이면 값 자리에 '—' 를 둔다(0으로 오독되지 않게). */
  loading?: boolean;
  /** 데스크톱 열 수. 기본은 카드 개수에 맞춰 자동(5개면 5열). */
  columns?: 4 | 5 | 6 | 7;
  className?: string;
}

/* ── FilterControlBar ─────────────────────────────────────────── */

/** SegmentedFilter 의 선택지와 동일 형태(그대로 넘길 수 있게 label 은 ReactNode). */
export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
  /** 회원 전용 등 잠긴 선택지 — 🔒 가 붙는다 */
  locked?: boolean;
}

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

export interface StatusTabsConfig<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export interface SearchInputConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export interface SortSelectConfig<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SortOption<T>[];
  /** select 의 title(툴팁). 예: '정렬 기준' */
  label?: string;
}

/* ── DataTable ────────────────────────────────────────────────── */

export type ColumnAlign = 'left' | 'center' | 'right';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /**
   * 셀 렌더러. renderRows 로 본문을 직접 그리는 화면에서는 컬럼이 헤더 정의(이름·폭·구분선)
   * 로만 쓰이므로 생략한다 — 호출되지 않을 함수를 컬럼마다 적지 않게 optional.
   */
  cell?: (row: T, index: number) => ReactNode;
  align?: ColumnAlign;
  /** 폭 유틸리티 클래스(예: 'w-24'). 지정하지 않으면 내용에 맞춘다. */
  width?: string;
  /** 앞에 그룹 구분선(border-l)을 넣는다 — 순위/변동 같은 묶음 구분용 */
  divider?: boolean;
  /** td 에 덧붙일 클래스 */
  cellClassName?: string;
  /** 모바일 카드 자동 렌더에서 제외 */
  hideOnMobile?: boolean;
}

export interface DataTableEmptyState {
  title: string;
  description?: ReactNode;
  /** '필터 초기화' 같은 복구 동작 */
  action?: ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** 카드 헤더 제목. 없으면 카드 껍데기 없이 표만 그린다. */
  title?: string;
  /** 헤더 우측 건수 표기(예: '128개') */
  count?: ReactNode;
  loading?: boolean;
  /** 로딩 스켈레톤 행 수 (기본 6) */
  loadingRows?: number;
  empty?: DataTableEmptyState;
  /** 헤더 고정 (기본 true) */
  stickyHeader?: boolean;
  /** 세로 스크롤 상한(sticky 헤더가 의미를 가지려면 필요). 예: '70vh' */
  maxHeight?: string;
  /** 표 최소 폭(가로 스크롤 기준). 예: '1200px' */
  minWidth?: string;
  /** table 엘리먼트에 덧붙일 클래스. 예: 'table-fixed'(열 폭을 % 로 배분할 때) */
  tableClassName?: string;
  rowClassName?: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  /**
   * 한 항목이 여러 tr 로 펼쳐지는 화면(키워드 순위: 포스팅 1개 = 대표+보조 키워드 n행)용 탈출구.
   * 지정하면 columns 는 헤더 정의로만 쓰이고 본문은 이 함수가 그린다.
   */
  renderRows?: (row: T, index: number) => ReactNode;
  /** 모바일(<md) 카드. 없으면 columns 로 라벨:값 목록을 자동 생성한다. */
  renderMobileCard?: (row: T, index: number) => ReactNode;
  /** 표 아래 영역(페이지네이션 등) */
  footer?: ReactNode;
  className?: string;
}
