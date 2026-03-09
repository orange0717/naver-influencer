import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServiceClient();

  // UUID 또는 naver_id로 검색
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(id);

  const { data: influencer } = await supabase
    .from('influencers')
    .select('*')
    .eq(isUuid ? 'id' : 'naver_id', id)
    .single();

  if (!influencer) {
    return NextResponse.json({ error: '인플루언서를 찾을 수 없습니다' }, { status: 404 });
  }

  // 참여 키워드 목록
  const { data: keywords } = await supabase
    .from('influencer_keywords')
    .select(`
      keyword_id,
      keyword_challenges(keyword, category, participant_count)
    `)
    .eq('influencer_id', influencer.id)
    .limit(50);

  // 최근 순위
  const { data: rankings } = await supabase
    .from('keyword_rankings')
    .select(`
      rank_position, rank_change, is_integrated_top3, snapshot_date,
      keyword_challenges(keyword, category)
    `)
    .eq('influencer_id', influencer.id)
    .order('snapshot_date', { ascending: false })
    .limit(20);

  return NextResponse.json({
    influencer: {
      ...influencer,
      keywords: keywords?.map(k => k.keyword_challenges) || [],
      recent_rankings: rankings || [],
    },
  });
}
