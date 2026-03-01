import { Recommendation } from '@/lib/types';

export const mockRecommendations: Recommendation[] = [
  { id: 'rec-01', keyword_id: 'kw-015', keyword: 'AI활용법', category: 'IT', search_volume_monthly: 41200, recommendation_score: 9.5, trend_direction: 'up', trend_percentage: 68.2, rank_in_day: 1, reason: '검색량 급등 + 참여자 극소 → 최고 블루오션', is_free: true },
  { id: 'rec-02', keyword_id: 'kw-002', keyword: '행복명언', category: '자기계발', search_volume_monthly: 33100, recommendation_score: 9.2, trend_direction: 'up', trend_percentage: 45.1, rank_in_day: 2, reason: '높은 검색량 대비 낮은 참여자 수', is_free: true },
  { id: 'rec-03', keyword_id: 'kw-007', keyword: '독서노트작성법', category: '도서', search_volume_monthly: 8900, recommendation_score: 9.0, trend_direction: 'up', trend_percentage: 52.3, rank_in_day: 3, reason: '신규 키워드 + 트렌드 급상승', is_free: true },
  { id: 'rec-04', keyword_id: 'kw-011', keyword: '반려견산책코스', category: '반려동물', search_volume_monthly: 6700, recommendation_score: 8.7, trend_direction: 'up', trend_percentage: 38.9, rank_in_day: 4, reason: '신규 등장 + 경쟁 거의 없음', is_free: false },
  { id: 'rec-05', keyword_id: 'kw-001', keyword: '미니멀라이프', category: '리빙', search_volume_monthly: 18200, recommendation_score: 8.5, trend_direction: 'up', trend_percentage: 23.4, rank_in_day: 5, reason: '꾸준한 상승 트렌드 + 적정 참여자', is_free: false },
  { id: 'rec-06', keyword_id: 'kw-013', keyword: '재테크초보', category: '재테크', search_volume_monthly: 15400, recommendation_score: 8.3, trend_direction: 'up', trend_percentage: 27.6, rank_in_day: 6, reason: '관심 증가세 + 낮은 경쟁도', is_free: false },
  { id: 'rec-07', keyword_id: 'kw-005', keyword: '클린뷰티추천', category: '뷰티', search_volume_monthly: 12800, recommendation_score: 8.1, trend_direction: 'up', trend_percentage: 31.5, rank_in_day: 7, reason: '신규 키워드 + 뷰티 카테고리 성장', is_free: false },
  { id: 'rec-08', keyword_id: 'kw-006', keyword: '육아템추천', category: '육아', search_volume_monthly: 22300, recommendation_score: 7.3, trend_direction: 'stable', trend_percentage: -2.1, rank_in_day: 8, reason: '안정적 검색량 + 중간 경쟁도', is_free: false },
];
