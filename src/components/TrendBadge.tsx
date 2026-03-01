interface TrendBadgeProps {
  direction: 'up' | 'down' | 'stable';
  percentage: number;
}

export default function TrendBadge({ direction, percentage }: TrendBadgeProps) {
  if (direction === 'up') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-up bg-up/12 px-2 py-0.5 rounded-full">
        ▲ {Math.abs(percentage).toFixed(1)}%
      </span>
    );
  }
  if (direction === 'down') {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-down bg-down/12 px-2 py-0.5 rounded-full">
        ▼ {Math.abs(percentage).toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-dim bg-dim/12 px-2 py-0.5 rounded-full">
      — {Math.abs(percentage).toFixed(1)}%
    </span>
  );
}
