import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 1800; // 30분 캐시

const SHOPPING_INSIGHTS_URL = 'https://openapi.naver.com/v1/datalab/shopping/categories';

// 네이버 쇼핑 1차 카테고리
const CATEGORIES: { name: string; code: string }[] = [
  { name: '패션의류', code: '50000000' },
  { name: '패션잡화', code: '50000001' },
  { name: '화장품/미용', code: '50000002' },
  { name: '디지털/가전', code: '50000003' },
  { name: '가구/인테리어', code: '50000004' },
  { name: '출산/육아', code: '50000005' },
  { name: '식품', code: '50000006' },
  { name: '스포츠/레저', code: '50000007' },
  { name: '생활/건강', code: '50000008' },
  { name: '여가/생활편의', code: '50000009' },
  { name: '면세점', code: '50000010' },
  { name: '도서', code: '50005542' },
];

interface DatalabResult {
  title: string;
  data: { period: string; ratio: number }[];
}

async function fetchBatch(
  batch: { name: string; code: string }[],
  startDate: string,
  endDate: string,
  clientId: string,
  clientSecret: string,
): Promise<DatalabResult[]> {
  const res = await fetch(SHOPPING_INSIGHTS_URL, {
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
      category: batch.map(c => ({ name: c.name, param: [c.code] })),
      device: '',
      gender: '',
      ages: [],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(`[hot-categories] ${res.status}:`, errText);
    return [];
  }

  const data = await res.json();
  return data?.results ?? [];
}

export async function GET() {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      categories: [],
      error: '네이버 데이터랩 API 키가 설정되지 않았습니다.',
    });
  }

  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const startDate = new Date(today.getTime() - 13 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    // 쇼핑인사이트 API는 한 번에 최대 3개 카테고리 허용 → 배치 처리
    const batches: { name: string; code: string }[][] = [];
    for (let i = 0; i < CATEGORIES.length; i += 3) {
      batches.push(CATEGORIES.slice(i, i + 3));
    }

    const results = (
      await Promise.all(
        batches.map(b => fetchBatch(b, startDate, endDate, clientId, clientSecret)),
      )
    ).flat();

    // 각 카테고리별로 최근 7일 vs 이전 7일 평균 비교 → 상승률 계산
    const ranked = results
      .map(r => {
        const points = r.data || [];
        const half = Math.floor(points.length / 2);
        const prev = points.slice(0, half);
        const recent = points.slice(half);
        const prevAvg = prev.reduce((a, b) => a + b.ratio, 0) / (prev.length || 1);
        const recentAvg = recent.reduce((a, b) => a + b.ratio, 0) / (recent.length || 1);
        const changePercent =
          prevAvg > 0 ? Math.round(((recentAvg - prevAvg) / prevAvg) * 100) : 0;
        const peak = Math.max(...points.map(p => p.ratio), 0);
        return {
          name: r.title,
          change_percent: changePercent,
          recent_avg: Math.round(recentAvg * 10) / 10,
          peak: Math.round(peak * 10) / 10,
          timeline: points.slice(-7).map(p => ({
            date: p.period,
            ratio: Math.round(p.ratio * 10) / 10,
          })),
        };
      })
      .sort((a, b) => b.change_percent - a.change_percent);

    return NextResponse.json({
      period: { startDate, endDate },
      categories: ranked,
    });
  } catch (err) {
    console.error('핫 카테고리 조회 실패:', err);
    return NextResponse.json({
      categories: [],
      error: '네이버 데이터랩 API 호출 중 오류',
    });
  }
}
