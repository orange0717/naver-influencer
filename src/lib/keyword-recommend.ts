/**
 * 키워드 추천 — 연관 키워드에 검색량/경쟁도/트렌드/블로그 발행량/AI브리핑 노출 여부를
 * 붙여서 "지금 써야 하는 키워드"를 점수화한다.
 */
import { createServiceClient } from './supabase-server';

export interface RecommendedKeyword {
  keyword: string;
  volume: { total: number; pc: number; mobile: number };
  competition: { level: '낮음' | '중간' | '높음'; score: number };
  trend: { direction: 'up' | 'down' | 'stable'; change: number };
  blogCount: number | null;
  aiBriefingExposed: boolean;
  score: number;
  reasons: string[];
}

const DATALAB_API_URL = 'https://openapi.naver.com/v1/datalab/search';
const BLOG_SEARCH_API_URL = 'https://openapi.naver.com/v1/search/blog.json';
const DATALAB_GROUP_SIZE = 5;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** DataLab은 요청당 keywordGroups 최대 5개까지만 지원 — 5개씩 묶어서 배치 호출 */
export async function fetchTrendBatch(
  keywords: string[],
): Promise<Map<string, { direction: 'up' | 'down' | 'stable'; change: number }>> {
  const result = new Map<string, { direction: 'up' | 'down' | 'stable'; change: number }>();
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID;
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET;
  if (!clientId || !clientSecret || keywords.length === 0) return result;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const body = {
    startDate: startDate.toISOString().slice(0, 10),
    endDate: endDate.toISOString().slice(0, 10),
    timeUnit: 'week',
  };

  await Promise.all(
    chunk(keywords, DATALAB_GROUP_SIZE).map(async (group) => {
      try {
        const res = await fetch(DATALAB_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret,
          },
          body: JSON.stringify({
            ...body,
            keywordGroups: group.map((k) => ({ groupName: k, keywords: [k] })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const r of data.results || []) {
          // DataLab 응답은 요청 시 보낸 groupName을 title 필드로 그대로 돌려준다 (groupName 필드는 없음)
          const points = r.data || [];
          if (points.length < 2) {
            result.set(r.title, { direction: 'stable', change: 0 });
            continue;
          }
          const recent = points[points.length - 1].ratio;
          const prev = points[points.length - 2].ratio;
          const pct = prev > 0 ? ((recent - prev) / prev) * 100 : 0;
          let direction: 'up' | 'down' | 'stable' = 'stable';
          if (pct > 5) direction = 'up';
          else if (pct < -5) direction = 'down';
          result.set(r.title, { direction, change: Math.round(pct * 10) / 10 });
        }
      } catch {
        // 배치 하나 실패해도 나머지는 계속 진행 — 실패분은 stable 기본값으로 처리됨
      }
    }),
  );

  return result;
}

/** 각 키워드의 블로그 검색 전체 발행량(data.total)을 조회 */
export async function fetchBlogCounts(keywords: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return result;

  await Promise.all(
    keywords.map(async (kw) => {
      try {
        const url = `${BLOG_SEARCH_API_URL}?query=${encodeURIComponent(kw)}&display=1`;
        const res = await fetch(url, {
          headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.total === 'number') result.set(kw, data.total);
      } catch {
        // 개별 실패는 무시 — 해당 키워드는 blogCount null로 남음
      }
    }),
  );

  return result;
}

/**
 * AI브리핑 노출 여부 — 실시간 헤드리스 브라우저 체크는 ToS/부하 리스크로 배치 실행 불가하므로
 * (src/lib/naver-ai-briefing.ts 참고), 이미 다른 사용자가 확인해둔 ai_briefing_exposures 기록을
 * 크라우드소싱 신호로 재사용한다. 데이터가 없는 키워드는 "미확인"이 아니라 false로 처리된다.
 */
export async function fetchAiBriefingExposedSet(keywords: string[]): Promise<Set<string>> {
  const exposed = new Set<string>();
  if (keywords.length === 0) return exposed;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('ai_briefing_exposures')
      .select('keyword, has_ai_briefing, has_ai_tab')
      .in('keyword', keywords)
      .or('has_ai_briefing.eq.true,has_ai_tab.eq.true');

    for (const row of data || []) {
      if (row.keyword) exposed.add(row.keyword);
    }
  } catch {
    // 조회 실패 시 전부 미노출로 처리 (기능 전체를 막지 않음)
  }

  return exposed;
}

/** keyword_challenges 참여자 데이터 기반 경쟁도 가중 점수 (없으면 null — compIdx 폴백은 호출부에서) */
export async function fetchCompetitionScoresBulk(
  keywords: string[],
): Promise<Map<string, { level: '낮음' | '중간' | '높음'; score: number }>> {
  const result = new Map<string, { level: '낮음' | '중간' | '높음'; score: number }>();
  if (keywords.length === 0) return result;

  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('keyword_challenges')
      .select('keyword, participant_count, first_seen_at, search_volume_monthly')
      .in('keyword', keywords);

    for (const row of data || []) {
      const participants = row.participant_count || 0;
      const volume = row.search_volume_monthly || 0;
      let score = 0;
      score += Math.min(100, (participants / 150) * 100) * 0.6;
      score += (volume > 0 ? Math.min(100, (participants / volume) * 500) : Math.min(100, (participants / 150) * 100)) * 0.25;
      if (row.first_seen_at) {
        const days = (Date.now() - new Date(row.first_seen_at).getTime()) / (1000 * 60 * 60 * 24);
        score += Math.max(0, Math.min(100, 100 - (days / 365) * 80)) * 0.15;
      } else {
        score += 50 * 0.15;
      }
      const rounded = Math.round(score);
      const level = rounded >= 60 ? '높음' : rounded >= 30 ? '중간' : '낮음';
      result.set(row.keyword, { level, score: rounded });
    }
  } catch {
    // 실패 시 compIdx 폴백만 사용
  }

  return result;
}

/**
 * compIdx → 한글 레벨 + 대략 점수 폴백.
 * 검색광고 keywordstool API는 계정에 따라 'HIGH'/'MEDIUM'/'LOW' 영문 enum이 아니라
 * '높음'/'중간'/'낮음' 한글 문자열을 그대로 내려주기도 한다(실측 확인, 2026-08-01) — 양쪽 다 처리.
 */
export function competitionFromCompIdx(compIdx: string | undefined): { level: '낮음' | '중간' | '높음'; score: number } {
  if (compIdx === 'HIGH' || compIdx === '높음') return { level: '높음', score: 75 };
  if (compIdx === 'MEDIUM' || compIdx === '중간') return { level: '중간', score: 45 };
  return { level: '낮음', score: 20 };
}

export function computeScoreAndReasons(input: {
  volumeTotal: number;
  competition: { level: '낮음' | '중간' | '높음'; score: number };
  trend: { direction: 'up' | 'down' | 'stable'; change: number };
  blogCount: number | null;
  aiBriefingExposed: boolean;
}): { score: number; reasons: string[] } {
  const { volumeTotal, competition, trend, blogCount, aiBriefingExposed } = input;
  const reasons: string[] = [];

  const volumeScore = volumeTotal >= 50000 ? 15 : volumeTotal >= 1000 ? 30 : volumeTotal >= 100 ? 20 : 10;

  const competitionScore = competition.level === '낮음' ? 30 : competition.level === '중간' ? 15 : 5;
  if (competition.level === '낮음') reasons.push('경쟁도 낮음');

  const trendScore = trend.direction === 'up' ? 20 : trend.direction === 'stable' ? 10 : 0;
  if (trend.direction === 'up') reasons.push('검색량 증가중');

  let blueOceanScore = 10;
  if (blogCount !== null) {
    const ratio = blogCount > 0 ? volumeTotal / blogCount : volumeTotal > 0 ? 1 : 0;
    blueOceanScore = Math.max(0, Math.min(20, ratio * 4));
    if (ratio >= 2 || (blogCount < 3000 && volumeTotal >= 100)) reasons.push('블로그 발행량 적음');
  }

  const aiBriefingScore = aiBriefingExposed ? 10 : 0;
  if (aiBriefingExposed) reasons.push('AI브리핑 노출중');

  const score = Math.round(
    Math.min(100, volumeScore + competitionScore + trendScore + blueOceanScore + aiBriefingScore),
  );

  return { score, reasons };
}
