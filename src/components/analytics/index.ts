/* 분석 화면 공용 컴포넌트 배럴.
   화면 쪽 import 를 한 줄로 유지한다:
     import { DashboardLayout, MetricCardGrid, FilterControlBar, DataTable } from '@/components/analytics';
*/

// 골격
export { default as DashboardLayout } from './DashboardLayout';
export { default as PageHeader, type PrimaryAction } from './PageHeader';

// 지표
export { default as MetricCardGrid } from './MetricCardGrid';
export { default as SummaryCards, type SummaryCard } from './SummaryCards';
export { default as StatusIcon } from './StatusIcon';
export { default as StatusBadge } from './StatusBadge';
export { default as CheckProgress } from './CheckProgress';

// 필터
export { default as FilterControlBar, SearchInput, SortSelect, selectControlClass } from './FilterControlBar';
export { default as PeriodFilter, PERIOD_OPTIONS, FREE_DAYS, periodLabel, isExtendedPeriod } from './PeriodFilter';
export { default as SegmentedFilter } from './SegmentedFilter';
export { default as FilterPills } from './FilterPills';
export { default as PostSearchBar, selectClass } from './PostSearchBar';

// 확인 모달 · 키워드 편집
export { default as ConfirmDialog } from './ConfirmDialog';
export { default as AddKeywordControl } from './AddKeywordControl';
export * from './constants';

// 표
export { default as DataTable } from './DataTable';
export { default as AnalyticsTableShell } from './AnalyticsTableShell';
export { default as Pagination } from './Pagination';
export { default as MoreMenu, menuItemClass, menuLinkClass, menuItemDangerClass } from './MoreMenu';

// 토큰 · 타입
export * from './tokens';
export * from './types';
export {
  CONTROL_HEIGHT,
  controlBoxClass,
  segmentGroupClass,
  segmentButtonClass,
  filterButtonClass,
  actionButtonClass,
  actionButtonSecondaryClass,
} from './controls';
