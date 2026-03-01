import { PointPackage, PricingItem } from '@/lib/types';

export const mockPackages: PointPackage[] = [
  { id: 'pkg-1', name: '체험', point_amount: 100, price_krw: 1000, bonus_points: 0, is_popular: false, unit_price: 10 },
  { id: 'pkg-2', name: '스타터', point_amount: 500, price_krw: 4500, bonus_points: 50, is_popular: false, unit_price: 8.2 },
  { id: 'pkg-3', name: '프로', point_amount: 1000, price_krw: 8000, bonus_points: 200, is_popular: true, unit_price: 6.7 },
  { id: 'pkg-4', name: '비즈니스', point_amount: 3000, price_krw: 20000, bonus_points: 1000, is_popular: false, unit_price: 5.0 },
];

export const mockPricing: PricingItem[] = [
  { action_type: 'keyword_list', point_cost: 0, description: '전체 키워드 리스트', is_free: true },
  { action_type: 'daily_recommendation_free', point_cost: 0, description: '일일 추천 키워드 3개', is_free: true },
  { action_type: 'daily_recommendation_full', point_cost: 50, description: '전체 추천 리스트 열람', is_free: false },
  { action_type: 'keyword_detail', point_cost: 30, description: '키워드 상세 (검색량+참여자+트렌드)', is_free: false },
  { action_type: 'ranking_view', point_cost: 50, description: '키워드별 순위 전체 열람', is_free: false },
  { action_type: 'search_volume_history', point_cost: 30, description: '검색량 히스토리 차트', is_free: false },
  { action_type: 'trend_analysis', point_cost: 50, description: '트렌드 분석 리포트', is_free: false },
];
