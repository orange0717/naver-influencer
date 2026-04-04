import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyCronSecret, sleep } from '@/lib/crawler';
import { crawlBlogSearchRank, crawlViewTabRank } from '@/lib/search-exposure';

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
  const BATCH_SIZE = 50;
  const start = batchNum * BATCH_SIZE;

  // 가입자(users.linked_influencer_id) + 데모체험자
  const { data: users } = await supabase
    .from('users')
    .select('linked_influencer_id')
    .not('linked_influencer_id', 'is', null);

  const userInfluencerIds = new Set<string>(
    (users || []).map(u => u.linked_influencer_id).filter(Boolean),
  );

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

  if (userInfluencerIds.size === 0) {
    return NextResponse.json({ message: '가입자가 없습니다.' });
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

  for (const [keywordId, { keyword, influencerIds }] of batch) {
    try {
      // 해당 키워드에 참여하는 모든 인플루언서 naver_id 조회
      const { data: infData } = await supabase
        .from('influencers')
        .select('id, naver_id')
        .in('id', influencerIds);

      const naverIds = (infData || []).map(i => i.naver_id).filter(Boolean);
      if (naverIds.length === 0) continue;

      // 블로그탭 크롤링
      const blogResults = await crawlBlogSearchRank(keyword, naverIds);
      await sleep(1500);

      // 통합검색 VIEW 크롤링
      const viewResults = await crawlViewTabRank(keyword, naverIds);
      await sleep(1500);

      // DB 업데이트 (각 인플루언서의 최신 스냅샷 날짜 기준)
      const naverIdToInfId = new Map((infData || []).map(i => [i.naver_id.toLowerCase(), i.id]));

      for (const b of blogResults) {
        const infId = naverIdToInfId.get(b.naver_id.toLowerCase());
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
        const infId = naverIdToInfId.get(v.naver_id.toLowerCase());
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
    errors,
    nextBatch: start + BATCH_SIZE < allKeywords.length ? batchNum + 1 : null,
  });
}
