import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { requireInfluencerPlan } from '@/lib/admin';

export const dynamic = 'force-dynamic';

const MAX_KEYWORDS = 100;
const BATCH_SIZE = 5;

function generateSignature(timestamp: string, method: string, path: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${path}`;
  return createHmac('sha256', secretKey).update(message).digest('base64');
}

interface NaverKeyword {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx: string;
}

interface KeywordResult {
  keyword: string;
  monthlyPc: number | string;
  monthlyMobile: number | string;
  monthlyTotal: number | string;
  competition: string;
  found: boolean;
}

async function fetchBatch(
  keywords: string[],
  apiKey: string,
  secretKey: string,
  customerId: string,
): Promise<KeywordResult[]> {
  const timestamp = String(Date.now());
  const signature = generateSignature(timestamp, 'GET', '/keywordstool', secretKey);
  const hintParam = keywords.map(k => encodeURIComponent(k)).join(',');
  const url = `https://api.searchad.naver.com/keywordstool?hintKeywords=${hintParam}&showDetail=1`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': apiKey,
      'X-Customer': customerId,
      'X-Signature': signature,
    },
  });

  if (!res.ok) {
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

  const data = await res.json();
  const list: NaverKeyword[] = data.keywordList || [];

  // 요청한 키워드와 정확히 일치하는 항목만 매핑
  const resultMap = new Map<string, NaverKeyword>();
  for (const item of list) {
    const rel = (item.relKeyword || '').trim();
    resultMap.set(rel, item);
  }

  return keywords.map(k => {
    const item = resultMap.get(k.trim());
    if (!item) return { keyword: k, monthlyPc: 0, monthlyMobile: 0, monthlyTotal: 0, competition: '-', found: false };

    const pc = typeof item.monthlyPcQcCnt === 'number' ? item.monthlyPcQcCnt : 0;
    const mobile = typeof item.monthlyMobileQcCnt === 'number' ? item.monthlyMobileQcCnt : 0;
    const total = pc + mobile;

    let competition = '낮음';
    if (item.compIdx === 'HIGH') competition = '높음';
    else if (item.compIdx === 'MEDIUM') competition = '중간';

    return {
      keyword: k,
      monthlyPc: pc < 10 ? '< 10' : pc,
      monthlyMobile: mobile < 10 ? '< 10' : mobile,
      monthlyTotal: total < 10 ? '< 10' : total,
      competition,
      found: true,
    };
  });
}

export async function POST(request: NextRequest) {
  // 인플루언서 플랜 이상 필수
  const auth = await requireInfluencerPlan(request);
  if (auth.error) return auth.error;

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

  return NextResponse.json({ results, total: results.length });
}
