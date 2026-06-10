export interface MissingState {
  blogTab: { exposed: boolean; rank: number | null };
  viewTab: { exposed: boolean; rank: number | null };
}

export interface PostLike {
  id: string;
  isPublic?: boolean;
}

export type MissingResultsMap = Record<string, MissingState>;

// 누락 정의: 통합검색 OR 블로그탭 둘 중 하나라도 미노출
// 미검사 포스트(결과 없음)는 누락으로 카운트하지 않음
export function isPostMissing(post: PostLike, results: MissingResultsMap): boolean {
  const mr = results[post.id];
  if (!mr) return false;
  return !mr.viewTab.exposed || !mr.blogTab.exposed;
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
