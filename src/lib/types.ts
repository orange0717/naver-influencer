export interface Keyword {
  id: string;
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

export interface Ranking {
  id: string;
  keyword_id: string;
  influencer_name: string;
  influencer_url: string;
  influencer_category: string;
  rank_position: number;
  previous_rank: number | null;
  rank_change: number;
  post_count: number;
  snapshot_date: string;
}

export interface Recommendation {
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

export interface PointPackage {
  id: string;
  name: string;
  point_amount: number;
  price_krw: number;
  bonus_points: number;
  is_popular: boolean;
  unit_price: number;
}

export interface PricingItem {
  action_type: string;
  point_cost: number;
  description: string;
  is_free: boolean;
}

export interface TrendData {
  week: string;
  volume: number;
}

export interface Influencer {
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
}

export interface MyKeywordRanking {
  keyword_id: string;
  keyword: string;
  category: string;
  rank_position: number;
  previous_rank: number | null;
  rank_change: number;
  participant_count: number;
  search_volume_monthly: number;
  is_integrated_top3: boolean;
}
