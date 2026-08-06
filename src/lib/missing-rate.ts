export interface MissingState {
  blogTab: { exposed: boolean | null; rank: number | null };
  viewTab: { exposed: boolean | null; rank: number | null };
  // 인플루언서탭은 checkInfluencer 요청 시에만 채워짐 — 미검사 데이터와 호환을 위해 optional
  influencerTab?: { exposed: boolean | null; rank: number | null };
  query?: string | null;
  // 이번 검사에서 실제로 시도한 검색 후보 전체(제목 기반, 1~4개) — 상세 화면 표시용
  candidates?: string[] | null;
  searchVolume?: number | null;
  status?: string;
  checkedAt?: string | null;
}

export interface PostLike {
  id: string;
  isPublic?: boolean;
  // 발행 시각(파싱된 Date) — 제공되면 색인 지연 유예 판정에 사용, 없으면 유예 판정을 건너뜀(기존 동작 유지)
  publishedAt?: Date | null;
}

export type MissingResultsMap = Record<string, MissingState>;

export type MissingArea = 'view' | 'blog' | 'influencer';

// 발행 직후 네이버 색인 지연으로 인한 오탐 방지 유예 기간(시간)
// 이 시간 내 발행된 글이 아직 노출 미확인이면 "미노출"이 아니라 "인덱싱 대기중"으로 취급해 통계·목록에서 제외
// ⚠️ 주의: 포스트 date 필드는 시각 없이 날짜만 제공됨(예: "2026. 8. 5.") → 파싱 시 항상 00:00으로 처리됨.
// 따라서 24시간 미만으로 설정하면 발행 당일이라도 낮 시간대 검사 시 유예가 조기에 풀려버려 오탐 방지 효과가 없어짐.
// "발행일과 검사일이 같은 날"을 안전하게 항상 커버하려면 24시간(1일) 이상으로 설정해야 함.
export const INDEXING_GRACE_HOURS = 24;

function inIndexingGracePeriod(post: PostLike, now: number): boolean {
  if (!post.publishedAt) return false;
  const age = now - post.publishedAt.getTime();
  return age >= 0 && age < INDEXING_GRACE_HOURS * 60 * 60 * 1000;
}

// 누락 정의: 통합검색·블로그탭·인플루언서탭 중 하나라도 명시적으로 미노출(false)
// exposed=null 또는 undefined(미검사·DB 미반환)는 "알 수 없음"으로 처리해 누락으로 카운트하지 않음
// publishedAt이 있고 발행 후 INDEXING_GRACE_HOURS 이내면 색인 지연으로 보고 누락 판정에서 제외(오탐 방지)
export function isPostMissing(post: PostLike, results: MissingResultsMap, now: number = Date.now()): boolean {
  const mr = results[post.id];
  if (!mr) return false;
  const viewExp = mr.viewTab.exposed;
  const blogExp = mr.blogTab.exposed;
  const infExp = mr.influencerTab?.exposed ?? null;
  // 셋 다 null이면 아직 확인 전 → 누락 아님
  if (viewExp === null && blogExp === null && infExp === null) return false;
  const missing = viewExp === false || blogExp === false || infExp === false;
  if (!missing) return false;
  if (inIndexingGracePeriod(post, now)) return false;
  return true;
}

// 특정 영역(통합검색/블로그/인플루언서) 하나만 놓고 미노출 여부 판정 — 요약 통계 카드용
export function isPostMissingInArea(post: PostLike, results: MissingResultsMap, area: MissingArea, now: number = Date.now()): boolean {
  const mr = results[post.id];
  if (!mr) return false;
  const exp = area === 'view' ? mr.viewTab.exposed : area === 'blog' ? mr.blogTab.exposed : (mr.influencerTab?.exposed ?? null);
  if (exp !== false) return false;
  if (inIndexingGracePeriod(post, now)) return false;
  return true;
}

export function countMissingInArea(posts: PostLike[], results: MissingResultsMap, area: MissingArea, now: number = Date.now()): number {
  let n = 0;
  for (const p of posts) if (isPostMissingInArea(p, results, area, now)) n++;
  return n;
}

export function filterMissing<T extends PostLike>(posts: T[], results: MissingResultsMap, now: number = Date.now()): T[] {
  return posts.filter(p => isPostMissing(p, results, now));
}

export function countMissing(posts: PostLike[], results: MissingResultsMap, now: number = Date.now()): number {
  let n = 0;
  for (const p of posts) if (isPostMissing(p, results, now)) n++;
  return n;
}

// 발행 후 유예 기간 내인데 미노출로 잡힐 뻔한(=색인 대기 중인) 게시글 수 — 투명성 안내용
export function countIndexingWait(posts: PostLike[], results: MissingResultsMap, now: number = Date.now()): number {
  let n = 0;
  for (const post of posts) {
    const mr = results[post.id];
    if (!mr) continue;
    if (!inIndexingGracePeriod(post, now)) continue;
    const viewExp = mr.viewTab.exposed;
    const blogExp = mr.blogTab.exposed;
    const infExp = mr.influencerTab?.exposed ?? null;
    if (viewExp === false || blogExp === false || infExp === false) n++;
  }
  return n;
}

// 누락율(%) — 분모는 인자로 받은 posts.length (현재 화면에 표시된 슬라이스 길이)
// posts가 비면 0 반환. 결과는 0~100 정수(반올림).
export function calculateMissingRate(posts: PostLike[], results: MissingResultsMap, now: number = Date.now()): number {
  if (posts.length === 0) return 0;
  const missing = countMissing(posts, results, now);
  return Math.round((missing / posts.length) * 100);
}
