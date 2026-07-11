import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { crawlSearchExposure } from '@/lib/search-exposure';
import { applyExposureRankUpdates, mergeExposureUpdates } from '@/lib/search-exposure-batch';
import { getKSTDateString } from '@/lib/kst-date';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/keywords/[id]/search-exposure
 * 특정 키워드의 통합검색/블로그 검색 노출 현황 (실시간 크롤링)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieUser = await getCookieUser();
  if (!cookieUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { id: keywordId } = await params;
  const supabase = createServiceClient();

  const { data: keyword } = await supabase
    .from('keyword_challenges')
    .select('id, keyword')
    .eq('id', keywordId)
    .single();

  if (!keyword) {
    return NextResponse.json({ error: '키워드를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: rankings } = await supabase
    .from('keyword_rankings')
    .select('influencer_id, influencers!inner(naver_id)')
    .eq('keyword_id', keywordId)
    .order('snapshot_date', { ascending: false })
    .limit(50);

  const naverIdMap = new Map<string, string>();
  for (const r of rankings || []) {
    const inf = r.influencers as unknown as { naver_id: string };
    if (inf?.naver_id && !naverIdMap.has(r.influencer_id)) {
      naverIdMap.set(r.influencer_id, inf.naver_id);
    }
  }

  const naverIds = Array.from(naverIdMap.values());
  if (naverIds.length === 0) {
    return NextResponse.json({ blog: [], view: [] });
  }

  const { blog, view } = await crawlSearchExposure(keyword.keyword, naverIds);

  const today = getKSTDateString();
  const influencerIdByNaverId = new Map<string, string>();
  for (const [infId, naverId] of naverIdMap) {
    influencerIdByNaverId.set(naverId.toLowerCase(), infId);
  }

  const updates = mergeExposureUpdates([
    ...blog.map(b => ({
      keyword_id: keywordId,
      influencer_id: influencerIdByNaverId.get(b.naver_id.toLowerCase())!,
      snapshot_date: today,
      blog_search_rank: b.rank,
    })).filter(u => u.influencer_id),
    ...view.map(v => ({
      keyword_id: keywordId,
      influencer_id: influencerIdByNaverId.get(v.naver_id.toLowerCase())!,
      snapshot_date: today,
      view_tab_rank: v.rank,
    })).filter(u => u.influencer_id),
  ]);

  if (updates.length > 0) {
    await applyExposureRankUpdates(supabase, updates);
  }

  return NextResponse.json({ blog, view, keyword: keyword.keyword });
}
