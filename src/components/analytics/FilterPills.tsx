'use client';

// 개수가 가변이라 줄바꿈되는 필터 행(분야·카테고리 등) 전용 pill 그룹.
// 개수가 고정된 2~6개 배타 선택은 SegmentedFilter(붙은 32px 그룹)를 쓴다.
import { CONTROL_HEIGHT } from './controls';

export interface PillOption<T extends string | number> {
  value: T;
  label: string;
}

export default function FilterPills<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  className = '',
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {options.map(o => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={`${CONTROL_HEIGHT} px-3 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/40 ${
            value === o.value
              ? 'bg-accent text-white border-accent'
              : 'bg-surface border-border text-dim hover:border-accent/40 hover:text-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
