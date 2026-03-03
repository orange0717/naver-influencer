import { NextRequest, NextResponse } from 'next/server';
import { mockKeywords } from '@/data/mock-keywords';

function generateTrendData(baseVolume: number, direction: string) {
  const weeks = 12;
  const data = [];
  const multiplier = direction === 'up' ? 1.03 : direction === 'down' ? 0.97 : 1.0;

  let vol = baseVolume * 0.7;
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const kw = mockKeywords.find(k => k.id === id);

  if (!kw) {
    return NextResponse.json({ error: '키워드를 찾을 수 없습니다' }, { status: 404 });
  }

  const trendData = generateTrendData(kw.search_volume_monthly / 4, kw.trend_direction);
  const volumes = trendData.map(d => d.volume);

  return NextResponse.json({
    trendData,
    summary: {
      trend_direction: kw.trend_direction,
      trend_percentage: kw.trend_percentage,
      peak_volume: Math.max(...volumes),
      peak_date: trendData[volumes.indexOf(Math.max(...volumes))].date,
      lowest_volume: Math.min(...volumes),
      lowest_date: trendData[volumes.indexOf(Math.min(...volumes))].date,
    },
  });
}
