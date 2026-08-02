import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { keywordRecommendLimiter, getClientIp } from '@/lib/rate-limit';
import { fetchNaverKeywordTool } from '@/lib/naver-searchad';
import {
  fetchTrendBatch,
  fetchBlogCounts,
  fetchAiBriefingExposedSet,
  fetchCompetitionScoresBulk,
  competitionFromCompIdx,
  computeScoreAndReasons,
  type RecommendedKeyword,
} from '@/lib/keyword-recommend';

export const dynamic = 'force-dynamic';

const MAX_RELATED = 10;

export async function GET(request: NextRequest) {
  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  const ip = getClientIp(request);
  if (await keywordRecommendLimiter.check(ip)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  const keyword = request.nextUrl.searchParams.get('keyword')?.trim();
  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
  }

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();
  if (!apiKey || !secretKey || !customerId) {
    return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 503 });
  }

  // 검색광고 API는 공백 포함 hintKeywords를 허용하지 않음
  const naverHint = keyword.replace(/\s+/g, '');
  if (!naverHint) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
  }

  let rawList;
  try {
    rawList = await fetchNaverKeywordTool([naverHint], apiKey, secretKey, customerId);
  } catch (err) {
    console.error('[keywords/recommend] Naver API 호출 실패:', err);
    return NextResponse.json({ error: 'API 연결에 실패했습니다.' }, { status: 502 });
  }

  if (!rawList || rawList.length === 0) {
    return NextResponse.json({ error: '검색 결과가 없습니다.' }, { status: 404 });
  }

  // 첫 항목(입력 키워드 자신)은 제외하고 연관 키워드만 추천 대상으로 사용
  const candidates = rawList.slice(1, MAX_RELATED + 1);
  if (candidates.length === 0) {
    return NextResponse.json({ error: '추천할 연관 키워드가 없습니다.' }, { status: 404 });
  }

  const candidateKeywords = candidates.map((c) => (c.relKeyword || '').trim()).filter(Boolean);

  const [trendMap, blogCountMap, aiBriefingSet, competitionMap] = await Promise.all([
    fetchTrendBatch(candidateKeywords),
    fetchBlogCounts(candidateKeywords),
    fetchAiBriefingExposedSet(candidateKeywords),
    fetchCompetitionScoresBulk(candidateKeywords),
  ]);

  const recommendations: RecommendedKeyword[] = candidates.map((item) => {
    const kw = (item.relKeyword || '').trim();
    const pc = typeof item.monthlyPcQcCnt === 'number' ? item.monthlyPcQcCnt : 0;
    const mobile = typeof item.monthlyMobileQcCnt === 'number' ? item.monthlyMobileQcCnt : 0;
    const total = pc + mobile;

    const competition = competitionMap.get(kw) || competitionFromCompIdx(item.compIdx);
    const trend = trendMap.get(kw) || { direction: 'stable' as const, change: 0 };
    const blogCount = blogCountMap.has(kw) ? blogCountMap.get(kw)! : null;
    const aiBriefingExposed = aiBriefingSet.has(kw);

    const { score, reasons } = computeScoreAndReasons({
      volumeTotal: total,
      competition,
      trend,
      blogCount,
      aiBriefingExposed,
    });

    return {
      keyword: kw,
      volume: { total, pc, mobile },
      competition,
      trend,
      blogCount,
      aiBriefingExposed,
      score,
      reasons,
    };
  });

  recommendations.sort((a, b) => b.score - a.score);

  return NextResponse.json({ keyword, searchedKeyword: naverHint, recommendations });
}
