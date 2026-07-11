import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, sleep } from '@/lib/crawler';
import { crawlBlogSearchRank, crawlViewTabRank, extractBlogIdFromInfluencerPage } from '@/lib/search-exposure';
import {
  applyExposureRankUpdates,
  fetchPendingExposureKeywords,
  mergeExposureUpdates,
  resolveBlogIdMap,
  type ExposureRankUpdate,
} from '@/lib/search-exposure-batch';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/crawl-search-exposure
 * 가입자 키워드의 통합검색/블로그탭 순위 배치 크롤링
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const batchNum = parseInt(request.nextUrl.searchParams.get('batch') || '0');
  const targetNaverId = request.nextUrl.searchParams.get('naverId');
  const forceBlogId = request.nextUrl.searchParams.get('blogId');
  const reset = request.nextUrl.searchParams.get('reset') === '1';
  const BATCH_SIZE = parseInt(request.nextUrl.searchParams.get('size') || '20');
  const start = batchNum * BATCH_SIZE;

  const userInfluencerIds = new Set<string>();

  if (targetNaverId) {
    const { data: inf, error: infError } = await supabase
      .from('influencers')
      .select('id')
      .eq('naver_id', targetNaverId)
      .single();
    if (infError || !inf) {
      logger.error('cron/crawl-search-exposure', 'Influencer lookup failed', { err: infError?.message });
    } else {
      userInfluencerIds.add(inf.id);
    }
  } else {
    const { data: users } = await supabase
      .from('users')
      .select('linked_influencer_id')
      .not('linked_influencer_id', 'is', null);

    for (const u of users || []) {
      if (u.linked_influencer_id) userInfluencerIds.add(u.linked_influencer_id);
    }

    const { data: demoSessions } = await supabase
      .from('demo_sessions')
      .select('naver_id')
      .gt('expires_at', new Date().toISOString());

    const demoNaverIds = [...new Set((demoSessions || []).map(d => d.naver_id).filter(Boolean))];
    if (demoNaverIds.length > 0) {
      const { data: demoInf } = await supabase
        .from('influencers')
        .select('id')
        .in('naver_id', demoNaverIds);
      for (const inf of demoInf || []) {
        userInfluencerIds.add(inf.id);
      }
    }
  }

  if (userInfluencerIds.size === 0) {
    return NextResponse.json({ message: '대상 인플루언서가 없습니다.' });
  }

  const infIdList = Array.from(userInfluencerIds);

  if (reset && batchNum === 0) {
    await supabase
      .from('keyword_rankings')
      .update({ blog_search_rank: null, view_tab_rank: null })
      .in('influencer_id', infIdList)
      .or('blog_search_rank.not.is.null,view_tab_rank.not.is.null');
  }

  const { keywords: allKeywords, snapshotByInfluencer: infSnapshotMap } =
    await fetchPendingExposureKeywords(supabase, infIdList);

  const batch = allKeywords.slice(start, start + BATCH_SIZE);

  if (batch.length === 0) {
    return NextResponse.json({
      message: '크롤링할 키워드가 없습니다.',
      total: allKeywords.length,
      batch: batchNum,
    });
  }

  let crawled = 0;
  let errors = 0;
  let blogFound = 0;
  let viewFound = 0;

  const blogIdMap = new Map<string, string>();
  if (forceBlogId && targetNaverId) {
    for (const infId of userInfluencerIds) {
      blogIdMap.set(infId, forceBlogId);
    }
  } else {
    const resolved = await resolveBlogIdMap(
      supabase,
      infIdList,
      infSnapshotMap,
      extractBlogIdFromInfluencerPage,
      sleep,
    );
    for (const [k, v] of resolved) blogIdMap.set(k, v);
  }

  const skipView = request.nextUrl.searchParams.get('skipView') === '1';
  const pendingUpdates: ExposureRankUpdate[] = [];

  for (const { keywordId, keyword, influencerIds } of batch) {
    try {
      const { data: infData } = await supabase
        .from('influencers')
        .select('id, naver_id')
        .in('id', influencerIds);

      const blogIds: string[] = [];
      const blogIdToInfId = new Map<string, string>();
      for (const inf of infData || []) {
        const blogId = blogIdMap.get(inf.id) || inf.naver_id;
        if (blogId) {
          blogIds.push(blogId);
          blogIdToInfId.set(blogId.toLowerCase(), inf.id);
        }
      }
      if (blogIds.length === 0) continue;

      const blogResults = await crawlBlogSearchRank(keyword, blogIds);
      blogFound += blogResults.length;
      await sleep(300);

      let viewResults: { naver_id: string; rank: number }[] = [];
      if (!skipView) {
        viewResults = await crawlViewTabRank(keyword, blogIds);
        viewFound += viewResults.length;
        await sleep(1500);
      }

      for (const b of blogResults) {
        const infId = blogIdToInfId.get(b.naver_id.toLowerCase());
        const snapDate = infId ? infSnapshotMap.get(infId) : null;
        if (infId && snapDate) {
          pendingUpdates.push({
            keyword_id: keywordId,
            influencer_id: infId,
            snapshot_date: snapDate,
            blog_search_rank: b.rank,
          });
        }
      }

      for (const v of viewResults) {
        const infId = blogIdToInfId.get(v.naver_id.toLowerCase());
        const snapDate = infId ? infSnapshotMap.get(infId) : null;
        if (infId && snapDate) {
          pendingUpdates.push({
            keyword_id: keywordId,
            influencer_id: infId,
            snapshot_date: snapDate,
            view_tab_rank: v.rank,
          });
        }
      }

      crawled++;
    } catch (err) {
      logger.error('cron/crawl-search-exposure', `Keyword crawl failed: ${keyword}`, {
        err: err instanceof Error ? err.message : String(err),
      });
      errors++;
    }
  }

  const updatedRows = await applyExposureRankUpdates(
    supabase,
    mergeExposureUpdates(pendingUpdates),
  );

  return NextResponse.json({
    message: `배치 ${batchNum} 완료`,
    total: allKeywords.length,
    batchStart: start,
    crawled,
    blogFound,
    viewFound,
    updatedRows,
    blogIdUsed: Array.from(blogIdMap.values()).slice(0, 3),
    errors,
    nextBatch: start + BATCH_SIZE < allKeywords.length ? batchNum + 1 : null,
  });
}
