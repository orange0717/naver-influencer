import { NextRequest, NextResponse } from 'next/server';
import { findKeywordById } from '@/lib/naver-api';

export const runtime = 'nodejs';
export const revalidate = 3600;

const DATALAB_API_URL = 'https://openapi.naver.com/v1/datalab/search';

interface DatalabPoint {
  period: string;
  ratio: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: '잘못된 키워드 ID입니다.' }, { status: 400 });
  }

  const found = await findKeywordById(id);
  if (!found) {
    return NextResponse.json({ error: '키워드를 찾을 수 없습니다' }, { status: 404 });
  }
  const keyword = found.keyword.name;

  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      keyword,
      trendData: [],
      summary: null,
      error: '네이버 데이터랩 API 키가 설정되지 않았습니다.',
    });
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  try {
    const res = await fetch(DATALAB_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      body: JSON.stringify({
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        timeUnit: 'date',
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[naver-trend] DataLab API ${res.status}:`, errText);
      return NextResponse.json({
        keyword,
        trendData: [],
        summary: null,
        error: `네이버 데이터랩 API 오류 (${res.status})`,
      });
    }

    const data = await res.json();
    const points: DatalabPoint[] = data?.results?.[0]?.data ?? [];
    const trendData = points.map(p => ({ date: p.period, ratio: Math.round(p.ratio * 10) / 10 }));

    const values = trendData.map(d => d.ratio);
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
      keyword,
      trendData,
      summary: {
        trend_direction: direction,
        trend_percentage: changePercent,
        peak_value: peakValue,
        peak_date: trendData[peakIndex]?.date || '',
      },
    });
  } catch (err) {
    console.error('네이버 트렌드 조회 실패:', err);
    return NextResponse.json({
      keyword,
      trendData: [],
      summary: null,
      error: '네이버 트렌드 데이터를 가져올 수 없습니다.',
    });
  }
}
