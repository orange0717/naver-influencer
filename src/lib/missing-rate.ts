import { computeRawAreaState, type ExposureVerdict, type Confidence } from './exposure-verdict';
import type { ExposureEvidence } from './post-exposure-check';

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
  // §10/§19 확정 판정(서버 상태머신). 레거시 행은 undefined → 영역값으로 폴백 판정
  overallStatus?: ExposureVerdict | null;
  // §14 판정 신뢰도
  confidence?: Confidence | null;
  // §13 검사 근거 데이터(상세 화면용)
  evidence?: ExposureEvidence | null;
  // §11/§19 처음으로 모든 영역 미노출이 감지된 시각(1차 검사 시각 표시용)
  firstAllMissingAt?: string | null;
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

// 미노출 정의(§10 오탐 최소화): "검사한 모든 영역이 미노출"이 재검증으로 확정된 경우에만 미노출.
//   - 서버 상태머신이 낸 overall_status 가 있으면 그것을 그대로 신뢰한다.
//     · 'missing'  → 미노출 확정(재검증 통과)
//     · 그 외('exposed'/'recheck'/'checking'/'error'/'unanalyzable') → 미노출 아님
//   - overall_status 가 없는 레거시 행만 영역값으로 폴백하되, 과거의 OR("하나라도 false→미노출")이 아니라
//     "검사된 전 영역이 false"(AND)일 때만 미노출로 본다 — 인플루언서탭만 빠진 정상 노출글의 오탐 제거.
//   - publishedAt 이 색인 유예(INDEXING_GRACE_HOURS) 이내면 미노출 판정에서 제외(§18 오탐 방지).
export function isPostMissing(post: PostLike, results: MissingResultsMap, now: number = Date.now()): boolean {
  const mr = results[post.id];
  if (!mr) return false;
  if (inIndexingGracePeriod(post, now)) return false;

  if (mr.overallStatus != null) return mr.overallStatus === 'missing';

  // 레거시 폴백: AND 규칙
  const viewExp = mr.viewTab.exposed;
  const blogExp = mr.blogTab.exposed;
  const infExp = mr.influencerTab?.exposed ?? null;
  return computeRawAreaState(viewExp, blogExp, infExp) === 'all-missing';
}

/**
 * §19 화면 표기용 최종 판정. 저장된 overall_status 를 신뢰하되,
 * 발행 직후(색인 유예) all-missing/recheck 는 '확인 중'으로 오버레이한다.
 * 레거시(overall_status 없음) 행은 영역값으로 폴백 계산한다.
 */
export function displayVerdict(post: PostLike, mr: MissingState | undefined, now: number = Date.now()): ExposureVerdict | null {
  if (!mr) return null;
  const inGrace = inIndexingGracePeriod(post, now);

  if (mr.overallStatus != null) {
    if (inGrace && (mr.overallStatus === 'missing' || mr.overallStatus === 'recheck')) return 'checking';
    return mr.overallStatus;
  }

  // 레거시 폴백
  if (mr.status === 'error') return 'error';
  if (mr.status === 'unanalyzable') return 'unanalyzable';
  const raw = computeRawAreaState(mr.viewTab.exposed, mr.blogTab.exposed, mr.influencerTab?.exposed ?? null);
  if (raw === 'exposed') return 'exposed';
  if (raw === 'unknown') return null;
  // all-missing
  return inGrace ? 'checking' : 'missing';
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

// 발행 후 유예 기간 내인데 (전 영역 미노출이라) 미노출로 잡힐 뻔한 = 색인 대기 중인 게시글 수 — 투명성 안내용
export function countIndexingWait(posts: PostLike[], results: MissingResultsMap, now: number = Date.now()): number {
  let n = 0;
  for (const post of posts) {
    const mr = results[post.id];
    if (!mr) continue;
    if (!inIndexingGracePeriod(post, now)) continue;
    // overall_status 가 있으면 그걸(missing/recheck) 신뢰, 없으면 영역값 all-missing 폴백
    const isAllMissing = mr.overallStatus != null
      ? (mr.overallStatus === 'missing' || mr.overallStatus === 'recheck')
      : computeRawAreaState(mr.viewTab.exposed, mr.blogTab.exposed, mr.influencerTab?.exposed ?? null) === 'all-missing';
    if (isAllMissing) n++;
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
