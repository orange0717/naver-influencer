/**
 * 인플루언서 리스트의 파생값 계산.
 *
 * 화면(InfluencersListClient)과 API(api/influencers) 양쪽에서 같은 값을 써야 하는데
 * 각자 따로 계산하고 있었다. 특히 '비율'은 정렬(서버)과 표시(화면)의 분자가 서로 달라서
 * 정렬을 눌러도 화면의 % 가 순서대로 보이지 않았다 — 사용자에겐 "정렬이 고장난" 화면이다.
 * 계산을 여기 한 곳으로 모으고 회귀 테스트를 붙인다. (topic-ai-check.ts 와 같은 이유:
 * 이 저장소 vitest 는 node 환경이라 컴포넌트 안의 로직은 테스트할 수 없다.)
 */

export interface Top3Source {
  integrated_top3_count?: unknown;
  top1_count?: unknown;
  top2_count?: unknown;
  top3_count?: unknown;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * 화면에 쓰는 TOP3 건수.
 *
 * `integrated_top3_count` 와 `top1~3_count` 는 갱신 주체가 다르다
 * (crawl-challenge-ranks 는 둘 다 쓰지만 scripts/bulk-crawl-details.mjs 는
 * integrated_top3_count 만 쓴다). 그래서 두 값은 갈라질 수 있고,
 * 어느 쪽을 쓰느냐에 따라 다른 숫자가 나온다. 표시와 정렬이 반드시 같은 것을 써야 한다.
 */
export function effectiveTop3(inf: Top3Source): number {
  const fromCol = num(inf.integrated_top3_count);
  const sum = num(inf.top1_count) + num(inf.top2_count) + num(inf.top3_count);
  return fromCol > 0 ? fromCol : sum;
}

/** 챌린지 대비 TOP3 비율. 모수가 없으면 비율이라는 게 성립하지 않으므로 null. */
export function top3Ratio(top3: number, totalKeywords: number): number | null {
  if (!Number.isFinite(totalKeywords) || totalKeywords <= 0) return null;
  return top3 / totalKeywords;
}

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const withinWindow = (d: string | null | undefined, now: number): boolean => {
  if (!d) return false;
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return false;
  const diff = now - t;
  return diff >= 0 && diff < NEW_WINDOW_MS;
};

export interface NewBadge {
  /** 'selected' 최근 선정 · 'discovered' 선정일을 몰라서 최초 발견일로 대신 판단 */
  basis: 'selected' | 'discovered';
  title: string;
}

/**
 * NEW 배지.
 *
 * 예전에는 `first_seen_at`(= 우리 DB가 이 사람을 처음 본 날)만 봤다. 그래서 2019년에
 * 선정된 사람을 우리가 지난주에 발굴하면, 화면에는 "선정일 2019년" 옆에 NEW 가 붙었다.
 * 사용자에겐 앞뒤가 안 맞는 표시다.
 *
 * 선정일을 알면 선정일로 판단한다. 선정일을 모를 때만 최초 발견일로 대신 판단하되,
 * 그게 추정이라는 걸 설명에 밝힌다 — 모르는 것을 아는 척하지 않는다.
 */
export function newBadge(
  naverCreatedAt: string | null | undefined,
  firstSeenAt: string | null | undefined,
  now: number = Date.now(),
): NewBadge | null {
  if (naverCreatedAt) {
    return withinWindow(naverCreatedAt, now)
      ? { basis: 'selected', title: '최근 30일 이내에 네이버 인플루언서로 선정되었습니다.' }
      : null;
  }
  if (withinWindow(firstSeenAt, now)) {
    return {
      basis: 'discovered',
      title: '선정일이 확인되지 않아 최근 30일 이내에 처음 발견된 것으로 표시합니다. 실제 선정일은 더 이전일 수 있습니다.',
    };
  }
  return null;
}

export const CHALLENGE_UNCOLLECTED_TITLE =
  '아직 이 인플루언서의 챌린지 순위를 수집하지 않았습니다. 참여 이력이 없다는 뜻이 아닙니다.';

/**
 * 챌린지 참여 수 표기.
 *
 * `total_keywords` 가 0 인 것은 두 가지다 — ① 정말 참여 이력이 없다 ② 아직 수집을 안 했다.
 * 수집을 한 적이 없으면(`last_crawled_at` 이 없음) 우리는 0 이라고 말할 근거가 없다.
 * 근거 없는 0 은 사용자에게 "이 사람은 챌린지를 한 번도 안 했다"로 읽힌다.
 */
export function formatChallengeCount(
  totalKeywords: number | null | undefined,
  lastCrawledAt: string | null | undefined,
): { text: string; uncollected: boolean } {
  const n = num(totalKeywords);
  if (n > 0) return { text: String(n), uncollected: false };
  if (!lastCrawledAt) return { text: '—', uncollected: true };
  return { text: '0', uncollected: false };
}

/** 목록에 실린 행들 중 가장 최근 수집 시각. 하나도 없으면 null(= 근거 없음). */
export function latestCrawledAt(rows: { lastCrawledAt?: string | null }[]): string | null {
  let best: number | null = null;
  let bestRaw: string | null = null;
  for (const r of rows) {
    if (!r.lastCrawledAt) continue;
    const t = new Date(r.lastCrawledAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (best === null || t > best) { best = t; bestRaw = r.lastCrawledAt; }
  }
  return bestRaw;
}
