import { createServiceClient } from '@/lib/supabase-server';
import { checkBlogTab, checkViewTab, checkInfluencerTab, getSearchVolume } from '@/lib/keyword-rank-check';

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

export type TabState = { exposed: boolean | null; rank: number | null };

export interface PostExposureResult {
  blogTab: TabState;
  viewTab: TabState;
  influencerTab: TabState;
  query: string;
  candidates: string[];
  searchVolume: number;
  status: 'ok' | 'error' | 'unanalyzable';
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
}

/**
 * 포스트 1개의 통합검색 · 블로그탭 · (요청 시)인플루언서탭 노출 여부를 판정한다.
 * 캐시/inFlight/레이트리밋 은 호출측(라우트) 책임 — 이 함수는 순수 판정만 수행한다.
 */
export async function computePostExposure(input: ComputeExposureInput): Promise<PostExposureResult> {
  const { blogId, postTitle, postId, keyword, checkInfluencer, displayName } = input;

  const candidates: string[] = keyword && keyword.trim()
    ? [keyword.trim()]
    : buildTitleSearchCandidates(postTitle, blogId, displayName);

  // 검색 후보를 하나도 만들 수 없으면(제목이 전부 노이즈) → 분석불가
  if (candidates.length === 0 || !candidates[0]) {
    return {
      blogTab: { exposed: null, rank: null },
      viewTab: { exposed: null, rank: null },
      influencerTab: { exposed: null, rank: null },
      query: '',
      candidates: [],
      searchVolume: 0,
      status: 'unanalyzable',
      checkedAt: new Date().toISOString(),
    };
  }
  const query = candidates[0];
  const hasKeyword = Boolean(keyword && keyword.trim()) || Boolean(checkInfluencer);

  // 각 탭의 누적 상태. loaded=어떤 시도든 정상 응답을 한 번이라도 받으면 true.
  // loaded가 끝까지 false면 = 전 후보의 모든 페이지가 실패 = '일시적 오류'(미노출로 집계 안 함)
  const blog = { exposed: false, rank: null as number | null, loaded: false };
  const view = { exposed: false, rank: null as number | null, loaded: false };
  const inf = { exposed: false, rank: null as number | null, loaded: false };

  for (let i = 0; i < candidates.length; i++) {
    const allExposed = blog.exposed && view.exposed && (!hasKeyword || inf.exposed);
    if (i > 0 && allExposed) break;
    const cand = candidates[i];
    const [cBlog, cView, cInf] = await Promise.all([
      !blog.exposed ? checkBlogTab(cand, blogId, postId || '') : Promise.resolve({ exposed: true, rank: blog.rank, error: false }),
      !view.exposed ? checkViewTab(cand, blogId, postId || '') : Promise.resolve({ exposed: true, rank: view.rank, error: false }),
      (hasKeyword && !inf.exposed) ? checkInfluencerTab(cand, blogId, postId || '') : Promise.resolve({ exposed: inf.exposed, rank: inf.rank, error: false }),
    ]);
    if (!blog.exposed && !cBlog.error) { blog.loaded = true; if (cBlog.exposed) { blog.exposed = true; blog.rank = cBlog.rank; } }
    if (!view.exposed && !cView.error) { view.loaded = true; if (cView.exposed) { view.exposed = true; view.rank = cView.rank; } }
    if (hasKeyword && !inf.exposed && !cInf.error) { inf.loaded = true; if (cInf.exposed) { inf.exposed = true; inf.rank = cInf.rank; } }
    if (i < candidates.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  // 탭별 저장값: 노출=true / 정상 확인했으나 못 찾음=false / 확인 실패(일시적 오류)=null
  const blogExposed: boolean | null = blog.exposed ? true : (blog.loaded ? false : null);
  const viewExposed: boolean | null = view.exposed ? true : (view.loaded ? false : null);
  const infExposed: boolean | null = !hasKeyword ? null : (inf.exposed ? true : (inf.loaded ? false : null));

  // 검사한 영역이 전부 확인 실패면 '일시적 오류'(수집 실패)
  const checkedTabsLoaded = [view.loaded, blog.loaded, ...(hasKeyword ? [inf.loaded] : [])];
  const allErrored = checkedTabsLoaded.every(l => !l);
  const status: 'ok' | 'error' = allErrored ? 'error' : 'ok';

  const searchVolume = status === 'error' ? 0 : await getSearchVolume(query);

  return {
    blogTab: { exposed: blogExposed, rank: blog.rank },
    viewTab: { exposed: viewExposed, rank: view.rank },
    influencerTab: { exposed: infExposed, rank: inf.rank },
    query,
    candidates,
    searchVolume,
    status,
    checkedAt: new Date().toISOString(),
  };
}

// ── DB 영속화 + 이력 적재 ─────────────────────────────────────────────────

// 세 영역 노출값을 하나의 종합 상태로 요약 — 이력 전환 판정용
function overallExposureState(view: boolean | null, blog: boolean | null, inf: boolean | null): 'exposed' | 'missing' | 'unknown' {
  if (view === false || blog === false || inf === false) return 'missing';
  if (view === true || blog === true || inf === true) return 'exposed';
  return 'unknown';
}

/**
 * 검사 결과(status='ok'/'unanalyzable')를 post_missing_checks 에 upsert 하고,
 * 종합 노출 상태가 이전과 달라졌으면 post_missing_history 에 전환 이력을 남긴다.
 * ⚠️ status='error'(일시적 오류/수집 실패)는 호출 전에 걸러야 한다 — 정상 기록을 NULL 로 덮지 않기 위함.
 */
export async function recordPostExposure(
  blogId: string,
  postId: string,
  postTitle: string | null,
  result: PostExposureResult,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  const viewExposed = result.viewTab.exposed;
  const blogExposed = result.blogTab.exposed;
  const infExposed = result.influencerTab.exposed;

  const { data: prev } = await supabase
    .from('post_missing_checks')
    .select('view_exposed, blog_exposed, influencer_exposed')
    .eq('blog_id', blogId)
    .eq('post_id', postId)
    .maybeSingle();

  const prevState = prev
    ? overallExposureState(prev.view_exposed, prev.blog_exposed, prev.influencer_exposed)
    : 'unknown';
  const newState = overallExposureState(viewExposed, blogExposed, infExposed);

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
    fail_count: 0,
    checked_at: result.checkedAt,
  }, { onConflict: 'blog_id,post_id' });

  // 노출↔미노출이 실제로 바뀐 경우에만 이력 적재 (§7·§8) — 첫 확정 검사나 미확인 상태는 남기지 않음
  if (prevState !== 'unknown' && newState !== 'unknown' && prevState !== newState) {
    const { error: histErr } = await supabase.from('post_missing_history').insert({
      blog_id: blogId,
      post_id: postId,
      post_title: postTitle,
      prev_state: prevState,
      new_state: newState,
      view_exposed: viewExposed,
      blog_exposed: blogExposed,
      influencer_exposed: infExposed,
      changed_at: result.checkedAt,
    });
    if (histErr) console.error(`[post-exposure] post_missing_history 저장 실패 blogId=${blogId} postId=${postId}:`, histErr);
  }
}
