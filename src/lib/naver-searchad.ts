import { createHmac } from 'crypto';

export interface NaverKeyword {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx: string;
}

export interface KeywordResult {
  keyword: string;
  monthlyPc: number | string;
  monthlyMobile: number | string;
  monthlyTotal: number | string;
  competition: string;
  found: boolean;
}

function generateSignature(timestamp: string, method: string, path: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${path}`;
  return createHmac('sha256', secretKey).update(message).digest('base64');
}

/** 네이버 검색광고 keywordstool API 호출 (단일/복수 hintKeywords 공용) */
export async function fetchNaverKeywordTool(
  hintKeywords: string[],
  apiKey: string,
  secretKey: string,
  customerId: string,
): Promise<NaverKeyword[]> {
  const timestamp = String(Date.now());
  const signature = generateSignature(timestamp, 'GET', '/keywordstool', secretKey);
  const hintParam = hintKeywords.map(k => encodeURIComponent(k)).join(',');
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
    throw new Error(`Naver keywordstool API ${res.status}`);
  }

  const data = await res.json();
  return data.keywordList || [];
}

export function mapNaverKeywordToResult(item: NaverKeyword): KeywordResult {
  const pc = typeof item.monthlyPcQcCnt === 'number' ? item.monthlyPcQcCnt : 0;
  const mobile = typeof item.monthlyMobileQcCnt === 'number' ? item.monthlyMobileQcCnt : 0;
  const total = pc + mobile;

  let competition = '낮음';
  if (item.compIdx === 'HIGH') competition = '높음';
  else if (item.compIdx === 'MEDIUM') competition = '중간';

  return {
    keyword: (item.relKeyword || '').trim(),
    monthlyPc: pc < 10 ? '< 10' : pc,
    monthlyMobile: mobile < 10 ? '< 10' : mobile,
    monthlyTotal: total < 10 ? '< 10' : total,
    competition,
    found: true,
  };
}
