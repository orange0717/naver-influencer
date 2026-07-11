import { describe, it, expect } from 'vitest';
import { mergeExposureUpdates } from '../search-exposure-batch';

describe('mergeExposureUpdates', () => {
  it('동일 키의 blog/view rank를 하나로 병합', () => {
    const merged = mergeExposureUpdates([
      {
        keyword_id: 'kw-1',
        influencer_id: 'inf-1',
        snapshot_date: '2026-07-11',
        blog_search_rank: 3,
      },
      {
        keyword_id: 'kw-1',
        influencer_id: 'inf-1',
        snapshot_date: '2026-07-11',
        view_tab_rank: 5,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      blog_search_rank: 3,
      view_tab_rank: 5,
    });
  });

  it('서로 다른 influencer는 분리 유지', () => {
    const merged = mergeExposureUpdates([
      {
        keyword_id: 'kw-1',
        influencer_id: 'inf-1',
        snapshot_date: '2026-07-11',
        blog_search_rank: 1,
      },
      {
        keyword_id: 'kw-1',
        influencer_id: 'inf-2',
        snapshot_date: '2026-07-11',
        blog_search_rank: 2,
      },
    ]);

    expect(merged).toHaveLength(2);
  });
});
