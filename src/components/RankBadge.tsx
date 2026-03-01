interface RankBadgeProps {
  rank: number;
  size?: 'sm' | 'md';
}

export default function RankBadge({ rank, size = 'md' }: RankBadgeProps) {
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';

  if (rank === 1) {
    return (
      <span className={`inline-flex items-center justify-center ${sizeClass} rounded-full font-bold font-rank bg-gold/20 text-gold border border-gold/30`}>
        {rank}
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className={`inline-flex items-center justify-center ${sizeClass} rounded-full font-bold font-rank bg-silver/20 text-silver border border-silver/30`}>
        {rank}
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className={`inline-flex items-center justify-center ${sizeClass} rounded-full font-bold font-rank bg-bronze/20 text-bronze border border-bronze/30`}>
        {rank}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center justify-center ${sizeClass} rounded-full font-bold font-rank bg-surface text-dim border border-border`}>
      {rank}
    </span>
  );
}
