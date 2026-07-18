import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import { getPlanTierByCookieUser, tryConsumeCompetitor } from '@/lib/competitor-quota';

export const dynamic = 'force-dynamic';

/**
 * 경쟁자 키워드 순위 데이터 조회 API
 * GET /api/competitors?naverId=competitor_id&myNaverId=my_id
 */
export async function GET(request: NextRequest) {
  try {
    const cookieUser = await getCookieUser();
    if (!cookieUser) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('naverId');
    const myNaverId = searchParams.get('myNaverId');

    // 소유권 검증: myNaverId가 로그인한 사용자와 일치하는지 확인
    if (myNaverId && myNaverId !== cookieUser.id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    if (!competitorId) {
      return NextResponse.json({ error: 'naverId가 필요합니다.' }, { status: 400 });
    }

    // ─── 1일 횟수 제한 (free=1, blogger=5, influencer=무제한) ───
    // 본인 ID는 자기분석이므로 카운트하지 않음
    if (competitorId !== cookieUser.id) {
      const plan = await getPlanTierByCookieUser(cookieUser);
      const { allowed, count, limit } = await tryConsumeCompetitor(
        cookieUser.id,
        competitorId,
        plan,
      );
      if (!allowed) {
        return NextResponse.json(
          {
            error: `오늘의 경쟁자 분석 횟수(${limit}회)를 모두 사용했습니다. 내일 다시 시도하거나 상위 플랜으로 업그레이드해주세요.`,
            limitExceeded: true,
            plan,
            used: count,
            limit,
          },
          { status: 429 },
        );
      }
    }

    const supabase = createServiceClient();

    // 경쟁자 인플루언서 정보 조회
    const { data: competitor } = await supabase
      .from('influencers')
      .select('id, naver_id, display_name, image_url, category, my_keyword_category, subscriber_count, total_follower_count, first_seen_at, naver_created_at, total_keywords')
      .eq('naver_id', competitorId)
      .single();

    if (!competitor) {
      return NextResponse.json({ error: '해당 인플루언서를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 경쟁자의 최신 스냅샷 날짜 조회
    const { data: compLatest } = await supabase
      .from('keyword_rankings')
      .select('snapshot_date')
      .eq('influencer_id', competitor.id)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .single();

    const compSnapshotDate = compLatest?.snapshot_date;

    // 해당 날짜의 전체 키워드 순위 조회 (JOIN 없이 정확한 카운트)
    const PAGE = 1000;
    const competitorRankings: { rank_position: number; is_integrated_top3: boolean; keyword_id: string }[] = [];
    if (compSnapshotDate) {
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: batch } = await supabase
          .from('keyword_rankings')
          .select('rank_position, is_integrated_top3, keyword_id')
          .eq('influencer_id', competitor.id)
          .eq('snapshot_date', compSnapshotDate)
          .range(from, from + PAGE - 1);
        if (batch && batch.length > 0) {
          competitorRankings.push(...batch);
          from += PAGE;
          hasMore = batch.length === PAGE;
        } else {
          hasMore = false;
        }
      }
    }

    competitorRankings.sort((a, b) => a.rank_position - b.rank_position);

    // 통계 (total_keywords는 influencers 테이블에서 가져옴 = 네이버 실제 값)
    const totalKeywords = competitor.total_keywords || competitorRankings.length;
    const top3Count = competitorRankings.filter(r => r.rank_position <= 3).length;
    const top10Count = competitorRankings.filter(r => r.rank_position <= 10).length;
    const avgRank = totalKeywords > 0
      ? competitorRankings.reduce((s, r) => s + r.rank_position, 0) / totalKeywords
      : 0;

    // 나의 순위도 가져와서 겹치는 키워드 비교
    let sharedKeywords: { keyword: string; keyword_id: string; myRank: number | null; competitorRank: number }[] = [];
    let myStats: { totalKeywords: number; top3Count: number; top10Count: number; avgRank: number } | null = null;
    let mySubscribers = 0;

    if (myNaverId) {
      const { data: myInfluencer } = await supabase
        .from('influencers')
        .select('id, total_keywords, subscriber_count, total_follower_count')
        .eq('naver_id', myNaverId)
        .single();

      if (myInfluencer) {
        mySubscribers = myInfluencer.subscriber_count || myInfluencer.total_follower_count || 0;
        // 내 최신 스냅샷 날짜 조회
        const { data: myLatest } = await supabase
          .from('keyword_rankings')
          .select('snapshot_date')
          .eq('influencer_id', myInfluencer.id)
          .order('snapshot_date', { ascending: false })
          .limit(1)
          .single();

        const mySnapshotDate = myLatest?.snapshot_date;

        // Supabase 1000건 제한 우회
        const myRankingsList: { rank_position: number; keyword_id: string }[] = [];
        if (mySnapshotDate) {
          let from = 0;
          let hasMore = true;
          while (hasMore) {
            const { data: batch } = await supabase
              .from('keyword_rankings')
              .select('rank_position, keyword_id')
              .eq('influencer_id', myInfluencer.id)
              .eq('snapshot_date', mySnapshotDate)
              .range(from, from + PAGE - 1);
            if (batch && batch.length > 0) {
              myRankingsList.push(...batch);
              from += PAGE;
              hasMore = batch.length === PAGE;
            } else {
              hasMore = false;
            }
          }
        }

        const myRankMap = new Map<string, number>();
        for (const r of myRankingsList) {
          myRankMap.set(r.keyword_id, r.rank_position);
        }

        // 내 통계 계산 (DB 집계가 비어 있어도 키워드 순위로 즉시 산출)
        const myTotalKeywords = myInfluencer.total_keywords || myRankingsList.length;
        const myTop3Count = myRankingsList.filter(r => r.rank_position <= 3).length;
        const myTop10Count = myRankingsList.filter(r => r.rank_position <= 10).length;
        const myAvgRank = myTotalKeywords > 0
          ? myRankingsList.reduce((s, r) => s + r.rank_position, 0) / myTotalKeywords
          : 0;
        myStats = {
          totalKeywords: myTotalKeywords,
          top3Count: myTop3Count,
          top10Count: myTop10Count,
          avgRank: Math.round(myAvgRank * 10) / 10,
        };

        // 겹치는 키워드 찾기
        const sharedKeywordIds: string[] = [];
        const sharedRankData: { keyword_id: string; myRank: number; competitorRank: number }[] = [];
        for (const cr of competitorRankings) {
          if (myRankMap.has(cr.keyword_id)) {
            sharedKeywordIds.push(cr.keyword_id);
            sharedRankData.push({
              keyword_id: cr.keyword_id,
              myRank: myRankMap.get(cr.keyword_id)!,
              competitorRank: cr.rank_position,
            });
          }
        }

        // 겹치는 키워드 이름 조회 (별도 쿼리)
        const kwNameMap = new Map<string, string>();
        if (sharedKeywordIds.length > 0) {
          // 500개씩 나눠서 조회
          for (let i = 0; i < sharedKeywordIds.length; i += 500) {
            const chunk = sharedKeywordIds.slice(i, i + 500);
            const { data: kwData } = await supabase
              .from('keyword_challenges')
              .select('id, keyword')
              .in('id', chunk);
            for (const kw of (kwData || [])) {
              kwNameMap.set(kw.id, kw.keyword);
            }
          }
        }

        sharedKeywords = sharedRankData.map(sr => ({
          keyword: kwNameMap.get(sr.keyword_id) || sr.keyword_id,
          keyword_id: sr.keyword_id,
          myRank: sr.myRank,
          competitorRank: sr.competitorRank,
        }));

        sharedKeywords.sort((a, b) => (a.myRank || 999) - (b.myRank || 999));
      }
    }

    return NextResponse.json({
      competitor: {
        naverId: competitor.naver_id,
        displayName: competitor.display_name,
        imageUrl: competitor.image_url,
        category: competitor.my_keyword_category || competitor.category,
        subscriberCount: competitor.subscriber_count || competitor.total_follower_count,
        firstSeenAt: competitor.naver_created_at || competitor.first_seen_at,
      },
      stats: {
        totalKeywords,
        top3Count,
        top10Count,
        avgRank: Math.round(avgRank * 10) / 10,
      },
      top5: competitorRankings.slice(0, 5),
      sharedKeywords,
      sharedCount: sharedKeywords.length,
      myStats,
      mySubscribers,
    });
  } catch {
    return NextResponse.json({ error: '경쟁자 데이터 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
