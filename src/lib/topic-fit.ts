/**
 * 토픽 "적합도" — 추천 토픽의 대표 키워드와, 그 토픽으로 묶인 글들이 실제로 얼마나
 * 맞아떨어지는지를 나타내는 투명한 키워드 일치율(0~100%).
 *
 * ⚠️ 임의로 만든 점수가 아니라 "선택된 글 중 대표 키워드를 하나라도 담은 글의 비율"이라는
 * 결정적(deterministic) 계산이다. 그래서 사용자가 글을 추가/제외하면(스펙 19항) 클라이언트가
 * 동일 함수로 즉시 재계산할 수 있다. 서버(추천 카드 초기값)와 클라이언트(선택 변경 시)가
 * 같은 로직을 공유하도록 이 파일에 단일 구현을 둔다.
 */

export interface TopicFitPost {
  title: string | null;
  tags?: string[] | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** 글 하나가 대표 키워드 집합과 맞는지 — 제목 부분일치 또는 태그 상호 부분일치 */
export function postMatchesKeywords(post: TopicFitPost, normKeywords: string[]): boolean {
  if (normKeywords.length === 0) return false;
  const title = normalize(post.title || '');
  const tags = (post.tags || []).map(normalize).filter(Boolean);
  return normKeywords.some(
    (k) => (title.length > 0 && title.includes(k)) || tags.some((t) => t.includes(k) || k.includes(t)),
  );
}

/**
 * 적합도(%) = 대표 키워드를 하나라도 담은 글 수 / 전체 글 수 × 100 (반올림).
 * 키워드가 없거나 글이 없으면 측정 불가 → null 반환(화면에서 적합도 줄을 숨긴다).
 */
export function computeTopicFit(keywords: string[], posts: TopicFitPost[]): number | null {
  const normKeywords = (keywords || []).map(normalize).filter(Boolean);
  if (normKeywords.length === 0 || posts.length === 0) return null;
  const matched = posts.reduce((n, p) => (postMatchesKeywords(p, normKeywords) ? n + 1 : n), 0);
  return Math.round((matched / posts.length) * 100);
}
