import { NextRequest, NextResponse } from 'next/server';
import { requireFeature } from '@/lib/guards/requireFeature';
import { assertCreditFor, chargeCreditIfEnabled } from '@/lib/credit-gate';
import { fetchNaverKeywordTool, mapNaverKeywordToResult, type NaverKeyword, type KeywordResult } from '@/lib/naver-searchad';
import { bulkKeywordLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_KEYWORDS = 100;
const BATCH_SIZE = 5;

async function fetchBatch(
  keywords: string[],
  apiKey: string,
  secretKey: string,
  customerId: string,
): Promise<KeywordResult[]> {
  let list: NaverKeyword[];
  try {
    list = await fetchNaverKeywordTool(keywords, apiKey, secretKey, customerId);
  } catch {
    // 배치 실패 시 해당 키워드 전부 not found 처리
    return keywords.map(k => ({
      keyword: k,
      monthlyPc: 0,
      monthlyMobile: 0,
      monthlyTotal: 0,
      competition: '-',
      found: false,
    }));
  }

  // 요청한 키워드와 정확히 일치하는 항목만 매핑
  const resultMap = new Map<string, NaverKeyword>();
  for (const item of list) {
    const rel = (item.relKeyword || '').trim();
    resultMap.set(rel, item);
  }

  return keywords.map(k => {
    const item = resultMap.get(k.trim());
    if (!item) return { keyword: k, monthlyPc: 0, monthlyMobile: 0, monthlyTotal: 0, competition: '-', found: false };
    // 입력한 키워드 원문을 그대로 유지 (Naver relKeyword 공백 처리 차이 방지)
    return { ...mapNaverKeywordToResult(item), keyword: k };
  });
}

export async function POST(request: NextRequest) {
  // 인플루언서 플랜 이상 필수
  const auth = await requireFeature(request, 'keywords.bulk');
  if (auth.error) return auth.error;

  // 1회 호출당 최대 100키워드 × 다중 배치. 유료 회원의 자동화 남용으로 네이버
  // 검색광고 API 쿼터가 소진되지 않도록 사용자 단위 상한 적용.
  if (await bulkKeywordLimiter.check(`bulkvol:${auth.authUser.userId}`)) {
    return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  let body: { keywords?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const raw = body.keywords;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: '키워드 목록을 입력해주세요.' }, { status: 400 });
  }

  const keywords: string[] = raw
    .map((k: unknown) => (typeof k === 'string' ? k.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);

  if (keywords.length === 0) {
    return NextResponse.json({ error: '유효한 키워드가 없습니다.' }, { status: 400 });
  }

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();

  if (!apiKey || !secretKey || !customerId) {
    return NextResponse.json({ error: 'API 키가 설정되지 않았습니다.' }, { status: 503 });
  }

  const creditDenied = await assertCreditFor(auth.authUser.userId, 'bulk_search_volume');
  if (creditDenied) return creditDenied;

  // 5개씩 배치 처리
  const results: KeywordResult[] = [];
  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE);
    const batchResults = await fetchBatch(batch, apiKey, secretKey, customerId);
    results.push(...batchResults);
    // API 레이트 리밋 보호
    if (i + BATCH_SIZE < keywords.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  await chargeCreditIfEnabled(auth.authUser.userId, 'bulk_search_volume'); // 성공 후 차감(미활성이면 no-op)
  return NextResponse.json({ results, total: results.length });
}
