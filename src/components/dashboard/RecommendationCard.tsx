'use client';

import Link from 'next/link';

interface RecommendationCardProps {
  keyword: string;
  keyword_id: string;
  category: string;
  participant_count: number;
  search_volume_monthly?: number;
  competition_level?: string;
  recommendation_score?: number;
  reason: string;
  rank_in_day: number;
}

function formatVolume(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString();
}

const competitionMap: Record<string, { label: string; color: string; bg: string; width: string }> = {
  low: { label: '낮음', color: 'text-up', bg: 'bg-up', width: 'w-1/4' },
  medium: { label: '중간', color: 'text-amber-600', bg: 'bg-amber-500', width: 'w-2/4' },
  high: { label: '높음', color: 'text-down', bg: 'bg-down', width: 'w-3/4' },
};

export default function RecommendationCard({
  keyword,
  keyword_id,
  category,
  participant_count,
  search_volume_monthly = 0,
  competition_level = 'low',
  reason,
  rank_in_day,
}: RecommendationCardProps) {
  const comp = competitionMap[competition_level] || competitionMap.low;

  return (
    <Link
      href={`/keywords/${keyword_id}`}
      className="group block bg-surface rounded-2xl border border-border p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(204,148,134,0.12)] hover:border-accent/30 hover:-translate-y-0.5 transition-all duration-300"
    >
      {/* 상단: 순위 뱃지 + 카테고리 */}
      <div className="flex items-center justify-between mb-3">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
          rank_in_day === 1 ? 'bg-gold/20 text-gold' : rank_in_day <= 3 ? 'bg-accent/15 text-accent' : 'bg-border/50 text-dim'
        }`}>
          {rank_in_day}
        </div>
        <span className="text-[10px] text-dim bg-bg px-2 py-0.5 rounded-full">{category}</span>
      </div>

      {/* 키워드명 */}
      <h4 className="font-bold text-[15px] mb-3 group-hover:text-accent transition-colors truncate">{keyword}</h4>

      {/* 메트릭 */}
      <div className="space-y-2.5">
        {/* 검색량 */}
        {search_volume_monthly > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-dim">검색량</span>
              <span className="font-semibold font-rank">월 {formatVolume(search_volume_monthly)}회</span>
            </div>
            <div className="w-full h-1.5 bg-border/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent/60 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(search_volume_monthly / 50000 * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* 경쟁도 */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-dim">경쟁도</span>
          <div className="flex items-center gap-1.5">
            <div className="w-12 h-1.5 bg-border/30 rounded-full overflow-hidden">
              <div className={`h-full ${comp.bg} rounded-full ${comp.width}`} />
            </div>
            <span className={`font-semibold ${comp.color}`}>{comp.label}</span>
          </div>
        </div>

        {/* 참여자 */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-dim">참여자</span>
          <span className="font-semibold font-rank">{participant_count}명</span>
        </div>
      </div>

      {/* 추천 이유 */}
      <div className="mt-3 pt-3 border-t border-border/50">
        <span className="text-[10px] text-accent bg-accent/8 px-2.5 py-1 rounded-lg inline-block">
          {reason}
        </span>
      </div>
    </Link>
  );
}
