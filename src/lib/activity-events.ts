export interface ActivityEvent {
  id: string;
  type: 'rank_up' | 'rank_down' | 'new_top3' | 'new_keyword' | 'milestone';
  keyword?: string;
  keyword_id?: string;
  from_rank?: number;
  to_rank?: number;
  change?: number;
  message: string;
  timestamp: string;
}

interface RankingInput {
  keyword_id: string;
  keyword: string;
  rank_position: number;
  rank_change: number;
  is_integrated_top3?: boolean;
  participant_count?: number;
}

export function generateActivityEvents(rankings: RankingInput[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  const now = new Date().toISOString();

  for (const r of rankings) {
    if (r.rank_change > 0) {
      const fromRank = r.rank_position + r.rank_change;
      if (r.rank_position <= 3 && fromRank > 3) {
        events.push({
          id: `top3-${r.keyword_id}`,
          type: 'new_top3',
          keyword: r.keyword,
          keyword_id: r.keyword_id,
          from_rank: fromRank,
          to_rank: r.rank_position,
          change: r.rank_change,
          message: `${r.keyword} 키워드가 TOP 3에 진입했습니다! (${fromRank}위 → ${r.rank_position}위)`,
          timestamp: now,
        });
      } else {
        events.push({
          id: `up-${r.keyword_id}`,
          type: 'rank_up',
          keyword: r.keyword,
          keyword_id: r.keyword_id,
          from_rank: fromRank,
          to_rank: r.rank_position,
          change: r.rank_change,
          message: `${r.keyword} 순위가 ${r.rank_change}단계 상승 (${fromRank}위 → ${r.rank_position}위)`,
          timestamp: now,
        });
      }
    } else if (r.rank_change < 0) {
      const fromRank = r.rank_position + r.rank_change;
      events.push({
        id: `down-${r.keyword_id}`,
        type: 'rank_down',
        keyword: r.keyword,
        keyword_id: r.keyword_id,
        from_rank: fromRank,
        to_rank: r.rank_position,
        change: r.rank_change,
        message: `${r.keyword} 순위가 ${Math.abs(r.rank_change)}단계 하락 (${fromRank}위 → ${r.rank_position}위)`,
        timestamp: now,
      });
    }
  }

  // 변동 크기 순으로 정렬 (TOP3 진입이 가장 위)
  return events.sort((a, b) => {
    if (a.type === 'new_top3' && b.type !== 'new_top3') return -1;
    if (a.type !== 'new_top3' && b.type === 'new_top3') return 1;
    return Math.abs(b.change || 0) - Math.abs(a.change || 0);
  });
}
