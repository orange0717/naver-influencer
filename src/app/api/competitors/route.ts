import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 경쟁자 키워드 순위 데이터 조회 API
 * GET /api/competitors?naverId=competitor_id&myNaverId=my_id
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('naverId');
    const myNaverId = searchParams.get('myNaverId');

    if (!competitorId) {
      return NextResponse.json({ error: 'naverId가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 경쟁자 인플루언서 정보 조회
    const { data: competitor } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, first_seen_at')
      .eq('naver_id', competitorId)
      .single();

    if (!competitor) {
      return NextResponse.json({ error: '해당 인플루언서를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 경쟁자의 키워드 순위 조회
    const { data: competitorRankings } = await supabase
      .from('keyword_rankings')
      .select(`
        rank_position, is_integrated_top3, keyword_id,
        keyword_challenges!inner(keyword, category, participant_count)
      `)
      .eq('influencer_id', competitor.id)
      .order('snapshot_date', { ascending: false })
      .limit(500);

    // 최신 날짜 기준 중복 제거
    const latestByKeyword = new Map<string, typeof competitorRankings extends (infer T)[] | null ? T : never>();
    for (const r of (competitorRankings || [])) {
      if (!latestByKeyword.has(r.keyword_id)) {
        latestByKeyword.set(r.keyword_id, r);
      }
    }

    const rankings = Array.from(latestByKeyword.values()).map(r => {
      const kw = r.keyword_challenges as unknown as Record<string, unknown>;
      return {
        keyword_id: r.keyword_id,
        keyword: (kw?.keyword as string) || '',
        category: (kw?.category as string) || '',
        rank_position: r.rank_position,
        is_integrated_top3: r.is_integrated_top3,
        participant_count: (kw?.participant_count as number) || 0,
      };
    }).sort((a, b) => a.rank_position - b.rank_position);

    // 나의 순위도 가져와서 겹치는 키워드 비교
    let sharedKeywords: { keyword: string; keyword_id: string; myRank: number | null; competitorRank: number }[] = [];

    if (myNaverId) {
      const { data: myInfluencer } = await supabase
        .from('influencers')
        .select('id')
        .eq('naver_id', myNaverId)
        .single();

      if (myInfluencer) {
        const { data: myRankings } = await supabase
          .from('keyword_rankings')
          .select('rank_position, keyword_id')
          .eq('influencer_id', myInfluencer.id)
          .order('snapshot_date', { ascending: false })
          .limit(500);

        const myRankMap = new Map<string, number>();
        for (const r of (myRankings || [])) {
          if (!myRankMap.has(r.keyword_id)) {
            myRankMap.set(r.keyword_id, r.rank_position);
          }
        }

        // 겹치는 키워드 찾기
        for (const cr of rankings) {
          if (myRankMap.has(cr.keyword_id)) {
            sharedKeywords.push({
              keyword: cr.keyword,
              keyword_id: cr.keyword_id,
              myRank: myRankMap.get(cr.keyword_id) || null,
              competitorRank: cr.rank_position,
            });
          }
        }

        sharedKeywords.sort((a, b) => (a.myRank || 999) - (b.myRank || 999));
      }
    }

    // 통계
    const totalKeywords = rankings.length;
    const top3Count = rankings.filter(r => r.rank_position <= 3).length;
    const top10Count = rankings.filter(r => r.rank_position <= 10).length;
    const avgRank = totalKeywords > 0
      ? rankings.reduce((s, r) => s + r.rank_position, 0) / totalKeywords
      : 0;

    return NextResponse.json({
      competitor: {
        naverId: competitor.naver_id,
        displayName: competitor.display_name,
        imageUrl: competitor.image_url,
        category: competitor.my_keyword_category || competitor.category,
        subscriberCount: competitor.subscriber_count,
        firstSeenAt: competitor.first_seen_at,
      },
      stats: {
        totalKeywords,
        top3Count,
        top10Count,
        avgRank: Math.round(avgRank * 10) / 10,
      },
      top5: rankings.slice(0, 5),
      sharedKeywords,
      sharedCount: sharedKeywords.length,
    });
  } catch {
    return NextResponse.json({ error: '경쟁자 데이터 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
