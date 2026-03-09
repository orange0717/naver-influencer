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

  let trendData: { date: string; volume: number }[];

  if (history && history.length > 0) {
    // 실제 DB 데이터 사용
    trendData = history.map(h => ({
      date: h.period_start,
      volume: h.search_volume_total || 0,
    }));
  } else {
    // DB 데이터 없으면 추정 데이터 생성
    trendData = generateEstimatedTrend(
      kw.search_volume_monthly || 0,
      kw.trend_direction || 'stable',
    );
  }

  const volumes = trendData.map(d => d.volume);
  const maxVol = Math.max(...volumes, 0);
  const minVol = Math.min(...volumes, 0);

  return NextResponse.json({
    trendData,
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

function generateEstimatedTrend(monthlyVolume: number, direction: string) {
  const weeks = 12;
  const data = [];
  const multiplier = direction === 'up' ? 1.03 : direction === 'down' ? 0.97 : 1.0;

  let vol = (monthlyVolume / 4) * 0.7;
  for (let i = 0; i < weeks; i++) {
    const jitter = 0.85 + Math.random() * 0.3;
    vol = vol * multiplier * jitter;
    const d = new Date();
    d.setDate(d.getDate() - (weeks - i) * 7);
    data.push({
      date: d.toISOString().split('T')[0],
      volume: Math.round(vol),
    });
  }
  return data;
}
