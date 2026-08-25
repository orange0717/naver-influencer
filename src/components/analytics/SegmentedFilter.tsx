'use client';

// 세그먼트 pill 필터 그룹 — 노출 현황의 기간/상태 필터와 동일한 스타일.
// (tone='accent' → active = bg-accent text-white / tone='neutral' → active = bg-text text-white)
import { segmentGroupClass, segmentButtonClass, segmentGroupLgClass, segmentButtonLgClass } from './controls';
// 선택지 타입은 analytics/types 하나만 쓴다 — 여기에 같은 내용을 또 선언해 두면
// 구조적 타이핑 탓에 두 벌이 섞여 써도 컴파일이 통과해서, 한쪽만 고친 게 드러나지 않는다.
import type { SegmentOption } from './types';

/** active 칩 색. 한 화면에 강조색이 여러 군데면 accent 가 신호 역할을 잃으므로,
 *  "무엇이 켜져 있나"만 알리는 보조 필터는 neutral 을 쓴다. */
const activeToneClass = {
  accent: 'bg-accent text-white',
  neutral: 'bg-text text-white',
} as const;

export default function SegmentedFilter<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  size = 'sm',
  tone = 'accent',
  fullWidth,
  className = '',
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  /** 'sm' = 필터 줄(32px) · 'lg' = 페이지 주 내비게이션 탭(48px) */
  size?: 'sm' | 'lg';
  /** 선택 칩 색 — 화면의 주 강조는 accent, 보조 필터는 neutral */
  tone?: 'accent' | 'neutral';
  fullWidth?: boolean;
  className?: string;
}) {
  const group = size === 'lg' ? segmentGroupLgClass : segmentGroupClass;
  const button = size === 'lg' ? segmentButtonLgClass : segmentButtonClass;
  return (
    <div className={`${group} ${fullWidth ? 'w-full' : 'w-fit'} ${className}`}>
      {options.map(o => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          disabled={disabled}
          className={`${button} ${fullWidth ? 'flex-1' : ''} disabled:opacity-50 disabled:cursor-not-allowed ${
            value === o.value ? activeToneClass[tone] : 'text-dim hover:bg-surface-hover'
          }`}
        >
          {o.locked && <span className="mr-0.5">🔒</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}
