import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';
import { getAuthUser } from '@/lib/auth';
import { extKeywordAnalysisLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const SEARCHAD_API_URL = 'https://api.searchad.naver.com/keywordstool';
const DATALAB_API_URL = 'https://openapi.naver.com/v1/datalab/search';

const ALLOWED_ORIGINS = [
  'https://ninfle.kr',
  'chrome-extension://',
];

const EXT_CLIENT_HEADER = 'extension/2.1';

function isAllowedExtClient(request: NextRequest): boolean {
  const client = request.headers.get('x-ninfle-client') || '';
  if (client === EXT_CLIENT_HEADER) return true;

  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o) || referer.startsWith(o));
}

function getCorsHeaders(request?: NextRequest) {
  const origin = request?.headers.get('origin') || '';
  const allowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

// ── 캐시 (5분 TTL, 최대 500개) ──
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 500;

function getCached(key: string) {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// ── Search Ads API ──
async function fetchSearchVolume(keyword: string) {
  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();
  if (!apiKey || !secretKey || !customerId) return null;

  const timestamp = Date.now().toString();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const msgData = encoder.encode(`${timestamp}.GET./keywordstool`);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const url = `${SEARCHAD_API_URL}?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`;
  const res = await fetch(url, {
    headers: { 'X-Timestamp': timestamp, 'X-API-KEY': apiKey, 'X-Customer': customerId, 'X-Signature': sig },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.keywordList || [];
}

// ── DataLab API (트렌드) ──
async function fetchTrend(keyword: string) {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

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
      timeUnit: 'week',
      keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const group = data.results?.[0];
  const points = group?.data || [];
  if (points.length < 2) return { direction: 'stable' as const, change: 0 };

  const recent = points[points.length - 1].ratio;
  const prev = points[points.length - 2].ratio;
  const pct = prev > 0 ? ((recent - prev) / prev) * 100 : 0;

  let direction: 'up' | 'down' | 'stable';
  if (pct > 5) direction = 'up';
  else if (pct < -5) direction = 'down';
  else direction = 'stable';

  return { direction, change: Math.round(pct * 10) / 10 };
}

// ── DB에서 경쟁도 가중 점수 조회 ──
async function fetchCompetitionScore(keyword: string, searchVolume: number) {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('keyword_challenges')
      .select('participant_count, first_seen_at')
      .ilike('keyword', keyword)
      .limit(1)
      .single();

    if (!data) return null;

    const participants = data.participant_count || 0;
    let score = 0;

    // 참여자 수 점수 (0~100) × 0.6
    const participantScore = Math.min(100, (participants / 150) * 100);
    score += participantScore * 0.6;

    // 검색량 대비 참여율 × 0.25
    if (searchVolume > 0) {
      const ratio = participants / searchVolume;
      score += Math.min(100, ratio * 500) * 0.25;
    } else {
      score += participantScore * 0.25;
    }

    // 등록 시점 × 0.15
    if (data.first_seen_at) {
      const days = (Date.now() - new Date(data.first_seen_at).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, Math.min(100, 100 - (days / 365) * 80)) * 0.15;
    } else {
      score += 50 * 0.15;
    }

    const rounded = Math.round(score);
    let level: string;
    if (rounded >= 60) level = '높음';
    else if (rounded >= 30) level = '중간';
    else level = '낮음';

    return { level, score: rounded, participants };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  if (await extKeywordAnalysisLimiter.check(ip)) {
    return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429, headers: getCorsHeaders(request) });
  }

  const authUser = await getAuthUser(request);
  if (!authUser && !isAllowedExtClient(request)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401, headers: getCorsHeaders(request) });
  }

  const keyword = request.nextUrl.searchParams.get('keyword');
  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400, headers: getCorsHeaders(request) });
  }

  // 캐시 확인
  const cacheKey = keyword.toLowerCase().trim();
  const cached = getCached(cacheKey);
  if (cached) {
    return NextResponse.json(cached, { headers: getCorsHeaders(request) });
  }

  try {
    // 병렬 호출: 검색량 + 트렌드
    const [keywordList, trend] = await Promise.all([
      fetchSearchVolume(keyword),
      fetchTrend(keyword),
    ]);

    if (!keywordList || keywordList.length === 0) {
      return NextResponse.json({ error: '검색량 데이터를 불러올 수 없습니다.' }, { status: 502, headers: getCorsHeaders(request) });
    }

    const main = keywordList[0];
    const pc = typeof main.monthlyPcQcCnt === 'number' ? main.monthlyPcQcCnt : 0;
    const mobile = typeof main.monthlyMobileQcCnt === 'number' ? main.monthlyMobileQcCnt : 0;
    const total = pc + mobile;

    // 경쟁도: DB 가중 점수 시도, 실패 시 compIdx 폴백
    let competition = await fetchCompetitionScore(keyword, total);
    if (!competition) {
      const comp = main.compIdx as string;
      let level = '낮음';
      let score = 20;
      if (comp === 'HIGH') { level = '높음'; score = 75; }
      else if (comp === 'MEDIUM') { level = '중간'; score = 45; }
      competition = { level, score, participants: 0 };
    }

    // 연관검색어 (첫 번째 제외, 최대 10개)
    const related = keywordList.slice(1, 11).map((kw: Record<string, unknown>) => {
      const kwPc = typeof kw.monthlyPcQcCnt === 'number' ? kw.monthlyPcQcCnt : 0;
      const kwMobile = typeof kw.monthlyMobileQcCnt === 'number' ? kw.monthlyMobileQcCnt : 0;
      const comp = kw.compIdx as string;
      let kwLevel = '낮음';
      if (comp === 'HIGH') kwLevel = '높음';
      else if (comp === 'MEDIUM') kwLevel = '중간';

      return {
        keyword: kw.relKeyword,
        total: kwPc + kwMobile || 0,
        competition: kwLevel,
      };
    });

    const result = {
      keyword: main.relKeyword || keyword,
      volume: { total: total || 0, pc: pc || 0, mobile: mobile || 0 },
      competition,
      trend: trend || { direction: 'stable', change: 0 },
      related,
    };

    setCache(cacheKey, result);
    return NextResponse.json(result, { headers: getCorsHeaders(request) });
  } catch (err) {
    console.error('[keyword-analysis] error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: '분석에 실패했습니다.' }, { status: 500, headers: getCorsHeaders(request) });
  }
}
