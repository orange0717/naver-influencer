/**
 * 순위 알림 분석 — 하락 위험, TOP3 기회, 이탈 위험 감지
 * page.tsx에서 서버사이드로 호출
 */

export interface RankAlert {
  keyword_id: string;
  keyword: string;
  category: string;
  alertType: 'drop_risk' | 'top3_opportunity' | 'losing_top3' | 'momentum_up';
  currentRank: number;
  previousRank: number;
  trendDays: number;
  participant_count: number;
  search_volume: number;
  actionMessage: string;
  urgency: 'high' | 'medium' | 'low';
}

interface RankingRecord {
  keyword_id: string;
  rank_position: number;
  rank_change: number;
  is_integrated_top3: boolean;
  snapshot_date: string;
  keyword_challenges: unknown;
}

function extractKeywordInfo(kw: unknown): { keyword: string; category: string; participant_count: number; search_volume: number } {
  const obj = kw as Record<string, unknown> | null;
  return {
    keyword: (obj?.keyword as string) || '',
    category: (obj?.category as string) || '',
    participant_count: (obj?.participant_count as number) || 0,
    search_volume: (obj?.search_volume_monthly as number) || 0,
  };
}

export function analyzeRankAlerts(latestRankings: RankingRecord[]): RankAlert[] {
  // 키워드별로 날짜순 히스토리 구성
  const historyMap = new Map<string, { rank: number; date: string }[]>();
  const kwInfoMap = new Map<string, ReturnType<typeof extractKeywordInfo>>();

  for (const r of latestRankings) {
    const arr = historyMap.get(r.keyword_id) || [];
    arr.push({ rank: r.rank_position, date: r.snapshot_date });
    historyMap.set(r.keyword_id, arr);

    if (!kwInfoMap.has(r.keyword_id)) {
      kwInfoMap.set(r.keyword_id, extractKeywordInfo(r.keyword_challenges));
    }
  }

  const alerts: RankAlert[] = [];

  for (const [keywordId, history] of historyMap) {
    // 날짜 내림차순 정렬 (최신이 앞)
    history.sort((a, b) => b.date.localeCompare(a.date));
    if (history.length < 2) continue;

    const info = kwInfoMap.get(keywordId)!;
    const currentRank = history[0].rank;
    const previousRank = history[1].rank;

    // 연속 하락/상승 일수 계산
    let consecutiveDown = 0;
    let consecutiveUp = 0;
    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].rank > history[i + 1].rank) {
        if (consecutiveUp > 0) break;
        consecutiveDown++;
      } else if (history[i].rank < history[i + 1].rank) {
        if (consecutiveDown > 0) break;
        consecutiveUp++;
      } else {
        break;
      }
    }

    // TOP3 이탈 위험: 현재 1~3위인데 연속 하락 중
    if (currentRank <= 3 && consecutiveDown >= 2) {
      alerts.push({
        keyword_id: keywordId,
        keyword: info.keyword,
        category: info.category,
        alertType: 'losing_top3',
        currentRank,
        previousRank,
        trendDays: consecutiveDown,
        participant_count: info.participant_count,
        search_volume: info.search_volume,
        actionMessage: 'TOP 3 이탈 위험 - 콘텐츠 보강 필요',
        urgency: 'high',
      });
      continue;
    }

    // 하락 위험: 2일 이상 연속 하락
    if (consecutiveDown >= 2 && currentRank > 3) {
      const urgency = currentRank <= 10 ? 'medium' as const : 'low' as const;
      alerts.push({
        keyword_id: keywordId,
        keyword: info.keyword,
        category: info.category,
        alertType: 'drop_risk',
        currentRank,
        previousRank,
        trendDays: consecutiveDown,
        participant_count: info.participant_count,
        search_volume: info.search_volume,
        actionMessage: `${consecutiveDown}일 연속 하락 중 - 최신 콘텐츠 갱신 필요`,
        urgency,
      });
      continue;
    }

    // TOP3 기회: 현재 4~6위이면서 상승 추세
    if (currentRank >= 4 && currentRank <= 6 && consecutiveUp >= 1) {
      alerts.push({
        keyword_id: keywordId,
        keyword: info.keyword,
        category: info.category,
        alertType: 'top3_opportunity',
        currentRank,
        previousRank,
        trendDays: consecutiveUp,
        participant_count: info.participant_count,
        search_volume: info.search_volume,
        actionMessage: `${currentRank}위 — 한 단계만 더 올리면 TOP 3`,
        urgency: currentRank === 4 ? 'high' : 'medium',
      });
      continue;
    }

    // 상승 모멘텀: 3일 이상 연속 상승 (4~6위가 아닌 키워드)
    if (consecutiveUp >= 3 && currentRank > 6) {
      alerts.push({
        keyword_id: keywordId,
        keyword: info.keyword,
        category: info.category,
        alertType: 'momentum_up',
        currentRank,
        previousRank,
        trendDays: consecutiveUp,
        participant_count: info.participant_count,
        search_volume: info.search_volume,
        actionMessage: `${consecutiveUp}일 연속 상승 중 - 지금 집중하면 효과적`,
        urgency: 'low',
      });
    }
  }

  // 긴급도 + 검색량 기준 정렬
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => {
    const urgDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgDiff !== 0) return urgDiff;
    return (b.search_volume || 0) - (a.search_volume || 0);
  });
}
