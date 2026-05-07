import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getCookieUser } from '@/lib/auth';
import type { CompetitorChangeEvent } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * 경쟁자 키워드 변동 감지 API
 * GET /api/competitors/changes?naverId=competitor_id[&myNaverId=my_id]
 *
 * myNaverId 있음: 겹치는 키워드에서 진입/이탈/추월 이벤트
 * myNaverId 없음: 경쟁자의 모든 키워드에서 진입/이탈만
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

    if (!competitorId) {
      return NextResponse.json({ error: 'naverId 필요' }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: competitor } = await supabase
      .from('influencers').select('id').eq('naver_id', competitorId).single();
    if (!competitor) {
      return NextResponse.json({ changes: [] });
    }

    let myInfId: string | null = null;
    if (myNaverId) {
      const { data: myInf } = await supabase
        .from('influencers').select('id').eq('naver_id', myNaverId).single();
      if (myInf) myInfId = myInf.id;
    }

    // 7일 기간 설정
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const sinceDate = weekAgo.toISOString().slice(0, 10);

    // 내 키워드 목록 (myInfId 있을 때만)
    let myKeywordIds: string[] = [];
    const myByDateKeyword = new Map<string, number>();
    if (myInfId) {
      const { data: myRankings } = await supabase
        .from('keyword_rankings')
        .select('keyword_id, rank_position, snapshot_date')
        .eq('influencer_id', myInfId)
        .gte('snapshot_date', sinceDate)
        .order('snapshot_date', { ascending: false });

      if (myRankings && myRankings.length > 0) {
        myKeywordIds = [...new Set(myRankings.map(r => r.keyword_id))];
        for (const r of myRankings) {
          const key = `${r.keyword_id}_${r.snapshot_date}`;
          if (!myByDateKeyword.has(key)) {
            myByDateKeyword.set(key, r.rank_position);
          }
        }
      }
    }

    // 경쟁자의 키워드 순위 이력
    let compRankingsQuery = supabase
      .from('keyword_rankings')
      .select('keyword_id, rank_position, snapshot_date, keyword_challenges!inner(keyword)')
      .eq('influencer_id', competitor.id)
      .gte('snapshot_date', sinceDate)
      .order('snapshot_date', { ascending: false });

    // myNaverId 있을 때만 겹치는 키워드 필터
    if (myInfId && myKeywordIds.length > 0) {
      compRankingsQuery = compRankingsQuery.in('keyword_id', myKeywordIds);
    }

    const { data: compRankings } = await compRankingsQuery;

    if (!compRankings || compRankings.length === 0) {
      return NextResponse.json({ changes: [] });
    }

    // 날짜별 경쟁자 순위 그룹핑
    const compByKeyword = new Map<string, { rank: number; date: string }[]>();
    for (const r of compRankings) {
      const arr = compByKeyword.get(r.keyword_id) || [];
      arr.push({ rank: r.rank_position, date: r.snapshot_date });
      compByKeyword.set(r.keyword_id, arr);
    }

    // 변동 이벤트 감지
    const changes: CompetitorChangeEvent[] = [];

    // 추월 분기: myInfId 있을 때만 (단독 모드에선 건너뜀)
    if (myInfId) {
      for (const [kwId, history] of compByKeyword) {
        history.sort((a, b) => a.date.localeCompare(b.date));
        if (history.length < 2) continue;

        const kw = compRankings.find(r => r.keyword_id === kwId);
        const keyword = ((kw?.keyword_challenges as unknown as { keyword: string })?.keyword) || '';

        for (let i = 1; i < history.length; i++) {
          const prev = history[i - 1];
          const curr = history[i];
          const myRankCurr = myByDateKeyword.get(`${kwId}_${curr.date}`) || null;
          const myRankPrev = myByDateKeyword.get(`${kwId}_${prev.date}`) || null;

          if (myRankPrev && myRankCurr && myRankPrev < prev.rank && myRankCurr > curr.rank) {
            changes.push({
              keyword,
              keyword_id: kwId,
              changeType: 'overtook_me',
              competitorRank: curr.rank,
              myRank: myRankCurr,
              date: curr.date,
            });
          } else if (myRankPrev && myRankCurr && myRankPrev > prev.rank && myRankCurr < curr.rank) {
            changes.push({
              keyword,
              keyword_id: kwId,
              changeType: 'i_overtook',
              competitorRank: curr.rank,
              myRank: myRankCurr,
              date: curr.date,
            });
          }
        }
      }
    }

    // 진입/이탈: 최신 날짜에 있고 이전에 없으면 진입, 이전에 있고 최신에 없으면 이탈
    const dates = [...new Set(compRankings.map(r => r.snapshot_date))].sort();
    if (dates.length >= 2) {
      const latestDate = dates[dates.length - 1];
      const prevDate = dates[dates.length - 2];

      const latestKwIds = new Set(
        compRankings.filter(r => r.snapshot_date === latestDate).map(r => r.keyword_id)
      );
      const prevKwIds = new Set(
        compRankings.filter(r => r.snapshot_date === prevDate).map(r => r.keyword_id)
      );

      for (const kwId of latestKwIds) {
        if (!prevKwIds.has(kwId)) {
          const rec = compRankings.find(r => r.keyword_id === kwId && r.snapshot_date === latestDate);
          if (rec) {
            const keyword = ((rec.keyword_challenges as unknown as { keyword: string })?.keyword) || '';
            const myRank = myByDateKeyword.get(`${kwId}_${latestDate}`) || null;
            changes.push({
              keyword,
              keyword_id: kwId,
              changeType: 'entered',
              competitorRank: rec.rank_position,
              myRank,
              date: latestDate,
            });
          }
        }
      }

      for (const kwId of prevKwIds) {
        if (!latestKwIds.has(kwId)) {
          const rec = compRankings.find(r => r.keyword_id === kwId && r.snapshot_date === prevDate);
          if (rec) {
            const keyword = ((rec.keyword_challenges as unknown as { keyword: string })?.keyword) || '';
            changes.push({
              keyword,
              keyword_id: kwId,
              changeType: 'exited',
              competitorRank: null,
              myRank: null,
              date: latestDate,
            });
          }
        }
      }
    }

    // 최신순 정렬
    changes.sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ changes });
  } catch {
    return NextResponse.json({ error: '변동 데이터 조회 실패' }, { status: 500 });
  }
}
