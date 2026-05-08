import { NextRequest, NextResponse } from 'next/server';
import { findCategoryByCode } from '@/lib/shopping-categories';

export const runtime = 'nodejs';
export const revalidate = 1800; // 30분 캐시

const DATALAB_URL = 'https://openapi.naver.com/v1/datalab/shopping/categories';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ categoryCode: string }> },
) {
  const { categoryCode } = await params;
  const category = findCategoryByCode(categoryCode);

  if (!category) {
    return NextResponse.json({ error: '지원하지 않는 카테고리입니다.' }, { status: 404 });
  }

  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: '데이터랩 API 키 미설정' }, { status: 500 });
  }

  // 최근 30일 (어제 종료)
  const today = new Date();
  const end = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const endDate = end.toISOString().slice(0, 10);
  const startDate = start.toISOString().slice(0, 10);

  try {
    const res = await fetch(DATALAB_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: 'date',
        category: [{ name: category.name, param: [category.code] }],
        device: '',
        gender: '',
        ages: [],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[shopping-category-trend] ${res.status}:`, body);
      return NextResponse.json({ error: 'DataLab 호출 실패' }, { status: 502 });
    }

    const data = await res.json();
    const result = data?.results?.[0];
    const points = (result?.data ?? []) as { period: string; ratio: number }[];

    return NextResponse.json({
      category: { name: category.name, code: category.code },
      period: { startDate, endDate },
      points: points.map(p => ({
        date: p.period,
        ratio: Math.round(p.ratio * 10) / 10,
      })),
    });
  } catch (err) {
    console.error('[shopping-category-trend] fatal:', err);
    return NextResponse.json({ error: '트렌드 조회 중 오류' }, { status: 500 });
  }
}
