/** influencer_composite_rank_snapshots 1개 행 — "인플루언서 순위"(N인플 자체 산정) 스냅샷 */
export interface CompositeRankSnapshot {
  rank: number;
  composite_score: number;
  member_pool_size: number;
  top3_count: number;
  avg_integrated_rank: number | null;
  avg_blog_rank: number | null;
  ai_briefing_count: number;
  ai_tab_count: number;
  posting_count: number;
  missing_rate: number;
  snapshot_date: string;
}

export interface Keyword {
  id: string;
  db_id?: string | null;
  keyword: string;
  category: string;
  participant_count: number;
  content_count: number;
  search_volume_monthly: number;
  search_volume_pc: number;
  search_volume_mobile: number;
  competition_level: 'low' | 'medium' | 'high';
  recommendation_score: number;
  trend_direction: 'up' | 'down' | 'stable';
  trend_percentage: number;
  is_new: boolean;
  first_seen_at: string;
}

interface Recommendation {
  id: string;
  keyword_id: string;
  keyword: string;
  category: string;
  search_volume_monthly: number;
  recommendation_score: number;
  trend_direction: 'up' | 'down' | 'stable';
  trend_percentage: number;
  rank_in_day: number;
  reason: string;
  is_free: boolean;
}

interface Influencer {
  id: string;
  naver_id: string;
  display_name: string;
  profile_url: string;
  category: string;
  sub_category: string;
  fan_count: number;
  blog_neighbor_count: number;
  stats_summary: string;
  total_keywords: number;
  avg_rank: number;
  best_rank: number;
  integrated_top3_count: number;
  keyword_score?: number;
}

// ─── 크롤러 타입 ───

/** HTML 파싱으로 추출한 순위 데이터 */
export interface ParsedRanking {
  rank: number;
  influencerName: string;
  influencerUrl: string;
  naverId: string;
  category?: string;
  fanCount?: number;
  latestPostTitle?: string;
  latestPostUrl?: string;
}

/** 경쟁자 키워드 변동 이벤트 */
export interface CompetitorChangeEvent {
  keyword: string;
  keyword_id: string;
  changeType: 'entered' | 'exited' | 'overtook_me' | 'i_overtook';
  competitorRank: number | null;
  myRank: number | null;
  date: string;
}
