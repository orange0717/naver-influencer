/**
 * 성장 분석 — 주간/월간 성과 비교 + 종합 점수 추이
 * page.tsx에서 서버사이드로 호출
 */

export interface GrowthSummary {
  period: '7d' | '30d';
  currentStats: PeriodStats;
  previousStats: PeriodStats;
  changes: {
    avgRankChange: number;       // 음수 = 개선
    top3CountChange: number;
    totalKeywordsChange: number;
    integratedCountChange: number;
    newTop3Keywords: string[];
    lostTop3Keywords: string[];
    biggestGain: { keyword: string; from: number; to: number } | null;
    biggestLoss: { keyword: string; from: number; to: number } | null;
  };
  overallTrend: 'improving' | 'declining' | 'stable';
}

interface PeriodStats {
  avgRank: number;
  top3Count: number;
  totalKeywords: number;
  integratedCount: number;
}

export interface DailyScorePoint {
  date: string;
  totalScore: number;
  dimensions: {
    expertise: number;
    exposure: number;
    growth: number;
    activity: number;
  };
}

interface RankingRecord {
  keyword_id: string;
  rank_position: number;
  rank_change: number;
  is_integrated_top3: boolean;
  snapshot_date: string;
  keyword_challenges: unknown;
}

function extractKeyword(kw: unknown): string {
  return ((kw as Record<string, unknown>)?.keyword as string) || '';
}

/**
 * 주간/월간 성과 비교
 */
export function computeGrowthSummary(
  latestRankings: RankingRecord[],
  period: '7d' | '30d',
): GrowthSummary {
  const days = period === '7d' ? 7 : 30;

  // 날짜별로 키워드 그룹핑
  const byDate = new Map<string, RankingRecord[]>();
  for (const r of latestRankings) {
    const arr = byDate.get(r.snapshot_date) || [];
    arr.push(r);
    byDate.set(r.snapshot_date, arr);
  }

  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  if (dates.length < 2) {
    return emptyGrowthSummary(period);
  }

  const latestDate = dates[0];

  // 기간 경계 날짜 찾기
  const cutoffDate = new Date(latestDate);
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  // 이전 기간에서 가장 가까운 날짜 찾기
  const previousDate = dates.find(d => d <= cutoffStr) || dates[dates.length - 1];

  // 최신 날짜 통계
  const currentRecords = byDate.get(latestDate) || [];
  const currentStats = computePeriodStats(currentRecords);

  // 이전 날짜 통계
  const previousRecords = byDate.get(previousDate) || [];
  const previousStats = computePeriodStats(previousRecords);

  // 키워드별 변동 분석
  const currentTop3 = new Set(currentRecords.filter(r => r.rank_position <= 3).map(r => r.keyword_id));
  const previousTop3 = new Set(previousRecords.filter(r => r.rank_position <= 3).map(r => r.keyword_id));

  const newTop3Keywords: string[] = [];
  const lostTop3Keywords: string[] = [];

  for (const kwId of currentTop3) {
    if (!previousTop3.has(kwId)) {
      const kw = currentRecords.find(r => r.keyword_id === kwId);
      if (kw) newTop3Keywords.push(extractKeyword(kw.keyword_challenges));
    }
  }
  for (const kwId of previousTop3) {
    if (!currentTop3.has(kwId)) {
      const kw = previousRecords.find(r => r.keyword_id === kwId);
      if (kw) lostTop3Keywords.push(extractKeyword(kw.keyword_challenges));
    }
  }

  // 최대 상승/하락 찾기
  const currentMap = new Map(currentRecords.map(r => [r.keyword_id, r]));
  const previousMap = new Map(previousRecords.map(r => [r.keyword_id, r]));
  let biggestGain: GrowthSummary['changes']['biggestGain'] = null;
  let biggestLoss: GrowthSummary['changes']['biggestLoss'] = null;
  let maxGain = 0;
  let maxLoss = 0;

  for (const [kwId, curr] of currentMap) {
    const prev = previousMap.get(kwId);
    if (!prev) continue;
    const diff = prev.rank_position - curr.rank_position; // 양수 = 상승
    if (diff > maxGain) {
      maxGain = diff;
      biggestGain = { keyword: extractKeyword(curr.keyword_challenges), from: prev.rank_position, to: curr.rank_position };
    }
    if (diff < maxLoss) {
      maxLoss = diff;
      biggestLoss = { keyword: extractKeyword(curr.keyword_challenges), from: prev.rank_position, to: curr.rank_position };
    }
  }

  const avgRankChange = currentStats.avgRank - previousStats.avgRank;
  const top3Change = currentStats.top3Count - previousStats.top3Count;

  let overallTrend: GrowthSummary['overallTrend'] = 'stable';
  if (avgRankChange < -0.5 || top3Change > 0) overallTrend = 'improving';
  else if (avgRankChange > 0.5 || top3Change < 0) overallTrend = 'declining';

  return {
    period,
    currentStats,
    previousStats,
    changes: {
      avgRankChange: Math.round(avgRankChange * 10) / 10,
      top3CountChange: top3Change,
      totalKeywordsChange: currentStats.totalKeywords - previousStats.totalKeywords,
      integratedCountChange: currentStats.integratedCount - previousStats.integratedCount,
      newTop3Keywords,
      lostTop3Keywords,
      biggestGain,
      biggestLoss,
    },
    overallTrend,
  };
}

function computePeriodStats(records: RankingRecord[]): PeriodStats {
  if (records.length === 0) {
    return { avgRank: 0, top3Count: 0, totalKeywords: 0, integratedCount: 0 };
  }
  // 키워드 중복 제거 (같은 날짜에 같은 키워드가 여러 번 올 수 있음)
  const deduped = new Map<string, RankingRecord>();
  for (const r of records) {
    if (!deduped.has(r.keyword_id)) deduped.set(r.keyword_id, r);
  }
  const unique = Array.from(deduped.values());

  const avgRank = unique.reduce((s, r) => s + r.rank_position, 0) / unique.length;
  return {
    avgRank: Math.round(avgRank * 10) / 10,
    top3Count: unique.filter(r => r.rank_position <= 3).length,
    totalKeywords: unique.length,
    integratedCount: unique.filter(r => r.is_integrated_top3).length,
  };
}

function emptyGrowthSummary(period: '7d' | '30d'): GrowthSummary {
  const empty: PeriodStats = { avgRank: 0, top3Count: 0, totalKeywords: 0, integratedCount: 0 };
  return {
    period,
    currentStats: empty,
    previousStats: empty,
    changes: {
      avgRankChange: 0,
      top3CountChange: 0,
      totalKeywordsChange: 0,
      integratedCountChange: 0,
      newTop3Keywords: [],
      lostTop3Keywords: [],
      biggestGain: null,
      biggestLoss: null,
    },
    overallTrend: 'stable',
  };
}

/**
 * 날짜별 점수 추이 (최근 N일)
 * InfluencerScoreSection의 점수 로직을 간소화하여 날짜별로 적용
 */
export function computeScoreTrend(
  latestRankings: RankingRecord[],
  subscriberCount: number,
): DailyScorePoint[] {
  // 날짜별 그룹핑
  const byDate = new Map<string, RankingRecord[]>();
  for (const r of latestRankings) {
    const arr = byDate.get(r.snapshot_date) || [];
    arr.push(r);
    byDate.set(r.snapshot_date, arr);
  }

  const dates = Array.from(byDate.keys()).sort();
  const points: DailyScorePoint[] = [];

  for (const date of dates) {
    const records = byDate.get(date)!;
    // 키워드 중복 제거
    const deduped = new Map<string, RankingRecord>();
    for (const r of records) {
      if (!deduped.has(r.keyword_id)) deduped.set(r.keyword_id, r);
    }
    const unique = Array.from(deduped.values());
    if (unique.length === 0) continue;

    const totalKw = unique.length;
    const top3 = unique.filter(r => r.rank_position <= 3).length;
    const top10 = unique.filter(r => r.rank_position <= 10).length;
    const avgRank = unique.reduce((s, r) => s + r.rank_position, 0) / totalKw;
    const intTop3 = unique.filter(r => r.is_integrated_top3).length;
    const rankUp = unique.filter(r => r.rank_change > 0).length;
    const rankDown = unique.filter(r => r.rank_change < 0).length;

    // 전문성 (키워드 수 + TOP3 비율 + 통합검색)
    const expertiseScore = Math.min(100, Math.round(
      (totalKw >= 50 ? 40 : totalKw >= 30 ? 32 : totalKw >= 15 ? 24 : totalKw >= 5 ? 16 : totalKw >= 1 ? 8 : 0) +
      Math.min(35, Math.round((top3 / Math.max(totalKw, 1)) * 35)) +
      (intTop3 >= 5 ? 25 : intTop3 >= 3 ? 20 : intTop3 >= 1 ? 12 : 0)
    ));

    // 노출도 (평균 순위 + TOP10 비율)
    const exposureScore = Math.min(100, Math.round(
      50 + // 노출 비율 (이미 순위에 있으면 100%)
      (avgRank <= 3 ? 30 : avgRank <= 5 ? 24 : avgRank <= 10 ? 18 : avgRank <= 15 ? 12 : avgRank <= 20 ? 6 : 3) +
      Math.min(20, Math.round((top10 / Math.max(totalKw, 1)) * 20))
    ));

    // 성장성 (상승 키워드 수 + 하락 패널티)
    const growthScore = Math.min(100, Math.round(
      (rankUp >= 10 ? 40 : rankUp >= 5 ? 30 : rankUp >= 3 ? 22 : rankUp >= 1 ? 12 : 0) +
      (totalKw > 0 ? Math.min(30, Math.round((rankUp / totalKw) * 30)) : 0) +
      (rankDown === 0 ? 30 : rankDown <= 2 ? 20 : rankDown <= 5 ? 10 : 0)
    ));

    // 활동성 (참여 키워드 + 변동 수)
    const activityScore = Math.min(100, Math.round(
      (totalKw >= 30 ? 40 : totalKw >= 20 ? 32 : totalKw >= 10 ? 24 : totalKw >= 5 ? 16 : totalKw >= 1 ? 8 : 0) +
      (totalKw >= 20 ? 30 : totalKw >= 10 ? 24 : totalKw >= 5 ? 16 : totalKw >= 1 ? 8 : 0) +
      ((rankUp + rankDown) >= 10 ? 30 : (rankUp + rankDown) >= 5 ? 22 : (rankUp + rankDown) >= 2 ? 14 : (rankUp + rankDown) >= 1 ? 8 : 0)
    ));

    // 팬 점수는 고정값 (변동 없으므로)
    const fanScore = subscriberCount >= 50000 ? 50 : subscriberCount >= 10000 ? 40 :
      subscriberCount >= 5000 ? 30 : subscriberCount >= 1000 ? 20 :
      subscriberCount >= 100 ? 10 : 5;

    const totalScore = Math.round((fanScore + expertiseScore + exposureScore + growthScore + activityScore) / 5);

    points.push({
      date,
      totalScore,
      dimensions: {
        expertise: expertiseScore,
        exposure: exposureScore,
        growth: growthScore,
        activity: activityScore,
      },
    });
  }

  return points;
}
