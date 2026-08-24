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

/**
 * §5 종합 노출 상태(노출 현황 페이지 표시용) — 전체 포스팅을 한 눈에 분류한다.
 *   normal       : 정상   — 검사된 모든 영역이 노출
 *   partial      : 일부 노출 — 일부 영역만 노출, 나머지는 미노출
 *   missing      : 미노출  — 검사된 모든 영역이 미노출(재검증 확정). isPostMissing 과 같은 기준 → 대시보드 숫자와 일치(§12)
 *   checking     : 확인 중  — 발행 직후 색인 유예 / 재검증 대기(recheck) — 아직 미확정(미노출 아님)
 *   error        : 확인 실패 — 네이버 조회/ API 오류(미노출 아님)
 *   unanalyzable : 분석 불가 — 비공개/검색어 생성 불가
 *   unchecked    : 미확인  — 아직 검사한 기록이 없음
 *
 * ⚠️ error/checking/unanalyzable/unchecked 은 절대 missing 으로 분류하지 않는다(§5).
 */
export type ExposureClass = 'normal' | 'partial' | 'missing' | 'checking' | 'error' | 'unanalyzable' | 'unchecked';

export function classifyExposure(post: PostLike, mr: MissingState | undefined, now: number = Date.now()): ExposureClass {
  if (!mr) return 'unchecked';
  // 재시도 소진 실패(POST /post-missing-state) — 이전 확정 판정이 없으면 '확인 실패'(미노출 아님).
  if (mr.status === 'failed' && mr.overallStatus == null) return 'error';
  const v = displayVerdict(post, mr, now);
  if (v === null) return 'unchecked';
  if (v === 'error') return 'error';
  if (v === 'unanalyzable') return 'unanalyzable';
  if (v === 'checking' || v === 'recheck') return 'checking';
  if (v === 'missing') return 'missing';
  // v === 'exposed': 검사된(non-null) 영역이 전부 노출이면 정상, 하나라도 미노출이면 일부 노출
  const checked = [mr.viewTab.exposed, mr.blogTab.exposed, mr.influencerTab?.exposed ?? null].filter(a => a !== null);
  return checked.some(a => a === false) ? 'partial' : 'normal';
}

/** 종합 상태별 개수 집계 — 노출 현황 상단 카드용(§2). 반환 객체의 키 합 = posts.length. */
export function countByExposureClass(posts: PostLike[], results: MissingResultsMap, now: number = Date.now()): Record<ExposureClass, number> {
  const counts: Record<ExposureClass, number> = {
    normal: 0, partial: 0, missing: 0, checking: 0, error: 0, unanalyzable: 0, unchecked: 0,
  };
  for (const p of posts) counts[classifyExposure(p, results[p.id], now)]++;
  return counts;
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

// 누락율(%) — 분모는 "실제로 확인 기록이 있는" 게시글 수다. 아직 확인하지 않은 글까지 분모에 넣으면
// 확인도 안 한 글을 노출로 친 셈이 되어 미노출률이 실제보다 낮게 나온다(화면 카드도 확인 건수 기준으로 표기한다).
// 확인된 글이 하나도 없으면 0 반환. 결과는 0~100 정수(반올림).
export function calculateMissingRate(posts: PostLike[], results: MissingResultsMap, now: number = Date.now()): number {
  const checked = posts.filter(p => results[p.id]);
  if (checked.length === 0) return 0;
  return Math.round((countMissing(checked, results, now) / checked.length) * 100);
}
