'use client';

interface CategoryStat {
  category: string;
  totalKeywords: number;
  top10Count: number;
  top10Rate: number;
  avgRank: number;
}

interface Props {
  categoryStats: CategoryStat[];
}

function getRankColor(avgRank: number): string {
  if (avgRank <= 10) return 'text-accent';
  return 'text-dim';
}

function getBarColor(rate: number): string {
  if (rate >= 80) return 'bg-pink-500';
  if (rate >= 50) return 'bg-pink-400';
  if (rate >= 30) return 'bg-pink-300';
  return 'bg-pink-200';
}

export default function CategoryStrengthSection({ categoryStats }: Props) {
  if (!categoryStats || categoryStats.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-border p-5">
      <h3 className="text-sm font-extrabold text-text mb-4">주제별 강점 분석</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {categoryStats.map((cat) => (
          <div
            key={cat.category}
            className="border border-border rounded-xl p-4 hover:bg-surface-hover transition"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-text truncate">{cat.category}</span>
              <span className="text-xs text-dim whitespace-nowrap ml-2">{cat.totalKeywords}개 참여</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-dim">TOP 10 비율</span>
                  <span className="text-[11px] font-bold text-text">{cat.top10Rate}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${getBarColor(cat.top10Rate)}`}
                    style={{ width: `${cat.top10Rate}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-dim">
                TOP 10: <span className="font-bold text-text">{cat.top10Count}</span>/{cat.totalKeywords}
              </span>
              <span className="text-dim">
                평균 순위: <span className={`font-bold ${getRankColor(cat.avgRank)}`}>{cat.avgRank}위</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
