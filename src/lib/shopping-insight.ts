/**
 * 네이버 데이터랩 쇼핑인사이트 인기검색어 (비공식 내부 endpoint)
 * 공식 OpenAPI에는 없으므로 datalab.naver.com 웹 endpoint 사용.
 */

const RANK_URL = 'https://datalab.naver.com/shoppingInsight/getCategoryKeywordRank.naver';
const REFERER = 'https://datalab.naver.com/shoppingInsight/sCategory.naver';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface ShoppingRankItem {
  rank: number;
  keyword: string;
  linkId?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function fetchCategoryKeywordRank(
  cid: string,
  startDate: string,
  endDate: string,
  count = 20,
): Promise<ShoppingRankItem[]> {
  const form = new URLSearchParams({
    cid,
    timeUnit: 'date',
    startDate,
    endDate,
    age: '',
    gender: '',
    device: '',
    page: '1',
    count: String(count),
  });

  // datalab.naver.com 내부 endpoint는 짧은 시간 다수 호출 시 429를 던짐 → 점진 백오프 재시도
  let res: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(RANK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': REFERER,
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
      },
      body: form.toString(),
    });
    if (res.status !== 429) break;
    await sleep(500 * (attempt + 1) + Math.floor(Math.random() * 250));
  }

  if (!res || !res.ok) {
    console.error(`[shopping-insight] rank fetch ${res?.status} (cid=${cid})`);
    return [];
  }

  const data = await res.json().catch(() => null);
  const ranks = data?.ranks;
  if (!Array.isArray(ranks)) return [];

  return ranks.map((r: { rank: number; keyword: string; linkId?: string }) => ({
    rank: r.rank,
    keyword: r.keyword,
    linkId: r.linkId,
  }));
}

/** 어제 기준 7일 윈도우 + 그 직전 7일 윈도우 */
export function getRecentWindows() {
  const today = new Date();
  const end = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    prevStartDate: prevStart.toISOString().slice(0, 10),
    prevEndDate: prevEnd.toISOString().slice(0, 10),
  };
}
