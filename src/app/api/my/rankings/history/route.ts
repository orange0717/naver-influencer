import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get('days') || '15');
  const keywordId = request.nextUrl.searchParams.get('keyword_id');

  const auth = await getAuthUser(request);
  if (!auth || !auth.user.linked_influencer_id) {
    return NextResponse.json({ keywords: [] });
  }

  const supabase = createServiceClient();
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);

  let query = supabase
    .from('keyword_rankings')
    .select(`
      keyword_id, rank_position, snapshot_date,
      keyword_challenges(keyword)
    `)
    .eq('influencer_id', auth.user.linked_influencer_id)
    .gte('snapshot_date', sinceDate.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true });

  if (keywordId) {
    query = query.eq('keyword_id', keywordId);
  }

  const { data: rankings } = await query;

  // 키워드별 그룹핑
  const keywordMap = new Map<string, { keyword: string; dates: string[]; ranks: number[] }>();

  for (const r of (rankings || [])) {
    const kwName = (r.keyword_challenges as unknown as { keyword: string } | null)?.keyword || '';
    if (!keywordMap.has(r.keyword_id)) {
      keywordMap.set(r.keyword_id, { keyword: kwName, dates: [], ranks: [] });
    }
    const entry = keywordMap.get(r.keyword_id)!;
    entry.dates.push(r.snapshot_date);
    entry.ranks.push(r.rank_position);
  }

  const result = Array.from(keywordMap.entries()).map(([keyword_id, data]) => ({
    keyword_id,
    keyword: data.keyword,
    history: {
      dates: data.dates,
      ranks: data.ranks,
    },
  }));

  return NextResponse.json({ keywords: result });
}
