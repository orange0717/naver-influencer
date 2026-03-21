import Link from 'next/link';
import GlassCard from './GlassCard';
import { formatCount } from '@/lib/format';

interface RankingItem {
  keyword_id: string;
  keyword: string;
  category: string;
  rank_position: number;
  rank_change: number;
  is_integrated_top3: boolean;
  participant_count: number;
  search_volume: number;
}

interface Top5KeywordsProps {
  rankings: RankingItem[];
  totalRankedKeywords: number;
}

export default function Top5Keywords({ rankings, totalRankedKeywords }: Top5KeywordsProps) {
  const top5 = rankings.slice(0, 5);

  return (
    <GlassCard padding="none">
      <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
        <h3 className="font-bold text-[15px]">TOP 5 키워드</h3>
        {top5.length > 0 && (
          <span className="text-[11px] text-dim">{totalRankedKeywords}개 중</span>
        )}
      </div>
      {top5.length > 0 ? (
        <div className="divide-y divide-border/20">
          {top5.map((r, i) => (
            <Link key={r.keyword_id} href={`/keywords/${r.keyword_id}`}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition group">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                  i === 0 ? 'bg-gold/20 text-gold' : i <= 2 ? 'bg-accent/15 text-accent' : 'bg-border/50 text-dim'
                }`}>{i + 1}</span>
                <div className="min-w-0">
                  <span className="font-semibold text-sm truncate block group-hover:text-accent transition-colors">{r.keyword}</span>
                  <span className="text-xs text-dim">{r.category} · {r.participant_count}명 참여{r.search_volume > 0 ? ` · 월 ${formatCount(r.search_volume)}회` : ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {r.rank_change !== 0 && (
                  <span className={`text-xs font-bold ${r.rank_change > 0 ? 'text-up' : 'text-down'}`}>
                    {r.rank_change > 0 ? '▲' : '▼'}{Math.abs(r.rank_change)}
                  </span>
                )}
                <span className={`text-sm font-black font-rank ${r.rank_position <= 3 ? 'text-accent' : ''}`}>
                  {r.rank_position}위
                </span>
                {r.is_integrated_top3 && <span className="text-xs font-bold text-gold">T3</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-dim text-sm">
          <p>아직 순위 데이터가 없습니다.</p>
          <p className="text-xs mt-1">데이터 수집이 매일 자동으로 진행됩니다.</p>
        </div>
      )}
    </GlassCard>
  );
}
