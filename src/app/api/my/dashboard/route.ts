import { NextResponse } from 'next/server';

const myInfluencer = {
  id: 'inf-003',
  naver_id: 'orangelibrary',
  display_name: '오렌지도서관',
  category: '도서',
  fan_count: 209,
  profile_url: 'https://in.naver.com/orangelibrary',
};

const stats = {
  total_keywords: 7,
  avg_rank: 4.1,
  top3_count: 3,
  integrated_top3_count: 3,
  rank_up_count: 3,
  rank_down_count: 1,
  total_views_7d: 42,
};

const rankings = [
  {
    keyword_id: 'kw-003', keyword: '행복명언', category: '자기계발',
    rank_position: 1, previous_rank: 1, rank_change: 0,
    is_integrated_top3: true, participant_count: 71,
    search_volume_monthly: 33100, view_count: 6,
    rank_history: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1],
    rank_history_dates: Array.from({ length: 15 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (14 - i));
      return d.toISOString().split('T')[0];
    }),
  },
  {
    keyword_id: 'kw-004', keyword: '독서노트작성법', category: '도서',
    rank_position: 2, previous_rank: 3, rank_change: 1,
    is_integrated_top3: true, participant_count: 45,
    search_volume_monthly: 12400, view_count: 8,
    rank_history: [4, 4, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2],
    rank_history_dates: Array.from({ length: 15 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (14 - i));
      return d.toISOString().split('T')[0];
    }),
  },
  {
    keyword_id: 'kw-006', keyword: '한줄명언', category: '자기계발',
    rank_position: 3, previous_rank: 3, rank_change: 0,
    is_integrated_top3: true, participant_count: 52,
    search_volume_monthly: 21500, view_count: 4,
    rank_history: [3, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    rank_history_dates: Array.from({ length: 15 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (14 - i));
      return d.toISOString().split('T')[0];
    }),
  },
  {
    keyword_id: 'kw-014', keyword: '에세이추천', category: '도서',
    rank_position: 4, previous_rank: 5, rank_change: 1,
    is_integrated_top3: false, participant_count: 85,
    search_volume_monthly: 28400, view_count: 5,
    rank_history: [6, 6, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4],
    rank_history_dates: Array.from({ length: 15 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (14 - i));
      return d.toISOString().split('T')[0];
    }),
  },
  {
    keyword_id: 'kw-012', keyword: '소설추천', category: '도서',
    rank_position: 5, previous_rank: 3, rank_change: -2,
    is_integrated_top3: false, participant_count: 128,
    search_volume_monthly: 58200, view_count: 3,
    rank_history: [3, 3, 3, 4, 4, 5, 5, 7, 5, 5, 5, 5, 5, 5, 5],
    rank_history_dates: Array.from({ length: 15 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (14 - i));
      return d.toISOString().split('T')[0];
    }),
  },
  {
    keyword_id: 'kw-015', keyword: '인생책', category: '도서',
    rank_position: 6, previous_rank: 6, rank_change: 0,
    is_integrated_top3: false, participant_count: 112,
    search_volume_monthly: 44200, view_count: 7,
    rank_history: [6, 7, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    rank_history_dates: Array.from({ length: 15 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (14 - i));
      return d.toISOString().split('T')[0];
    }),
  },
  {
    keyword_id: 'kw-013', keyword: '자기계발책추천', category: '자기계발',
    rank_position: 8, previous_rank: 11, rank_change: 3,
    is_integrated_top3: false, participant_count: 203,
    search_volume_monthly: 89100, view_count: 9,
    rank_history: [15, 14, 13, 12, 11, 11, 11, 10, 9, 9, 8, 8, 8, 8, 8],
    rank_history_dates: Array.from({ length: 15 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (14 - i));
      return d.toISOString().split('T')[0];
    }),
  },
];

const guide = [
  { factor: '서비스 활성도', status: 'warning', message: '참여 키워드 7개 / 전체 336개 (2.1%)', action: '30개 이상 참여 확대 권장' },
  { factor: '인게이지먼트', status: 'actionable', message: '평균 조회수 3.4회', action: '콘텐츠 홍보 및 SNS 공유 필요' },
  { factor: 'TOP 3 기회', status: 'opportunity', message: "'에세이추천' 4위 — TOP 3까지 1단계", action: '콘텐츠 품질 개선으로 TOP 3 진입 가능' },
];

export async function GET() {
  return NextResponse.json({
    influencer: myInfluencer,
    stats,
    rankings,
    guide,
  });
}
