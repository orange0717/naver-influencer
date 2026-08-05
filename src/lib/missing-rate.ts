export interface MissingState {
  blogTab: { exposed: boolean | null; rank: number | null };
  viewTab: { exposed: boolean | null; rank: number | null };
  // 인플루언서탭은 checkInfluencer 요청 시에만 채워짐 — 미검사 데이터와 호환을 위해 optional
  influencerTab?: { exposed: boolean | null; rank: number | null };
  query?: string | null;
  searchVolume?: number | null;
  status?: string;
  checkedAt?: string | null;
}

export interface PostLike {
  id: string;
  isPublic?: boolean;
}

export type MissingResultsMap = Record<string, MissingState>;

export type MissingArea = 'view' | 'blog' | 'influencer';

// 누락 정의: 통합검색·블로그탭·인플루언서탭 중 하나라도 명시적으로 미노출(false)
// exposed=null 또는 undefined(미검사·DB 미반환)는 "알 수 없음"으로 처리해 누락으로 카운트하지 않음
export function isPostMissing(post: PostLike, results: MissingResultsMap): boolean {
  const mr = results[post.id];
  if (!mr) return false;
  const viewExp = mr.viewTab.exposed;
  const blogExp = mr.blogTab.exposed;
  const infExp = mr.influencerTab?.exposed ?? null;
  // 셋 다 null이면 아직 확인 전 → 누락 아님
  if (viewExp === null && blogExp === null && infExp === null) return false;
  return viewExp === false || blogExp === false || infExp === false;
}

// 특정 영역(통합검색/블로그/인플루언서) 하나만 놓고 미노출 여부 판정 — 요약 통계 카드용
export function isPostMissingInArea(post: PostLike, results: MissingResultsMap, area: MissingArea): boolean {
  const mr = results[post.id];
  if (!mr) return false;
  const exp = area === 'view' ? mr.viewTab.exposed : area === 'blog' ? mr.blogTab.exposed : (mr.influencerTab?.exposed ?? null);
  return exp === false;
}

export function countMissingInArea(posts: PostLike[], results: MissingResultsMap, area: MissingArea): number {
  let n = 0;
  for (const p of posts) if (isPostMissingInArea(p, results, area)) n++;
  return n;
}

export function filterMissing<T extends PostLike>(posts: T[], results: MissingResultsMap): T[] {
  return posts.filter(p => isPostMissing(p, results));
}

export function countMissing(posts: PostLike[], results: MissingResultsMap): number {
  let n = 0;
  for (const p of posts) if (isPostMissing(p, results)) n++;
  return n;
}

// 누락율(%) — 분모는 인자로 받은 posts.length (현재 화면에 표시된 슬라이스 길이)
// posts가 비면 0 반환. 결과는 0~100 정수(반올림).
export function calculateMissingRate(posts: PostLike[], results: MissingResultsMap): number {
  if (posts.length === 0) return 0;
  const missing = countMissing(posts, results);
  return Math.round((missing / posts.length) * 100);
}
