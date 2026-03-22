import Link from 'next/link';
import GlassCard from './GlassCard';
import { formatCount } from '@/lib/format';

interface RecommendedKeyword {
  keyword_id: string;
  keyword: string;
  category: string;
  participant_count: number;
  search_volume: number;
  score: number;
}

interface Top5KeywordsProps {
  recommendations: RecommendedKeyword[];
  totalNotParticipated: number;
}

export default function Top5Keywords({ recommendations, totalNotParticipated }: Top5KeywordsProps) {
  const top5 = recommendations.slice(0, 5);

  return (
    <GlassCard padding="none">
      <div className="px-5 py-4 border-b border-border bg-bg/30 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[15px]">오늘의 추천키워드</h3>
          <p className="text-[10px] text-dim mt-0.5">미참여 키워드 중 경쟁도 낮고 검색량 높은 키워드</p>
        </div>
        {top5.length > 0 && (
          <span className="text-[11px] text-dim">{totalNotParticipated}개 중</span>
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
                  <span className="text-xs text-dim">{r.category} · {r.participant_count}명 참여</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.search_volume > 0 && (
                  <span className="text-[10px] text-dim bg-border/30 px-1.5 py-0.5 rounded">월 {formatCount(r.search_volume)}</span>
                )}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  r.participant_count <= 30 ? 'bg-emerald-500/15 text-emerald-600' :
                  r.participant_count <= 100 ? 'bg-amber-500/15 text-amber-600' :
                  'bg-rose-500/15 text-rose-600'
                }`}>
                  {r.participant_count <= 30 ? '낮음' : r.participant_count <= 100 ? '보통' : '높음'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-10 text-dim text-sm">
          <p>추천할 미참여 키워드가 없습니다.</p>
          <p className="text-xs mt-1">모든 키워드에 참여하고 있습니다.</p>
        </div>
      )}
    </GlassCard>
  );
}
