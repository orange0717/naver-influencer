import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createServiceClient();

  // 키워드 정보 조회
  const { data: kw } = await supabase
    .from('keyword_challenges')
    .select('keyword, search_volume_monthly, trend_direction, trend_percentage')
    .eq('id', id)
    .single();

  if (!kw) {
    return NextResponse.json({ error: '키워드를 찾을 수 없습니다' }, { status: 404 });
  }

  // search_volume_history에서 실제 데이터 조회
  const { data: history } = await supabase
    .from('search_volume_history')
    .select('period_start, search_volume_total')
    .eq('keyword_id', id)
    .order('period_start', { ascending: true })
    .limit(12);

  // 실제 search_volume_history가 있을 때만 추이를 반환한다.
  // 과거: 데이터가 없으면 Math.random() 지터로 12주치 검색량·피크 날짜를 지어내
  // 실데이터와 동일한 형태로 내보냈다 → 사용자가 조작된 값을 실제 추이로 오인.
  // 데이터가 없으면 빈 배열을 반환하고, 소비처(Client.tsx)는 차트를 숨긴다(데이터 없음 상태).
  if (!history || history.length === 0) {
    return NextResponse.json({
      trendData: [],
      isEstimated: false,
      summary: null,
    });
  }

  const trendData = history.map(h => ({
    date: h.period_start,
    volume: h.search_volume_total || 0,
  }));

  const volumes = trendData.map(d => d.volume);
  const maxVol = Math.max(...volumes, 0);
  const minVol = Math.min(...volumes, 0);

  return NextResponse.json({
    trendData,
    isEstimated: false,
    summary: {
      trend_direction: kw.trend_direction || 'stable',
      trend_percentage: kw.trend_percentage || 0,
      peak_volume: maxVol,
      peak_date: trendData[volumes.indexOf(maxVol)]?.date || '',
      lowest_volume: minVol,
      lowest_date: trendData[volumes.indexOf(minVol)]?.date || '',
    },
  });
}
