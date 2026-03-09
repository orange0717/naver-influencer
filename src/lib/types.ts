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

export type SubscriptionStatus = 'active' | 'expired' | 'none';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price_krw: number;
  period_days: number;
  description: string;
  features: string[];
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_name: string;
  status: SubscriptionStatus;
  price_krw: number;
  started_at: string;
  expires_at: string;
  payment_key?: string;
  auto_renew: boolean;
}

/** @deprecated 포인트제 → 구독제 전환됨 */
export interface PointPackage {
  id: string;
  name: string;
  point_amount: number;
  price_krw: number;
  bonus_points: number;
  is_popular: boolean;
  unit_price: number;
}

/** @deprecated 포인트제 → 구독제 전환됨 */
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

// ─── 크롤러 타입 ───

/** GraphQL에서 받아오는 키워드 원본 데이터 */
export interface NaverKeywordRaw {
  name: string;
  id: number;
  categoryId: number;
  participantCount: number;
  thumbnailUrl?: string;
}

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

/** 네이버 검색광고 API 키워드 볼륨 */
export interface KeywordVolume {
  keyword: string;
  monthlyPcQcCnt: number;
  monthlyMobileQcCnt: number;
  compIdx: string; // '높음' | '중간' | '낮음'
}
