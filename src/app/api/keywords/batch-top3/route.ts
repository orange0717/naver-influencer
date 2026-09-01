import { NextRequest, NextResponse } from 'next/server';
import { fetchRankings } from '@/lib/naver-api';
import { requireFeature } from '@/lib/guards/requireFeature';

export const dynamic = 'force-dynamic';

/**
 * GET /api/keywords/batch-top3?keywords=추천도서,책추천,북리뷰
 * 네이버 검색에서 각 키워드의 TOP 3 인플루언서를 가져옴
 * fetchRankings 내부 캐시 활용 (중복 요청 방지)
 */
export async function GET(request: NextRequest) {
  // 호출부는 /keywords 목록과 /my 대시보드 둘뿐이고 양쪽 다 인플루언서 전용이다.
  const gate = await requireFeature(request, 'keywords.challenge');
  if (gate.error) return gate.error;

  const keywordsParam = request.nextUrl.searchParams.get('keywords');
  if (!keywordsParam) {
    return NextResponse.json({ error: 'keywords parameter required' }, { status: 400 });
  }

  const keywords = keywordsParam.split(',').filter(Boolean).slice(0, 50); // 최대 50개
  if (keywords.length === 0) {
    return NextResponse.json({ top3: {} });
  }

  const top3: Record<string, { rank: number; name: string; naver_id: string }[]> = {};

  // 동시 5개씩 처리
  const CONCURRENCY = 5;
  for (let i = 0; i < keywords.length; i += CONCURRENCY) {
    const batch = keywords.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (kw) => {
        try {
          const rankings = await fetchRankings(kw);
          return {
            keyword: kw,
            top3: rankings.slice(0, 3).map(r => ({
              rank: r.rank,
              name: r.name,
              naver_id: r.naverId,
            })),
          };
        } catch {
          return { keyword: kw, top3: [] };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.top3.length > 0) {
        top3[result.value.keyword] = result.value.top3;
      }
    }
  }

  return NextResponse.json({ top3 });
}
