'use client';

import DashboardCard from './DashboardCard';

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

const BAR_COLOR = '#D9B7B0';

function getBarOpacity(rate: number): number {
  if (rate >= 80) return 1;
  if (rate >= 50) return 0.8;
  if (rate >= 30) return 0.6;
  return 0.4;
}

export default function CategoryStrengthSection({ categoryStats }: Props) {
  if (!categoryStats || categoryStats.length === 0) return null;

  return (
    <DashboardCard title="주제별 강점 분석">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 auto-rows-fr">
        {categoryStats.map((cat) => (
          <div
            key={cat.category}
            className="h-[124px] flex flex-col justify-between border border-border rounded-xl p-4 hover:bg-surface-hover transition"
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
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${cat.top10Rate}%`,
                      backgroundColor: BAR_COLOR,
                      opacity: getBarOpacity(cat.top10Rate),
                    }}
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
    </DashboardCard>
  );
}
