import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '15');
  const keywordId = request.nextUrl.searchParams.get('keyword_id');

  // 쿠키 기반 인증 (대시보드와 동일한 방식)
  const cookieStore = await cookies();
  const naverId = cookieStore.get('naver_id')?.value;

  if (!naverId) {
    return NextResponse.json({ keywords: [] });
  }

  const supabase = createServiceClient();

  // naver_id로 인플루언서 조회
  const { data: influencer } = await supabase
    .from('influencers')
    .select('id')
    .eq('naver_id', naverId)
    .single();

  if (!influencer) {
    return NextResponse.json({ keywords: [] });
  }

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  let query = supabase
    .from('keyword_rankings')
    .select(`
      keyword_id, rank_position, snapshot_date,
      keyword_challenges(keyword)
    `)
    .eq('influencer_id', influencer.id)
    .gte('snapshot_date', sinceDate.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true });

  if (keywordId) {
    query = query.eq('keyword_id', keywordId);
  }

  const { data: rankings } = await query;

  // 키워드별 그룹핑 (RankTrendSection 컴포넌트 형식에 맞춤)
  const keywordMap = new Map<string, { keyword: string; history: { date: string; rank: number }[] }>();

  for (const r of (rankings || [])) {
    const kwName = (r.keyword_challenges as unknown as { keyword: string } | null)?.keyword || '';
    if (!keywordMap.has(r.keyword_id)) {
      keywordMap.set(r.keyword_id, { keyword: kwName, history: [] });
    }
    keywordMap.get(r.keyword_id)!.history.push({
      date: r.snapshot_date,
      rank: r.rank_position,
    });
  }

  // 최근 순위가 높은 키워드 순으로 정렬
  const result = Array.from(keywordMap.entries())
    .map(([keyword_id, data]) => ({
      keyword_id,
      keyword: data.keyword,
      history: data.history,
    }))
    .sort((a, b) => {
      const aLatest = a.history[a.history.length - 1]?.rank ?? 999;
      const bLatest = b.history[b.history.length - 1]?.rank ?? 999;
      return aLatest - bLatest;
    });

  return NextResponse.json({ keywords: result });
}
