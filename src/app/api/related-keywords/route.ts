import { NextRequest, NextResponse } from 'next/server';
import { requireInfluencerPlan } from '@/lib/admin';
import { fetchNaverKeywordTool, mapNaverKeywordToResult } from '@/lib/naver-searchad';
import { bulkKeywordLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const ALLOWED_LIMITS = [100, 300, 500, 1000];
const DEFAULT_LIMIT = 1000;

export async function POST(request: NextRequest) {
  // 인플루언서 플랜 이상 필수 (대량 키워드 조회와 동일한 게이트 유지)
  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

  // 유료 회원이라도 자동화로 네이버 검색광고 API 쿼터를 소진하지 못하도록 사용자 단위 상한
  if (await bulkKeywordLimiter.check(`relkw:${auth.authUser.userId}`)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  let body: { keyword?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
  }

  const requestedLimit = Number(body.limit);
  const limit = ALLOWED_LIMITS.includes(requestedLimit) ? requestedLimit : DEFAULT_LIMIT;

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();

  if (!apiKey || !secretKey || !customerId) {
    return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 503 });
  }

  // 네이버 키워드도구 hintKeywords는 공백 포함 문자열을 허용하지 않음(400 BAD_REQUEST) —
  // 검색광고 시스템의 키워드가 공백 없는 형태로 등록되어 있기 때문. 공백만 제거해 조회하고
  // 실제 조회에 사용한 키워드는 응답에 그대로 노출한다(입력값을 몰래 다른 키워드로 바꾸지 않기 위함).
  const naverHint = keyword.replace(/\s+/g, '');
  if (!naverHint) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400 });
  }

  let list;
  try {
    list = await fetchNaverKeywordTool([naverHint], apiKey, secretKey, customerId);
  } catch (err) {
    console.error('[related-keywords] Naver API 호출 실패:', err);
    return NextResponse.json({ error: 'API 연결에 실패했습니다.' }, { status: 502 });
  }

  if (!list || list.length === 0) {
    return NextResponse.json({ error: '검색 결과가 없습니다.' }, { status: 404 });
  }

  const results = list.slice(0, limit).map(mapNaverKeywordToResult);

  return NextResponse.json({ keyword, searchedKeyword: naverHint, results, total: results.length });
}
