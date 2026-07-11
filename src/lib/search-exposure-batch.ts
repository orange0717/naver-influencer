/**
 * crawl-search-exposure 배치 DB 조회/업데이트 헬퍼
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type PendingExposureKeyword = {
  keywordId: string;
  keyword: string;
  influencerIds: string[];
};

export type ExposureRankUpdate = {
  keyword_id: string;
  influencer_id: string;
  snapshot_date: string;
  blog_search_rank?: number;
  view_tab_rank?: number;
};

/** 인플루언서별 최신 스냅샷에서 blog_search_rank 미수집 키워드 일괄 조회 */
export async function fetchPendingExposureKeywords(
  supabase: SupabaseClient,
  influencerIds: string[],
): Promise<{ keywords: PendingExposureKeyword[]; snapshotByInfluencer: Map<string, string> }> {
  if (influencerIds.length === 0) {
    return { keywords: [], snapshotByInfluencer: new Map() };
  }

  const { data: pendingRows, error } = await supabase
    .from('keyword_rankings')
    .select('influencer_id, snapshot_date, keyword_id, keyword_challenges!inner(keyword)')
    .in('influencer_id', influencerIds)
    .is('blog_search_rank', null)
    .order('snapshot_date', { ascending: false });

  if (error) throw new Error(`pending exposure query failed: ${error.message}`);

  const maxSnapshotByInf = new Map<string, string>();
  for (const row of pendingRows || []) {
    const current = maxSnapshotByInf.get(row.influencer_id);
    if (!current || row.snapshot_date > current) {
      maxSnapshotByInf.set(row.influencer_id, row.snapshot_date);
    }
  }

  const keywordSet = new Map<string, PendingExposureKeyword>();
  for (const row of pendingRows || []) {
    const maxSnap = maxSnapshotByInf.get(row.influencer_id);
    if (!maxSnap || row.snapshot_date !== maxSnap) continue;

    const kw = row.keyword_challenges as unknown as { keyword: string };
    if (!kw?.keyword) continue;

    const existing = keywordSet.get(row.keyword_id);
    if (existing) {
      if (!existing.influencerIds.includes(row.influencer_id)) {
        existing.influencerIds.push(row.influencer_id);
      }
    } else {
      keywordSet.set(row.keyword_id, {
        keywordId: row.keyword_id,
        keyword: kw.keyword,
        influencerIds: [row.influencer_id],
      });
    }
  }

  return {
    keywords: Array.from(keywordSet.values()),
    snapshotByInfluencer: maxSnapshotByInf,
  };
}

/** 인플루언서별 블로그 ID 일괄 해석 (latest_post_url → naver_id 페이지 크롤) */
export async function resolveBlogIdMap(
  supabase: SupabaseClient,
  influencerIds: string[],
  snapshotByInfluencer: Map<string, string>,
  extractBlogIdFromPage: (naverId: string) => Promise<string | null>,
  sleepMs: (ms: number) => Promise<void>,
): Promise<Map<string, string>> {
  const blogIdMap = new Map<string, string>();
  if (influencerIds.length === 0) return blogIdMap;

  const snapshotDates = [...new Set(snapshotByInfluencer.values())];
  const { data: postRows } = await supabase
    .from('keyword_rankings')
    .select('influencer_id, latest_post_url, snapshot_date')
    .in('influencer_id', influencerIds)
    .in('snapshot_date', snapshotDates)
    .not('latest_post_url', 'is', null)
    .order('snapshot_date', { ascending: false });

  const postUrlByInf = new Map<string, string>();
  for (const row of postRows || []) {
    const expectedSnap = snapshotByInfluencer.get(row.influencer_id);
    if (expectedSnap && row.snapshot_date !== expectedSnap) continue;
    if (!postUrlByInf.has(row.influencer_id) && row.latest_post_url) {
      postUrlByInf.set(row.influencer_id, row.latest_post_url);
    }
  }

  for (const [infId, url] of postUrlByInf) {
    const blogMatch = url.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
    if (blogMatch) blogIdMap.set(infId, blogMatch[1]);
  }

  const unresolved = influencerIds.filter(id => !blogIdMap.has(id));
  if (unresolved.length === 0) return blogIdMap;

  const { data: influencers } = await supabase
    .from('influencers')
    .select('id, naver_id')
    .in('id', unresolved);

  for (const inf of influencers || []) {
    if (!inf.naver_id || blogIdMap.has(inf.id)) continue;
    const blogId = await extractBlogIdFromPage(inf.naver_id);
    if (blogId) blogIdMap.set(inf.id, blogId);
    await sleepMs(500);
  }

  return blogIdMap;
}

/** 동일 (keyword, influencer, snapshot) 키 병합 */
export function mergeExposureUpdates(updates: ExposureRankUpdate[]): ExposureRankUpdate[] {
  const merged = new Map<string, ExposureRankUpdate>();
  for (const u of updates) {
    const key = `${u.keyword_id}:${u.influencer_id}:${u.snapshot_date}`;
    const existing = merged.get(key);
    if (existing) {
      if (u.blog_search_rank != null) existing.blog_search_rank = u.blog_search_rank;
      if (u.view_tab_rank != null) existing.view_tab_rank = u.view_tab_rank;
    } else {
      merged.set(key, { ...u });
    }
  }
  return Array.from(merged.values());
}

/** search exposure 순위 bulk RPC 업데이트 */
export async function applyExposureRankUpdates(
  supabase: SupabaseClient,
  updates: ExposureRankUpdate[],
): Promise<number> {
  if (updates.length === 0) return 0;

  const CHUNK = 100;
  let total = 0;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const { data, error } = await supabase.rpc('update_search_exposure_ranks', {
      p_updates: chunk,
    });
    if (error) throw new Error(`update_search_exposure_ranks failed: ${error.message}`);
    total += typeof data === 'number' ? data : 0;
  }
  return total;
}
