import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, sleep } from '@/lib/crawler';
import { crawlBlogSearchRank, crawlViewTabRank, extractBlogIdFromInfluencerPage } from '@/lib/search-exposure';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/cron/crawl-search-exposure
 * 가입자 키워드의 통합검색/블로그탭 순위 배치 크롤링
 *
 * ?batch=0 (기본) → 0~49번째 키워드
 * ?batch=1 → 50~99번째 키워드
 * ...
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClient();
  const batchNum = parseInt(request.nextUrl.searchParams.get('batch') || '0');
  const targetNaverId = request.nextUrl.searchParams.get('naverId');
  const forceBlogId = request.nextUrl.searchParams.get('blogId'); // 블로그 ID 직접 지정
  const reset = request.nextUrl.searchParams.get('reset') === '1';
  const BATCH_SIZE = parseInt(request.nextUrl.searchParams.get('size') || '20');
  const start = batchNum * BATCH_SIZE;

  const userInfluencerIds = new Set<string>();

  // 특정 인플루언서만 크롤링
  if (targetNaverId) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('id')
      .eq('naver_id', targetNaverId)
      .single();
    if (inf) userInfluencerIds.add(inf.id);
  } else {
    // 가입자(users.linked_influencer_id) + 데모체험자
    const { data: users } = await supabase
      .from('users')
      .select('linked_influencer_id')
      .not('linked_influencer_id', 'is', null);

    for (const u of (users || [])) {
      if (u.linked_influencer_id) userInfluencerIds.add(u.linked_influencer_id);
    }

    // 데모체험 사용자도 포함
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

  // 리셋: 기존 blog_search_rank/view_tab_rank를 NULL로 초기화
  if (reset && batchNum === 0) {
    for (const infId of userInfluencerIds) {
      await supabase
        .from('keyword_rankings')
        .update({ blog_search_rank: null, view_tab_rank: null })
        .eq('influencer_id', infId)
        .not('blog_search_rank', 'is', null);
      await supabase
        .from('keyword_rankings')
        .update({ blog_search_rank: null, view_tab_rank: null })
        .eq('influencer_id', infId)
        .not('view_tab_rank', 'is', null);
    }
  }

  // 각 가입자의 최신 스냅샷 날짜별 키워드 수집
  const keywordSet = new Map<string, { keyword: string; influencerIds: string[] }>();
  const infSnapshotMap = new Map<string, string>(); // influencer_id -> snapshot_date

  for (const infId of userInfluencerIds) {
    // 각 인플루언서의 최신 스냅샷 날짜 조회
    const { data: latestRow } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .eq('influencer_id', infId)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    if (!latestRow) continue;
    const snapshotDate = latestRow.snapshot_date;
    infSnapshotMap.set(infId, snapshotDate);

    const { data: rankings } = await supabase
      .from('keyword_rankings')
      .select('keyword_id, keyword_challenges!inner(keyword)')
      .eq('influencer_id', infId)
      .eq('snapshot_date', snapshotDate)
      .is('blog_search_rank', null); // 아직 크롤링 안 된 키워드만

    for (const r of (rankings || [])) {
      const kw = r.keyword_challenges as unknown as { keyword: string };
      if (!kw?.keyword) continue;
      const existing = keywordSet.get(r.keyword_id);
      if (existing) {
        existing.influencerIds.push(infId);
      } else {
        keywordSet.set(r.keyword_id, { keyword: kw.keyword, influencerIds: [infId] });
      }
    }
  }

  const allKeywords = Array.from(keywordSet.entries());
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

  // 인플루언서별 블로그 ID 추출
  const blogIdMap = new Map<string, string>(); // influencer_id -> blog_id
  if (forceBlogId && targetNaverId) {
    // blogId 파라미터가 있으면 직접 사용
    for (const infId of userInfluencerIds) {
      blogIdMap.set(infId, forceBlogId);
    }
  } else {
    // 인플루언서 페이지에서 블로그 ID 추출
    for (const infId of userInfluencerIds) {
      // 1) latest_post_url에서 blog.naver.com 패턴 시도
      const snapDate = infSnapshotMap.get(infId);
      if (snapDate) {
        const { data: postRow } = await supabase
          .from('keyword_rankings')
          .select('latest_post_url')
          .eq('influencer_id', infId)
          .eq('snapshot_date', snapDate)
          .not('latest_post_url', 'is', null)
          .limit(1)
          .single();
        if (postRow?.latest_post_url) {
          const blogMatch = postRow.latest_post_url.match(/(?:m\.)?blog\.naver\.com\/([a-zA-Z0-9_-]+)/);
          if (blogMatch) {
            blogIdMap.set(infId, blogMatch[1]);
            continue;
          }
        }
      }

      // 2) blog.naver.com URL이 없으면 인플루언서 페이지에서 블로그 ID 크롤링
      const { data: inf } = await supabase
        .from('influencers')
        .select('naver_id')
        .eq('id', infId)
        .single();
      if (inf?.naver_id) {
        const blogId = await extractBlogIdFromInfluencerPage(inf.naver_id);
        if (blogId) {
          blogIdMap.set(infId, blogId);
        }
        await sleep(500);
      }
    }
  }

  for (const [keywordId, { keyword, influencerIds }] of batch) {
    try {
      // 해당 키워드에 참여하는 인플루언서의 블로그 ID 수집
      const { data: infData } = await supabase
        .from('influencers')
        .select('id, naver_id')
        .in('id', influencerIds);

      // 블로그 ID 우선, 없으면 naver_id 사용
      const blogIds: string[] = [];
      const blogIdToInfId = new Map<string, string>();
      for (const inf of (infData || [])) {
        const blogId = blogIdMap.get(inf.id) || inf.naver_id;
        if (blogId) {
          blogIds.push(blogId);
          blogIdToInfId.set(blogId.toLowerCase(), inf.id);
        }
      }
      if (blogIds.length === 0) continue;

      // 블로그탭 크롤링 (네이버 검색 API)
      const blogResults = await crawlBlogSearchRank(keyword, blogIds);
      blogFound += blogResults.length;
      await sleep(300);

      // 통합검색 VIEW 크롤링 (skipView=1이면 스킵 - 서버사이드에서 항상 0건)
      const skipView = request.nextUrl.searchParams.get('skipView') === '1';
      let viewResults: { naver_id: string; rank: number }[] = [];
      if (!skipView) {
        viewResults = await crawlViewTabRank(keyword, blogIds);
        viewFound += viewResults.length;
        await sleep(1500);
      }

      // DB 업데이트 (각 인플루언서의 최신 스냅샷 날짜 기준)
      for (const b of blogResults) {
        const infId = blogIdToInfId.get(b.naver_id.toLowerCase());
        const snapDate = infId ? infSnapshotMap.get(infId) : null;
        if (infId && snapDate) {
          await supabase
            .from('keyword_rankings')
            .update({ blog_search_rank: b.rank })
            .eq('keyword_id', keywordId)
            .eq('influencer_id', infId)
            .eq('snapshot_date', snapDate);
        }
      }

      for (const v of viewResults) {
        const infId = blogIdToInfId.get(v.naver_id.toLowerCase());
        const snapDate = infId ? infSnapshotMap.get(infId) : null;
        if (infId && snapDate) {
          await supabase
            .from('keyword_rankings')
            .update({ view_tab_rank: v.rank })
            .eq('keyword_id', keywordId)
            .eq('influencer_id', infId)
            .eq('snapshot_date', snapDate);
        }
      }

      crawled++;
    } catch (err) {
      console.error(`[crawl-search-exposure] ${keyword} 실패:`, err);
      errors++;
    }
  }

  return NextResponse.json({
    message: `배치 ${batchNum} 완료`,
    total: allKeywords.length,
    batchStart: start,
    crawled,
    blogFound,
    viewFound,
    blogIdUsed: Array.from(blogIdMap.values()).slice(0, 3),
    errors,
    nextBatch: start + BATCH_SIZE < allKeywords.length ? batchNum + 1 : null,
  });
}
