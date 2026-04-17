import { NextRequest, NextResponse } from 'next/server';
import googleTrends from 'google-trends-api';
import { createServiceClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const revalidate = 3600;

interface TimelineEntry {
  time: string;
  formattedAxisTime?: string;
  value: number[];
  hasData?: boolean[];
  formattedValue?: string[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = createServiceClient();

  const { data: kw } = await supabase
    .from('keyword_challenges')
    .select('keyword')
    .eq('id', id)
    .single();

  if (!kw?.keyword) {
    return NextResponse.json({ error: '키워드를 찾을 수 없습니다' }, { status: 404 });
  }

  const endTime = new Date();
  const startTime = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  try {
    const raw = await googleTrends.interestOverTime({
      keyword: kw.keyword,
      geo: 'KR',
      hl: 'ko',
      startTime,
      endTime,
    });

    let parsed: { default?: { timelineData?: TimelineEntry[] } };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({
        keyword: kw.keyword,
        trendData: [],
        summary: null,
        error: '구글 트렌드 응답 파싱 실패',
      });
    }

    const timeline = parsed?.default?.timelineData ?? [];
    const trendData = timeline.map(entry => ({
      date: new Date(Number(entry.time) * 1000).toISOString().split('T')[0],
      value: entry.value?.[0] ?? 0,
    }));

    const values = trendData.map(d => d.value);
    const peakValue = values.length ? Math.max(...values) : 0;
    const peakIndex = values.indexOf(peakValue);
    const first = values.slice(0, Math.max(1, Math.floor(values.length / 3)));
    const last = values.slice(-Math.max(1, Math.floor(values.length / 3)));
    const firstAvg = first.reduce((a, b) => a + b, 0) / (first.length || 1);
    const lastAvg = last.reduce((a, b) => a + b, 0) / (last.length || 1);
    const changePercent = firstAvg > 0 ? Math.round(((lastAvg - firstAvg) / firstAvg) * 100) : 0;
    const direction: 'up' | 'down' | 'stable' =
      changePercent > 5 ? 'up' : changePercent < -5 ? 'down' : 'stable';

    return NextResponse.json({
      keyword: kw.keyword,
      trendData,
      summary: {
        trend_direction: direction,
        trend_percentage: changePercent,
        peak_value: peakValue,
        peak_date: trendData[peakIndex]?.date || '',
      },
    });
  } catch (err) {
    console.error('구글 트렌드 조회 실패:', err);
    return NextResponse.json({
      keyword: kw.keyword,
      trendData: [],
      summary: null,
      error: '구글 트렌드 데이터를 가져올 수 없습니다 (차단 또는 네트워크 오류)',
    });
  }
}
