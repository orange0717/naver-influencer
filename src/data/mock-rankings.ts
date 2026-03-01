import { Ranking } from '@/lib/types';

export const mockRankings: Record<string, Ranking[]> = {
  'kw-001': [
    { id: 'r-001', keyword_id: 'kw-001', influencer_name: '미니멀집순이', influencer_url: 'https://in.naver.com/minimal_home', influencer_category: '리빙', rank_position: 1, previous_rank: 1, rank_change: 0, post_count: 45, snapshot_date: '2026-03-01' },
    { id: 'r-002', keyword_id: 'kw-001', influencer_name: '심플라이프', influencer_url: 'https://in.naver.com/simplelife', influencer_category: '리빙', rank_position: 2, previous_rank: 3, rank_change: 1, post_count: 38, snapshot_date: '2026-03-01' },
    { id: 'r-003', keyword_id: 'kw-001', influencer_name: '정리의여왕', influencer_url: 'https://in.naver.com/organize_queen', influencer_category: '리빙', rank_position: 3, previous_rank: 2, rank_change: -1, post_count: 52, snapshot_date: '2026-03-01' },
    { id: 'r-004', keyword_id: 'kw-001', influencer_name: '비움의미학', influencer_url: '#', influencer_category: '리빙', rank_position: 4, previous_rank: 4, rank_change: 0, post_count: 29, snapshot_date: '2026-03-01' },
    { id: 'r-005', keyword_id: 'kw-001', influencer_name: '미니멀주부', influencer_url: '#', influencer_category: '리빙', rank_position: 5, previous_rank: 7, rank_change: 2, post_count: 21, snapshot_date: '2026-03-01' },
    { id: 'r-006', keyword_id: 'kw-001', influencer_name: '깔끔한하루', influencer_url: '#', influencer_category: '리빙', rank_position: 6, previous_rank: 5, rank_change: -1, post_count: 33, snapshot_date: '2026-03-01' },
    { id: 'r-007', keyword_id: 'kw-001', influencer_name: '일상정리사', influencer_url: '#', influencer_category: '자기계발', rank_position: 7, previous_rank: 6, rank_change: -1, post_count: 18, snapshot_date: '2026-03-01' },
    { id: 'r-008', keyword_id: 'kw-001', influencer_name: '소확행연구소', influencer_url: '#', influencer_category: '리빙', rank_position: 8, previous_rank: 9, rank_change: 1, post_count: 15, snapshot_date: '2026-03-01' },
    { id: 'r-009', keyword_id: 'kw-001', influencer_name: '절제의품격', influencer_url: '#', influencer_category: '자기계발', rank_position: 9, previous_rank: 8, rank_change: -1, post_count: 12, snapshot_date: '2026-03-01' },
    { id: 'r-010', keyword_id: 'kw-001', influencer_name: '미니멀우디', influencer_url: '#', influencer_category: '리빙', rank_position: 10, previous_rank: null, rank_change: 0, post_count: 8, snapshot_date: '2026-03-01' },
  ],
};

export function getRankingsForKeyword(keywordId: string): Ranking[] {
  return mockRankings[keywordId] || mockRankings['kw-001'];
}
