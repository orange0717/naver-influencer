import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * 경쟁자 키워드 변동 감지 API
 * GET /api/competitors/changes?naverId=competitor_id&myNaverId=my_id
 *
 * 겹치는 키워드에서 경쟁자의 진입/이탈/추월 이벤트를 감지
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const competitorId = searchParams.get('naverId');
    const myNaverId = searchParams.get('myNaverId');

    if (!competitorId || !myNaverId) {
      return NextResponse.json({ error: 'naverId, myNaverId 필요' }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 인플루언서 ID 조회
    const [{ data: competitor }, { data: myInf }] = await Promise.all([
      supabase.from('influencers').select('id').eq('naver_id', competitorId).single(),
      supabase.from('influencers').select('id').eq('naver_id', myNaverId).single(),
    ]);

    if (!competitor || !myInf) {
      return NextResponse.json({ changes: [] });
    }

    // 7일 기간 설정
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const sinceDate = weekAgo.toISOString().slice(0, 10);

    // 내 키워드 목록 (현재 순위 있는 것)
    const { data: myRankings } = await supabase
      .from('keyword_rankings')
      .select('keyword_id, rank_position, snapshot_date')
      .eq('influencer_id', myInf.id)
      .gte('snapshot_date', sinceDate)
      .order('snapshot_date', { ascending: false });

    if (!myRankings || myRankings.length === 0) {
      return NextResponse.json({ changes: [] });
    }

    // 내 키워드 ID 목록
    const myKeywordIds = [...new Set(myRankings.map(r => r.keyword_id))];

    // 경쟁자의 같은 키워드 순위 이력
    const { data: compRankings } = await supabase
      .from('keyword_rankings')
      .select('keyword_id, rank_position, snapshot_date, keyword_challenges!inner(keyword)')
      .eq('influencer_id', competitor.id)
      .in('keyword_id', myKeywordIds)
      .gte('snapshot_date', sinceDate)
      .order('snapshot_date', { ascending: false });

    if (!compRankings || compRankings.length === 0) {
      return NextResponse.json({ changes: [] });
    }

    // 날짜별 경쟁자 순위 그룹핑
    const compByDateKeyword = new Map<string, { rank: number; date: string }>();
    const compByKeyword = new Map<string, { rank: number; date: string }[]>();
    for (const r of compRankings) {
      const key = `${r.keyword_id}_${r.snapshot_date}`;
      if (!compByDateKeyword.has(key)) {
        compByDateKeyword.set(key, { rank: r.rank_position, date: r.snapshot_date });
      }
      const arr = compByKeyword.get(r.keyword_id) || [];
      arr.push({ rank: r.rank_position, date: r.snapshot_date });
      compByKeyword.set(r.keyword_id, arr);
    }

    // 내 순위도 날짜별 그룹핑
    const myByDateKeyword = new Map<string, number>();
    for (const r of myRankings) {
      const key = `${r.keyword_id}_${r.snapshot_date}`;
      if (!myByDateKeyword.has(key)) {
        myByDateKeyword.set(key, r.rank_position);
      }
    }

    // 변동 이벤트 감지
    interface ChangeEvent {
      keyword: string;
      keyword_id: string;
      changeType: 'entered' | 'exited' | 'overtook_me' | 'i_overtook';
      competitorRank: number | null;
      myRank: number | null;
      date: string;
    }

    const changes: ChangeEvent[] = [];

    for (const [kwId, history] of compByKeyword) {
      // 날짜순 정렬
      history.sort((a, b) => a.date.localeCompare(b.date));
      if (history.length < 2) continue;

      const kw = compRankings.find(r => r.keyword_id === kwId);
      const keyword = ((kw?.keyword_challenges as unknown as { keyword: string })?.keyword) || '';

      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const myRankCurr = myByDateKeyword.get(`${kwId}_${curr.date}`) || null;
        const myRankPrev = myByDateKeyword.get(`${kwId}_${prev.date}`) || null;

        // 추월 감지: 이전에는 내가 앞섰는데 지금은 경쟁자가 앞선 경우
        if (myRankPrev && myRankCurr && myRankPrev < prev.rank && myRankCurr > curr.rank) {
          changes.push({
            keyword,
            keyword_id: kwId,
            changeType: 'overtook_me',
            competitorRank: curr.rank,
            myRank: myRankCurr,
            date: curr.date,
          });
        }
        // 내가 추월: 이전에는 경쟁자가 앞섰는데 지금은 내가 앞선 경우
        else if (myRankPrev && myRankCurr && myRankPrev > prev.rank && myRankCurr < curr.rank) {
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
