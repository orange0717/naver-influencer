import type { Influencer } from '@/lib/types';

export const mockInfluencers: Influencer[] = [
  {
    id: 'inf-001', naver_id: 'minimaljipsooni', display_name: '미니멀집순이',
    profile_url: 'https://in.naver.com/minimaljipsooni',
    category: '리빙', sub_category: '리빙 전문블로거 · 인테리어 전문',
    fan_count: 8200, blog_neighbor_count: 15400,
    stats_summary: '미니멀 인테리어 300건 리뷰', total_keywords: 28,
    avg_rank: 2.1, best_rank: 1, integrated_top3_count: 12,
  },
  {
    id: 'inf-002', naver_id: 'yeormi_book', display_name: '여르미',
    profile_url: 'https://in.naver.com/yeormi_book',
    category: '도서', sub_category: '작가 · 인문 도서 전문',
    fan_count: 14000, blog_neighbor_count: 33000,
    stats_summary: '에세이스트, 인문학 리뷰 500+',total_keywords: 42,
    avg_rank: 3.2, best_rank: 1, integrated_top3_count: 8,
  },
  {
    id: 'inf-003', naver_id: 'orangelibrary', display_name: '오렌지도서관',
    profile_url: 'https://in.naver.com/orangelibrary',
    category: '도서', sub_category: '도서 전문블로거 · 소설 전문',
    fan_count: 209, blog_neighbor_count: 4200,
    stats_summary: '500권 이상 리뷰', total_keywords: 42,
    avg_rank: 3.2, best_rank: 1, integrated_top3_count: 8,
  },
  {
    id: 'inf-004', naver_id: 'cookmama', display_name: '쿡맘레시피',
    profile_url: 'https://in.naver.com/cookmama',
    category: '푸드', sub_category: '푸드 전문블로거 · 한식 전문',
    fan_count: 22500, blog_neighbor_count: 48000,
    stats_summary: '한식 레시피 1,200건', total_keywords: 55,
    avg_rank: 1.8, best_rank: 1, integrated_top3_count: 22,
  },
  {
    id: 'inf-005', naver_id: 'travel_holic', display_name: '여행중독자',
    profile_url: 'https://in.naver.com/travel_holic',
    category: '여행', sub_category: '여행 전문블로거 · 국내여행 전문',
    fan_count: 31000, blog_neighbor_count: 62000,
    stats_summary: '국내여행 800건 리뷰', total_keywords: 38,
    avg_rank: 2.5, best_rank: 1, integrated_top3_count: 15,
  },
  {
    id: 'inf-006', naver_id: 'beauty_jjang', display_name: '뷰티짱',
    profile_url: 'https://in.naver.com/beauty_jjang',
    category: '뷰티', sub_category: '뷰티 전문블로거 · 스킨케어 전문',
    fan_count: 45000, blog_neighbor_count: 89000,
    stats_summary: '화장품 리뷰 2,000건+', total_keywords: 63,
    avg_rank: 1.5, best_rank: 1, integrated_top3_count: 35,
  },
  {
    id: 'inf-007', naver_id: 'ai_master', display_name: 'AI마스터',
    profile_url: 'https://in.naver.com/ai_master',
    category: 'IT', sub_category: 'IT 전문블로거 · AI 전문',
    fan_count: 5800, blog_neighbor_count: 12000,
    stats_summary: 'AI 도구 리뷰 200건+', total_keywords: 18,
    avg_rank: 4.2, best_rank: 1, integrated_top3_count: 5,
  },
  {
    id: 'inf-008', naver_id: 'bookdiver', display_name: '북다이버',
    profile_url: 'https://in.naver.com/bookdiver',
    category: '도서', sub_category: '도서 전문블로거 · 자기계발 전문',
    fan_count: 9800, blog_neighbor_count: 21000,
    stats_summary: '자기계발서 리뷰 400건+', total_keywords: 35,
    avg_rank: 2.8, best_rank: 1, integrated_top3_count: 10,
  },
  {
    id: 'inf-009', naver_id: 'readingking', display_name: '리딩킹',
    profile_url: 'https://in.naver.com/readingking',
    category: '도서', sub_category: '도서 전문블로거 · 논픽션 전문',
    fan_count: 7200, blog_neighbor_count: 16500,
    stats_summary: '독서 기록 600건+', total_keywords: 30,
    avg_rank: 3.5, best_rank: 2, integrated_top3_count: 7,
  },
  {
    id: 'inf-010', naver_id: 'happy_home', display_name: '해피홈데코',
    profile_url: 'https://in.naver.com/happy_home',
    category: '리빙', sub_category: '리빙 전문블로거 · 홈데코 전문',
    fan_count: 11000, blog_neighbor_count: 24000,
    stats_summary: '홈데코 인테리어 500건 리뷰', total_keywords: 32,
    avg_rank: 2.9, best_rank: 1, integrated_top3_count: 9,
  },
];

export function getInfluencer(id: string): Influencer | undefined {
  return mockInfluencers.find(i => i.id === id || i.naver_id === id);
}
