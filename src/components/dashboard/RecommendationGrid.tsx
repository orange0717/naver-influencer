'use client';

import RecommendationCard from './RecommendationCard';

interface Recommendation {
  keyword_id: string;
  keyword: string;
  category: string;
  participant_count: number;
  search_volume_monthly?: number;
  competition_level?: string;
  recommendation_score?: number;
  trend_direction?: string;
  trend_percentage?: number;
  reason: string;
  rank_in_day?: number;
}

interface RecommendationGridProps {
  recommendations: Recommendation[];
  compact?: boolean;
}

export default function RecommendationGrid({ recommendations, compact = false }: RecommendationGridProps) {
  const items = compact ? recommendations.slice(0, 3) : recommendations;

  if (items.length === 0) {
    return (
      <div className="bg-surface rounded-2xl border border-border p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-bold text-[15px]">실시간 추천 키워드</h3>
          <span className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full font-bold">
            LIVE
          </span>
        </div>
        <div className="text-center py-8 text-dim text-sm">
          <p>추천 키워드를 준비 중입니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl border border-border p-5 shadow-xs">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="font-bold text-[15px]">실시간 추천 키워드</h3>
        <span className="flex items-center gap-1 text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-soft-pulse" />
          LIVE
        </span>
        <span className="text-[11px] text-dim ml-auto">{recommendations.length}개</span>
      </div>

      {/* 데스크톱: 그리드 / 모바일: 가로 스크롤 */}
      <div className="hidden md:grid md:grid-cols-3 gap-3">
        {items.map((rec, i) => (
          <div key={rec.keyword_id} className={`animate-fade-in-up stagger-${i + 1}`}>
            <RecommendationCard
              {...rec}
              rank_in_day={rec.rank_in_day || i + 1}
            />
          </div>
        ))}
      </div>

      {/* 모바일: 가로 스크롤 */}
      <div className="md:hidden flex gap-3 overflow-x-auto snap-x-mandatory pb-2 -mx-1 px-1">
        {items.map((rec, i) => (
          <div key={rec.keyword_id} className="min-w-[260px] shrink-0">
            <RecommendationCard
              {...rec}
              rank_in_day={rec.rank_in_day || i + 1}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
