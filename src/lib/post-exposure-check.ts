import { createServiceClient } from '@/lib/supabase-server';
import { checkBlogTab, checkViewTab, checkInfluencerTab, getSearchVolume } from '@/lib/keyword-rank-check';
import { corroborateBlogExposure } from '@/lib/naver-blog-search-api';
import { logExposureCheck } from '@/lib/exposure-check-log';
import {
  computeRawAreaState,
  computeVerdict,
  type AreaExposed,
  type ExposureVerdict,
  type Confidence,
} from '@/lib/exposure-verdict';

/**
 * 미노출(검색 노출) 검사 공용 로직.
 *
 * 과거엔 이 파이프라인이 /api/blog/check-missing 라우트 안에 인라인으로만 존재해
 * "브라우저가 페이지를 열어야만" post_missing_checks 가 채워졌다(서버 배치 부재 → 새 세션/새 PC 에선 항상 0).
 * 이 파일은 그 판정·저장 로직을 추출해 라우트(사용자 수동 검사)와 크론(매일 자동 검사)이 함께 쓴다.
 *
 * 상태 구분(스펙 §1·§16):
 *   - 노출        : 검색 결과에서 해당 블로그/포스트가 확인됨 (exposed=true)
 *   - 미노출      : 정상 검색했으나 결과에 없음        (exposed=false)  ← 이것만 미노출로 집계
 *   - 수집 실패   : 검색 자체를 확인 못함(일시적 오류)  (exposed=null, status='error')  ← 미노출 아님
 *   - 분석 불가   : 검색어를 만들 수 없는 제목/비공개    (status='unanalyzable')          ← 미노출 아님
 */

// scannedDepth: 조회 범위 밖(스펙 #10/#21) 판정용 — exposed=false && scannedDepth 존재 → "N위 밖"
export type TabState = { exposed: boolean | null; rank: number | null; scannedDepth?: number | null };

/** §13 검사 당시 근거 데이터(영역별 매칭 URL·순위, 재검증 관측 등) — DB evidence JSONB 로 저장 */
export interface ExposureEvidence {
  /** 영역별 근거: 노출 시 매칭된 실제 URL(포스팅/핸들)과 순위 */
  areas: {
    view: { exposed: boolean | null; rank: number | null; matchedUrl: string | null };
    blog: { exposed: boolean | null; rank: number | null; matchedUrl: string | null };
    influencer: { exposed: boolean | null; rank: number | null; matchedUrl: string | null };
  };
  query: string;
  candidates: string[];
  /** §11 이번 검사에서 모든 영역 미노출 감지 후 in-request 2차 재검증을 수행했는가 */
  reverified: boolean;
  /** 2차 재검증에서 노출로 뒤집혔는가(즉 1차는 오탐이었음) */
  reverifyFlippedToExposed: boolean;
  /** §6 블로그 노출이 공식 검색 API(보조 채널)로 확인됐는가 — SERP엔 없지만 공식 색인엔 존재 */
  blogApiCorroborated?: boolean;
  checkedAt: string;
}

export interface PostExposureResult {
  blogTab: TabState;
  viewTab: TabState;
  influencerTab: TabState;
  query: string;
  candidates: string[];
  searchVolume: number;
  status: 'ok' | 'error' | 'unanalyzable';
  /** 이번 검사의 원시 상태(exposed/all-missing/unknown) — 재검증·집계 참고용 */
  rawState: 'exposed' | 'all-missing' | 'unknown';
  evidence: ExposureEvidence;
  /** 저장 로직이 재검증·연속카운터로 계산한 확정 판정 — check-missing 응답에서만 채워짐(computePostExposure 는 미설정) */
  overallStatus?: ExposureVerdict;
  confidence?: Confidence | null;
  checkedAt: string;
}

// ── 검색어 정제(제목 기반) ────────────────────────────────────────────────

// 한국어 조사 제거: "블로그의" → "블로그", "미래는" → "미래"
function stripParticles(word: string): string {
  const particles2 = ['에서', '에게', '으로', '처럼', '만큼', '부터', '까지', '마저', '조차', '이란', '이라', '에는', '에도', '으로서'];
  for (const p of particles2) {
    if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  const particles1 = ['의', '에', '를', '을', '이', '가', '는', '은', '와', '과', '도', '로', '만', '란', '라', '며', '면', '야'];
  for (const p of particles1) {
    if (word.length > 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 검색어에서 제거할 클릭베이트/서식 노이즈 토큰 (예: "TOP3", "BEST5")
const SEARCH_NOISE_RE = /\bTOP\s?\d*\b|\bBEST\s?\d*\b/gi;
// 구분자로 쓰이는 특수문자 (예: "제목 | 부제목", "제목 - 부제목", "제목: 설명")
const SEARCH_SEPARATOR_RE = /[|:\-~!?"'『』「」<>·•,.]/g;

/**
 * 미노출 검사용 검색어 정제: 포스팅 제목을 그대로 검색하기 위한 최소 정제
 * - 블로그 이름/닉네임 제거 (검색 결과가 본인 블로그명으로 오염되는 것 방지)
 * - 대괄호/소괄호 주석([공지], (협찬) 등) 제거
 * - 특수문자·구분자·클릭베이트 토큰(TOP3 등) 제거
 */
function cleanTitleForSearch(title: string, blogId: string, displayName?: string): string {
  let cleaned = title;
  const removePatterns = [blogId, blogId.replace(/[_-]/g, '')];
  if (displayName && displayName.length >= 2) removePatterns.push(displayName);
  for (const p of removePatterns) {
    if (p.length >= 2) cleaned = cleaned.replace(new RegExp(escapeRegExp(p), 'gi'), ' ');
  }
  cleaned = cleaned.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ');
  cleaned = cleaned.replace(SEARCH_NOISE_RE, ' ').replace(SEARCH_SEPARATOR_RE, ' ');
  cleaned = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * 제목 기반 검색 후보 생성 (미노출 검사 전용)
 * - 1순위: 정제된 제목 전체
 * - 제목이 길면 어절 단위로 자연스럽게 분리해 2~4개 후보 생성
 */
export function buildTitleSearchCandidates(title: string, blogId: string, displayName?: string): string[] {
  const cleaned = cleanTitleForSearch(title, blogId, displayName);
  const words = cleaned
    .split(' ')
    .filter(Boolean)
    .map(w => (/^[가-힣]+$/.test(w) ? stripParticles(w) : w))
    .filter(Boolean);

  const fullQuery = words.join(' ');
  const candidates: string[] = [];
  if (fullQuery) candidates.push(fullQuery);

  const MAX_QUERY_LEN = 25;
  if (fullQuery.length > MAX_QUERY_LEN && words.length >= 2) {
    const half = Math.ceil(words.length / 2);
    const front = words.slice(0, half).join(' ');
    const back = words.slice(half).join(' ');
    if (front && front !== fullQuery) candidates.push(front);
    if (back && back !== fullQuery && back !== front) candidates.push(back);

    if (words.length >= 4) {
      const twoThirds = Math.ceil((words.length * 2) / 3);
      const frontShort = words.slice(0, twoThirds).join(' ');
      if (frontShort && !candidates.includes(frontShort)) candidates.push(frontShort);
    }
  }

  if (candidates.length === 0) {
    const rawFallback = title.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    candidates.push((rawFallback || title).slice(0, 20));
  }
  return candidates.slice(0, 4);
}

// ── 노출 판정 파이프라인 ──────────────────────────────────────────────────

export interface ComputeExposureInput {
  blogId: string;
  postTitle: string;
  postId?: string;
  /** 사용자 지정 키워드가 있으면 제목 대신 이 키워드로 검색 */
  keyword?: string;
  /** 인플루언서탭까지 확인할지 (추가 네이버 요청 발생) */
  checkInfluencer?: boolean;
  /** blog_scores.blog_name — 검색어에서 블로그명 오염 제거용 */
  displayName?: string;
  /**
   * §11 모든 영역 미노출 감지 시 곧바로 확정하지 않고 in-request 2차 재검증을 1회 수행할지(기본 true).
   * 일시적 검색 변동으로 인한 오탐(실제 노출인데 미노출)을 한 번 더 걸러낸다.
   */
  reverifyOnAllMissing?: boolean;
  /** 강제 재조회(스펙 #24 캐시 우회) — HTML 공유 캐시를 건너뛰고 네이버에서 새로 조회 */
  force?: boolean;
}

/** 노출 근거 URL 생성 — 블로그/통합검색은 포스팅 URL, 인플루언서는 핸들 URL */
function matchedUrlFor(area: 'view' | 'blog' | 'influencer', exposed: boolean | null, blogId: string, postId?: string): string | null {
  if (exposed !== true) return null;
  if (area === 'influencer') return `https://in.naver.com/${blogId}`;
  return postId ? `https://blog.naver.com/${blogId}/${postId}` : `https://blog.naver.com/${blogId}`;
}

/**
 * 포스트 1개의 통합검색 · 블로그탭 · (요청 시)인플루언서탭 노출 여부를 판정한다.
 * 캐시/inFlight/레이트리밋 은 호출측(라우트) 책임 — 이 함수는 순수 판정만 수행한다.
 */
export async function computePostExposure(input: ComputeExposureInput): Promise<PostExposureResult> {
  const { blogId, postTitle, postId, keyword, checkInfluencer, displayName, force } = input;
  const reverifyOnAllMissing = input.reverifyOnAllMissing !== false;

  const candidates: string[] = keyword && keyword.trim()
    ? [keyword.trim()]
    : buildTitleSearchCandidates(postTitle, blogId, displayName);

  // 검색 후보를 하나도 만들 수 없으면(제목이 전부 노이즈) → 분석불가
  if (candidates.length === 0 || !candidates[0]) {
    const now = new Date().toISOString();
    return {
      blogTab: { exposed: null, rank: null },
      viewTab: { exposed: null, rank: null },
      influencerTab: { exposed: null, rank: null },
      query: '',
      candidates: [],
      searchVolume: 0,
      status: 'unanalyzable',
      rawState: 'unknown',
      evidence: {
        areas: {
          view: { exposed: null, rank: null, matchedUrl: null },
          blog: { exposed: null, rank: null, matchedUrl: null },
          influencer: { exposed: null, rank: null, matchedUrl: null },
        },
        query: '', candidates: [], reverified: false, reverifyFlippedToExposed: false, checkedAt: now,
      },
      checkedAt: now,
    };
  }
  const query = candidates[0];
  const hasKeyword = Boolean(keyword && keyword.trim()) || Boolean(checkInfluencer);

  // 각 탭의 누적 상태. loaded=어떤 시도든 정상 응답을 한 번이라도 받으면 true.
  // loaded가 끝까지 false면 = 전 후보의 모든 페이지가 실패 = '일시적 오류'(미노출로 집계 안 함)
  // scannedDepth=마지막 정상 조회에서 확인한 상위 순위 범위("조회 범위 밖" 판정용)
  const blog = { exposed: false, rank: null as number | null, loaded: false, scannedDepth: null as number | null };
  const view = { exposed: false, rank: null as number | null, loaded: false, scannedDepth: null as number | null };
  const inf = { exposed: false, rank: null as number | null, loaded: false, scannedDepth: null as number | null };

  for (let i = 0; i < candidates.length; i++) {
    const allExposed = blog.exposed && view.exposed && (!hasKeyword || inf.exposed);
    if (i > 0 && allExposed) break;
    const cand = candidates[i];
    const [cBlog, cView, cInf] = await Promise.all([
      !blog.exposed ? checkBlogTab(cand, blogId, postId || '', { force }) : Promise.resolve({ exposed: true, rank: blog.rank, error: false }),
      !view.exposed ? checkViewTab(cand, blogId, postId || '', 3, { force }) : Promise.resolve({ exposed: true, rank: view.rank, error: false }),
      (hasKeyword && !inf.exposed) ? checkInfluencerTab(cand, blogId, postId || '', { force }) : Promise.resolve({ exposed: inf.exposed, rank: inf.rank, error: false }),
    ]);
    if (!blog.exposed && !cBlog.error) { blog.loaded = true; if (cBlog.exposed) { blog.exposed = true; blog.rank = cBlog.rank; } else if ('scannedDepth' in cBlog && cBlog.scannedDepth != null) { blog.scannedDepth = cBlog.scannedDepth; } }
    if (!view.exposed && !cView.error) { view.loaded = true; if (cView.exposed) { view.exposed = true; view.rank = cView.rank; } else if ('scannedDepth' in cView && cView.scannedDepth != null) { view.scannedDepth = cView.scannedDepth; } }
    if (hasKeyword && !inf.exposed && !cInf.error) { inf.loaded = true; if (cInf.exposed) { inf.exposed = true; inf.rank = cInf.rank; } else if ('scannedDepth' in cInf && cInf.scannedDepth != null) { inf.scannedDepth = cInf.scannedDepth; } }
    if (i < candidates.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  // 탭별 저장값: 노출=true / 정상 확인했으나 못 찾음=false / 확인 실패(일시적 오류)=null
  let blogExposed: boolean | null = blog.exposed ? true : (blog.loaded ? false : null);
  let viewExposed: boolean | null = view.exposed ? true : (view.loaded ? false : null);
  let infExposed: boolean | null = !hasKeyword ? null : (inf.exposed ? true : (inf.loaded ? false : null));

  // 검사한 영역이 전부 확인 실패면 '일시적 오류'(수집 실패)
  const checkedTabsLoaded = [view.loaded, blog.loaded, ...(hasKeyword ? [inf.loaded] : [])];
  const allErrored = checkedTabsLoaded.every(l => !l);
  let status: 'ok' | 'error' = allErrored ? 'error' : 'ok';

  // ── §11 in-request 2차 재검증 ──────────────────────────────────────────────
  // 1차에서 검사한 모든 영역이 미노출(all-missing)이면, 확정하기 전에 실패한 영역을 1회 재조회한다.
  // 일시적 검색 변동으로 인한 오탐(실제 노출인데 미노출)을 즉시 뒤집기 위함. 노출이 하나라도 확인되면 결과를 갱신한다.
  let reverified = false;
  let reverifyFlippedToExposed = false;
  let blogApiCorroborated = false;
  const raw1 = computeRawAreaState(viewExposed, blogExposed, infExposed);
  if (reverifyOnAllMissing && status === 'ok' && raw1 === 'all-missing') {
    reverified = true;
    await new Promise(r => setTimeout(r, 1200)); // 네이버 순간 변동을 피하기 위한 짧은 간격
    // 재검증은 네이버의 순간 변동을 새로 관측해야 하므로 HTML 공유 캐시를 반드시 우회(force:true)
    const [rBlog, rView, rInf] = await Promise.all([
      blogExposed === false ? checkBlogTab(query, blogId, postId || '', { force: true }) : Promise.resolve({ exposed: false, rank: null, error: true } as const),
      viewExposed === false ? checkViewTab(query, blogId, postId || '', 3, { force: true }) : Promise.resolve({ exposed: false, rank: null, error: true } as const),
      (hasKeyword && infExposed === false) ? checkInfluencerTab(query, blogId, postId || '', { force: true }) : Promise.resolve({ exposed: false, rank: null, error: true } as const),
    ]);
    if (!rBlog.error && rBlog.exposed) { blogExposed = true; blog.rank = rBlog.rank; reverifyFlippedToExposed = true; }
    if (!rView.error && rView.exposed) { viewExposed = true; view.rank = rView.rank; reverifyFlippedToExposed = true; }
    if (hasKeyword && !rInf.error && rInf.exposed) { infExposed = true; inf.rank = rInf.rank; reverifyFlippedToExposed = true; }

    // §6 공식 블로그 검색 API 보조 교차검증 — HTML 재검증 후에도 블로그 미노출이면, 공식 색인엔 존재하는지 확인.
    // "한 곳이라도 노출 → 노출"(§10) 원칙에 따라, 공식 색인에서 내 글이 확인되면 미노출 오탐을 걷어낸다.
    if (blogExposed === false) {
      const corr = await corroborateBlogExposure(query, blogId, postId);
      if (!corr.error && corr.exposed) {
        blogExposed = true;
        if (blog.rank == null) blog.rank = corr.rank;
        reverifyFlippedToExposed = true;
        blogApiCorroborated = true;
      }
    }
  }

  const rawState = computeRawAreaState(viewExposed, blogExposed, infExposed);
  // 재검증까지 했는데도 상태가 error 가 되지는 않지만(로드는 됐으므로), 방어적으로 재계산
  if (rawState === 'unknown' && allErrored) status = 'error';

  const searchVolume = status === 'error' ? 0 : await getSearchVolume(query);
  const checkedAt = new Date().toISOString();

  return {
    // scannedDepth는 "정상 조회했으나 미노출"(exposed===false)일 때만 의미 있음 → "N위 밖" 표시용
    blogTab: { exposed: blogExposed, rank: blog.rank, scannedDepth: blogExposed === false ? blog.scannedDepth : null },
    viewTab: { exposed: viewExposed, rank: view.rank, scannedDepth: viewExposed === false ? view.scannedDepth : null },
    influencerTab: { exposed: infExposed, rank: inf.rank, scannedDepth: infExposed === false ? inf.scannedDepth : null },
    query,
    candidates,
    searchVolume,
    status,
    rawState,
    evidence: {
      areas: {
        view: { exposed: viewExposed, rank: view.rank, matchedUrl: matchedUrlFor('view', viewExposed, blogId, postId) },
        blog: { exposed: blogExposed, rank: blog.rank, matchedUrl: matchedUrlFor('blog', blogExposed, blogId, postId) },
        influencer: { exposed: infExposed, rank: inf.rank, matchedUrl: matchedUrlFor('influencer', infExposed, blogId, postId) },
      },
      query,
      candidates,
      reverified,
      reverifyFlippedToExposed,
      blogApiCorroborated,
      checkedAt,
    },
    checkedAt,
  };
}

// ── DB 영속화 + 이력 적재 ─────────────────────────────────────────────────

// §11 재검증 대기(recheck) 상태는 이 간격 후 재검사(일반 하루 주기보다 앞당김) → 며칠이 아니라 몇 시간 내 2차 확인.
const RECHECK_SOON_MS = 3 * 60 * 60 * 1000;
const NORMAL_CADENCE_MS = 24 * 60 * 60 * 1000;

/**
 * "확정된 노출/미노출" 상태만 골라낸다 — 이력 전환 판정용.
 * recheck/checking/error/unanalyzable 은 확정 아님(null). overall_status 가 없는 레거시 행은
 * 영역값으로 폴백하되, 새 규칙(하나라도 노출→exposed, 검사된 전부 미노출→missing)을 쓴다(OR 아님).
 */
function confirmedStateOf(
  overallStatus: string | null | undefined,
  view: AreaExposed, blog: AreaExposed, inf: AreaExposed,
): 'exposed' | 'missing' | null {
  if (overallStatus === 'exposed') return 'exposed';
  if (overallStatus === 'missing') return 'missing';
  if (overallStatus == null) {
    const raw = computeRawAreaState(view, blog, inf);
    if (raw === 'exposed') return 'exposed';
    if (raw === 'all-missing') return 'missing';
  }
  return null;
}

/**
 * 검사 결과(status='ok'/'unanalyzable')를 post_missing_checks 에 upsert 하고,
 * §10 상태머신 + §11 재검증 + §14 신뢰도로 overall_status 를 확정한다.
 * 확정 노출/미노출이 이전과 달라졌으면 post_missing_history 에 전환 이력(사유 포함)을 남긴다.
 * ⚠️ status='error'(일시적 오류/수집 실패)는 호출 전에 걸러야 한다 — 정상 기록을 NULL 로 덮지 않기 위함.
 */
export interface RecordedVerdict {
  overallStatus: ExposureVerdict;
  confidence: Confidence | null;
  consecutiveMissing: number;
}

export async function recordPostExposure(
  blogId: string,
  postId: string,
  postTitle: string | null,
  result: PostExposureResult,
  supabase: ReturnType<typeof createServiceClient>,
  opts?: { inIndexingGrace?: boolean },
): Promise<RecordedVerdict> {
  const viewExposed = result.viewTab.exposed;
  const blogExposed = result.blogTab.exposed;
  const infExposed = result.influencerTab.exposed;

  const { data: prev } = await supabase
    .from('post_missing_checks')
    .select('overall_status, consecutive_missing, check_count, first_all_missing_at, view_exposed, blog_exposed, influencer_exposed')
    .eq('blog_id', blogId)
    .eq('post_id', postId)
    .maybeSingle();

  const prevConsecutive = (prev?.consecutive_missing as number | null) ?? 0;
  const prevCheckCount = (prev?.check_count as number | null) ?? 0;

  // §11 "모든 영역 미노출" 연속 관측 횟수 갱신
  let consecutiveMissing: number;
  let firstAllMissingAt: string | null = (prev?.first_all_missing_at as string | null) ?? null;
  if (result.rawState === 'all-missing') {
    consecutiveMissing = prevConsecutive + 1;
    if (!firstAllMissingAt) firstAllMissingAt = result.checkedAt;
  } else {
    consecutiveMissing = 0;
    firstAllMissingAt = null;
  }

  const { verdict, confidence } = computeVerdict({
    view: viewExposed,
    blog: blogExposed,
    inf: infExposed,
    status: result.status,
    inIndexingGrace: opts?.inIndexingGrace,
    consecutiveMissing,
  });

  const nowMs = Date.parse(result.checkedAt) || Date.now();
  const nextCheckAt = new Date(nowMs + (verdict === 'recheck' ? RECHECK_SOON_MS : NORMAL_CADENCE_MS)).toISOString();

  await supabase.from('post_missing_checks').upsert({
    blog_id: blogId,
    post_id: postId,
    post_title: postTitle,
    query: result.query,
    search_candidates: result.candidates,
    view_exposed: viewExposed,
    view_rank: result.viewTab.rank,
    blog_exposed: blogExposed,
    blog_rank: result.blogTab.rank,
    influencer_exposed: infExposed,
    influencer_rank: result.influencerTab.rank,
    search_volume: result.searchVolume,
    status: result.status,
    overall_status: verdict,
    confidence,
    consecutive_missing: consecutiveMissing,
    check_count: prevCheckCount + 1,
    next_check_at: nextCheckAt,
    first_all_missing_at: firstAllMissingAt,
    evidence: result.evidence,
    fail_count: 0,
    checked_at: result.checkedAt,
  }, { onConflict: 'blog_id,post_id' });

  // 확정 노출↔미노출이 실제로 바뀐 경우에만 이력 적재 (§7·§8·§24) — recheck/확인중/오류 전이는 남기지 않음
  const prevConfirmed = confirmedStateOf(
    prev?.overall_status as string | null,
    (prev?.view_exposed as AreaExposed) ?? null,
    (prev?.blog_exposed as AreaExposed) ?? null,
    (prev?.influencer_exposed as AreaExposed) ?? null,
  );
  const newConfirmed: 'exposed' | 'missing' | null =
    verdict === 'exposed' ? 'exposed' : verdict === 'missing' ? 'missing' : null;

  if (prevConfirmed && newConfirmed && prevConfirmed !== newConfirmed) {
    const reason = buildChangeReason(newConfirmed, result, consecutiveMissing);
    const { error: histErr } = await supabase.from('post_missing_history').insert({
      blog_id: blogId,
      post_id: postId,
      post_title: postTitle,
      prev_state: prevConfirmed,
      new_state: newConfirmed,
      view_exposed: viewExposed,
      blog_exposed: blogExposed,
      influencer_exposed: infExposed,
      changed_reason: reason,
      confidence,
      changed_at: result.checkedAt,
    });
    if (histErr) console.error(`[post-exposure] post_missing_history 저장 실패 blogId=${blogId} postId=${postId}:`, histErr);
  }

  // §22 검사 로그 적재(best-effort — 실패해도 판정 흐름에 영향 없음)
  await logExposureCheck(supabase, { blogId, postId, result, verdict, confidence, consecutiveMissing });

  return { overallStatus: verdict, confidence, consecutiveMissing };
}

/** §24 전환 사유 문구 생성 */
function buildChangeReason(
  newState: 'exposed' | 'missing',
  result: PostExposureResult,
  consecutiveMissing: number,
): string {
  if (newState === 'missing') {
    return `재검증 ${consecutiveMissing}회 연속 전 영역(통합검색·블로그·인플루언서) 미노출 확정`;
  }
  const back: string[] = [];
  if (result.viewTab.exposed === true) back.push('통합검색');
  if (result.blogTab.exposed === true) back.push('블로그');
  if (result.influencerTab.exposed === true) back.push('인플루언서');
  const areas = back.length > 0 ? back.join('·') : '검색';
  return result.evidence.reverifyFlippedToExposed
    ? `${areas} 재노출 확인(2차 재검증에서 노출로 정정)`
    : `${areas} 재노출 확인`;
}
