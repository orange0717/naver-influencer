interface RankChangeProps {
  change: number;
}

export default function RankChange({ change }: RankChangeProps) {
  if (change > 0) {
    return <span className="text-xs font-bold text-up font-rank">▲{change}</span>;
  }
  if (change < 0) {
    return <span className="text-xs font-bold text-down font-rank">▼{Math.abs(change)}</span>;
  }
  return <span className="text-xs text-dim">—</span>;
}
