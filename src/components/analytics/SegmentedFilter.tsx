'use client';

// 세그먼트 pill 필터 그룹 — 노출 현황의 기간/상태 필터와 동일한 스타일.
// (active = bg-accent text-white / inactive = text-dim hover:bg-surface-hover)
export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  locked?: boolean; // 🔒 표시(회원 전용 등)
}

export default function SegmentedFilter<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  className = '',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex rounded-lg border border-border overflow-hidden text-[11px] w-fit ${className}`}>
      {options.map(o => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={`px-3 py-1.5 font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            value === o.value ? 'bg-accent text-white' : 'text-dim hover:bg-surface-hover'
          }`}
        >
          {o.locked && <span className="mr-0.5">🔒</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}
