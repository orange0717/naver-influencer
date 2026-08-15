'use client';

import { ComponentProps, ReactNode } from 'react';
import PeriodFilter from './PeriodFilter';
import SegmentedFilter from './SegmentedFilter';
import { controlBoxClass } from './controls';
import { DEFAULT_SEARCH_PLACEHOLDER, DEFAULT_SORT_LABEL } from './tokens';
import type { SearchInputConfig, SortSelectConfig, StatusTabsConfig } from './types';

/* ═══════════════════════════════════════════════════════════════
   기간 · 상태 · 검색 · 정렬을 한 줄 규칙으로 묶은 필터 바.

   지금까지는 화면마다 <PeriodFilter/> <SegmentedFilter/> <PostSearchBar/> 를
   직접 쌓아서, 순서·간격·정렬 select 위치가 화면마다 조금씩 달랐다.
   배치를 이 컴포넌트가 소유하고 각 화면은 "무엇을 보여줄지"만 넘긴다.

   레이아웃(고정):
     1행  기간 선택 ───────────────────────────── (우측) meta
     2행  상태 탭 · 검색창 · 정렬 select · extra
   ═══════════════════════════════════════════════════════════════ */

export const selectControlClass = `${controlBoxClass} text-dim cursor-pointer`;

type PeriodConfig = ComponentProps<typeof PeriodFilter>;

/** 검색 input 단독 사용(필터 바 밖)이 필요한 화면을 위해 따로 export */
export function SearchInput({ value, onChange, placeholder = DEFAULT_SEARCH_PLACEHOLDER }: SearchInputConfig) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className={`${controlBoxClass} w-56`}
    />
  );
}

export function SortSelect<T extends string>({ value, onChange, options, label = DEFAULT_SORT_LABEL }: SortSelectConfig<T>) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      title={label}
      aria-label={label}
      className={selectControlClass}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function FilterControlBar<S extends string | number, K extends string>({
  period,
  status,
  search,
  sort,
  extra,
  meta,
  className = '',
}: {
  period?: PeriodConfig;
  status?: StatusTabsConfig<S>;
  search?: SearchInputConfig;
  sort?: SortSelectConfig<K>;
  /** 화면 고유 드롭다운(순위 기준·페이지당 개수 등). 정렬 select 뒤에 붙는다. */
  extra?: ReactNode;
  /** 우측 보조 문구(예: '키워드 순위 최근 업데이트: 3시간 전') */
  meta?: ReactNode;
  className?: string;
}) {
  const hasSecondRow = Boolean(status || search || sort || extra);

  return (
    <div className={`flex flex-col gap-3 ${className}`.trim()}>
      {(period || meta) && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {period ? <PeriodFilter {...period} /> : <span />}
          {meta && <span className="text-[11px] text-dim">{meta}</span>}
        </div>
      )}

      {hasSecondRow && (
        <div className="flex items-center gap-2 flex-wrap">
          {status && (
            <SegmentedFilter
              options={status.options}
              value={status.value}
              onChange={status.onChange}
              disabled={status.disabled}
            />
          )}
          {search && <SearchInput {...search} />}
          {sort && <SortSelect {...sort} />}
          {extra}
        </div>
      )}
    </div>
  );
}
