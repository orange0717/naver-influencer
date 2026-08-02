import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { crawlSearchExposure } from '@/lib/search-exposure';

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

  // 키워드 정보 조회
  const { data: keyword } = await supabase
    .from('keyword_challenges')
    .select('id, keyword')
    .eq('id', keywordId)
    .single();

  if (!keyword) {
    return NextResponse.json({ error: '키워드를 찾을 수 없습니다.' }, { status: 404 });
  }

  // 이 키워드에 참여하는 인플루언서 naver_id 목록 조회
  const { data: rankings } = await supabase
    .from('keyword_rankings')
    .select('influencer_id, influencers!inner(naver_id)')
    .eq('keyword_id', keywordId)
    .order('snapshot_date', { ascending: false })
    .limit(50);

  // 중복 제거 (최신 스냅샷 기준)
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

  // 크롤링 실행
  const { blog, view } = await crawlSearchExposure(keyword.keyword, naverIds);

  // keyword_rankings 테이블에 캐시 저장 (오늘 날짜 기준)
  const today = new Date().toISOString().slice(0, 10);
  const influencerIdByNaverId = new Map<string, string>();
  for (const [infId, naverId] of naverIdMap) {
    influencerIdByNaverId.set(naverId.toLowerCase(), infId);
  }

  await Promise.all(blog.map(b => {
    const infId = influencerIdByNaverId.get(b.naver_id.toLowerCase());
    if (!infId) return null;
    return supabase
      .from('keyword_rankings')
      .update({ blog_search_rank: b.rank })
      .eq('keyword_id', keywordId)
      .eq('influencer_id', infId)
      .eq('snapshot_date', today);
  }));

  await Promise.all(view.map(v => {
    const infId = influencerIdByNaverId.get(v.naver_id.toLowerCase());
    if (!infId) return null;
    return supabase
      .from('keyword_rankings')
      .update({ view_tab_rank: v.rank })
      .eq('keyword_id', keywordId)
      .eq('influencer_id', infId)
      .eq('snapshot_date', today);
  }));

  return NextResponse.json({ blog, view, keyword: keyword.keyword });
}
