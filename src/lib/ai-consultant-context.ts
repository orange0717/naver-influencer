/**
 * ai-consultant-context.ts — "N인플 AI" 데이터 검색·그라운딩 계층 (RAG)
 *
 * N인플 AI 컨설턴트가 ChatGPT 일반 지식을 먼저 답하는 게 아니라,
 * N인플이 축적한 실제 데이터를 먼저 조회해 그 데이터를 근거로 답변하도록 만드는 핵심 모듈.
 *
 * 흐름:
 *   사용자 질문 → 의도 분류(classifyIntents) → 필요한 N인플 데이터 조회
 *   → LLM에 넘길 Context 텍스트(buildNinfleContext) 구성
 *
 * ⚠️ 절대 원칙: 이 파일은 "실제 DB에 존재하는 값"만 Context 로 만든다.
 *    존재하지 않는 데이터는 만들어내지 않고, 없으면 없다고 표기한다(§7·§18).
 *    LLM 은 여기서 넘긴 Context 안의 값만 "N인플 데이터"로 인용해야 한다.
 */

import { createServiceClient } from '@/lib/supabase-server';
import { parseQueryToFilters, matchPowerContentKeyword } from '@/lib/ai-search';

export type ConsultantIntent =
  | 'influencer-reco' // 광고/협업할 인플루언서 추천
  | 'missing-post' // 내 글 미노출 여부 확인
  | 'my-keyword-ranking' // 내 저장 키워드 순위
  | 'my-blog' // 내 블로그 현황(방문자·연결 상태 등)
  | 'general'; // N인플 데이터가 필요 없는 일반 지식

export interface NinfleContext {
  /** 감지된 의도들 (복수 가능). general 만 있으면 데이터 조회 없음. */
  intents: ConsultantIntent[];
  /** LLM system/context 로 주입할 텍스트. 비어있지 않으면 데이터 근거가 있다는 뜻. */
  contextBlock: string;
  /** 실제로 조회된 N인플 데이터가 하나라도 있었는지 (UI "데이터 근거" 뱃지용). */
  dataFound: boolean;
  /** 사용된 데이터 출처 라벨 (디버깅/표시용). */
  sources: string[];
}

const MAX_INFLUENCERS = 8;
const MAX_MISSING_POSTS = 12;
const MAX_KEYWORDS = 15;

// ── 의도 분류 (규칙 기반) ─────────────────────────────────────────────
// LLM 왕복 없이 저렴하게 "어떤 N인플 데이터가 필요한가"를 먼저 판단한다.
// 하나의 질문이 여러 의도를 가질 수 있어 배열로 반환.

const INFLUENCER_HINTS = [
  '인플루언서', '인플', '블로거', '추천해', '섭외', '협업', '광고할', '광고를', '광고 할',
  '체험단', '마케팅할', '홍보할', '누구', '누가', '적합한 사람', '적합한 인플',
];
const MISSING_HINTS = [
  '미노출', '노출 안', '노출안', '검색에 안', '검색이 안', '안 나와', '안나와', '안 떠', '안떠',
  '누락', '노출되었는지', '노출됐는지', '노출 여부', '검색 노출',
];
const MY_RANKING_HINTS = [
  '내 키워드', '내 순위', '순위가 올', '순위 변화', '순위가 떨어', '순위 추이', '저장한 키워드',
  '내 키워드 순위', '순위 확인',
];
const MY_BLOG_HINTS = [
  '내 블로그', '방문자', '방문자수', '유입', '이웃', '내 블로그가', '블로그 방문',
  '방문자가 줄', '방문자가 늘', '내 블로그 현황', '내 블로그 상태',
];

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function classifyIntents(query: string): ConsultantIntent[] {
  const q = query.toLowerCase();
  const intents: ConsultantIntent[] = [];

  if (includesAny(q, MISSING_HINTS)) intents.push('missing-post');
  if (includesAny(q, MY_RANKING_HINTS)) intents.push('my-keyword-ranking');
  if (includesAny(q, MY_BLOG_HINTS)) intents.push('my-blog');
  if (includesAny(q, INFLUENCER_HINTS)) intents.push('influencer-reco');

  if (intents.length === 0) intents.push('general');
  return intents;
}

// ── 사용자 블로그 신원 조회 ────────────────────────────────────────────

interface UserIdentity {
  blogId: string | null;
  naverId: string | null;
  linkedInfluencerId: string | null;
}

async function getUserIdentity(userId: string): Promise<UserIdentity> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('users')
    .select('blog_id, naver_id, linked_influencer_id')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return { blogId: null, naverId: null, linkedInfluencerId: null };

  let blogId: string | null = (data.blog_id as string) || null;
  // blog_id 미설정이지만 인플루언서 연결이 있으면 그 naver_id 를 블로그 식별자로 사용
  if (!blogId && data.linked_influencer_id) {
    const { data: inf } = await supabase
      .from('influencers')
      .select('naver_id')
      .eq('id', data.linked_influencer_id)
      .maybeSingle();
    blogId = (inf?.naver_id as string) || null;
  }
  return {
    blogId,
    naverId: (data.naver_id as string) || null,
    linkedInfluencerId: (data.linked_influencer_id as string) || null,
  };
}

// ── 인플루언서 추천 데이터 조회 ─────────────────────────────────────────
// 자연어 파서(parseQueryToFilters) + 파워콘텐츠 키워드 매칭으로 카테고리/키워드를 추출하고,
// influencers 테이블에서 실제 후보를 뽑는다. 존재하는 컬럼 값만 근거로 넘긴다.

interface InfluencerCandidate {
  name: string;
  naverId: string;
  category: string;
  subscribers: number | null;
  totalKeywords: number | null;
  top3Count: number | null;
  top1Count: number | null;
  lastActiveAt: string | null;
}

async function retrieveInfluencers(
  query: string,
): Promise<{ candidates: InfluencerCandidate[]; category: string | null; keyword: string | null }> {
  const filters = parseQueryToFilters(query);
  const powerMatch = matchPowerContentKeyword(query);
  const category = filters.category || powerMatch?.category || null;
  const keyword = filters.keyword_text || powerMatch?.keyword || null;

  // 카테고리도 키워드도 못 잡으면 후보를 특정할 수 없으므로 조회하지 않는다(임의 추천 금지).
  if (!category && !keyword) {
    return { candidates: [], category, keyword };
  }

  const supabase = createServiceClient();
  const COLS =
    'naver_id, display_name, category, my_keyword_category, my_keyword, subscriber_count, total_follower_count, total_keywords, integrated_top3_count, top1_count, last_challenged_at';

  let q = supabase.from('influencers').select(COLS).eq('is_active', true);
  if (category) {
    q = q.or(`category.eq.${category},my_keyword_category.eq.${category}`);
  } else if (keyword) {
    // 카테고리 없이 키워드만 잡힌 경우: 대표 키워드/소개글에서 부분 일치
    const safe = keyword.replace(/[%,()]/g, '');
    q = q.or(`my_keyword.ilike.%${safe}%,introduction.ilike.%${safe}%`);
  }

  const { data, error } = await q
    .order('integrated_top3_count', { ascending: false, nullsFirst: false })
    .limit(MAX_INFLUENCERS);

  if (error || !data) return { candidates: [], category, keyword };

  const candidates: InfluencerCandidate[] = data.map((r) => ({
    name: (r.display_name as string) || (r.naver_id as string) || '이름 미상',
    naverId: (r.naver_id as string) || '',
    category: (r.my_keyword_category as string) || (r.category as string) || '분류 미상',
    subscribers: (r.subscriber_count as number) ?? (r.total_follower_count as number) ?? null,
    totalKeywords: (r.total_keywords as number) ?? null,
    top3Count: (r.integrated_top3_count as number) ?? null,
    top1Count: (r.top1_count as number) ?? null,
    lastActiveAt: (r.last_challenged_at as string) || null,
  }));

  return { candidates, category, keyword };
}

// ── 미노출 데이터 조회 (내 블로그) ──────────────────────────────────────

interface MissingRow {
  postTitle: string;
  query: string | null;
  viewExposed: boolean | null;
  viewRank: number | null;
  blogExposed: boolean | null;
  blogRank: number | null;
  overallStatus: string | null;
  status: string;
  checkedAt: string | null;
}

async function retrieveMissingPosts(
  blogId: string,
): Promise<{ rows: MissingRow[]; missingCount: number; okCount: number; total: number }> {
  const supabase = createServiceClient();
  const FULL =
    'post_title, query, view_exposed, view_rank, blog_exposed, blog_rank, overall_status, status, checked_at';
  const LEGACY = 'post_title, query, view_exposed, view_rank, blog_exposed, blog_rank, status, checked_at';

  const full = await supabase
    .from('post_missing_checks')
    .select(FULL)
    .eq('blog_id', blogId)
    .order('checked_at', { ascending: false, nullsFirst: false })
    .limit(60);
  const res = full.error
    ? await supabase
        .from('post_missing_checks')
        .select(LEGACY)
        .eq('blog_id', blogId)
        .order('checked_at', { ascending: false, nullsFirst: false })
        .limit(60)
    : full;

  const data = (res.data as Record<string, unknown>[] | null) || [];
  const rows: MissingRow[] = data.map((r) => ({
    postTitle: (r.post_title as string) || '(제목 없음)',
    query: (r.query as string) || null,
    viewExposed: (r.view_exposed as boolean) ?? null,
    viewRank: (r.view_rank as number) ?? null,
    blogExposed: (r.blog_exposed as boolean) ?? null,
    blogRank: (r.blog_rank as number) ?? null,
    overallStatus: (r.overall_status as string) ?? null,
    status: (r.status as string) || 'pending',
  checkedAt: (r.checked_at as string) || null,
  }));

  // "미노출" = 검사 완료(status ok)인데 통합검색·블로그탭 어디에도 안 잡힌 글
  const checked = rows.filter((r) => r.status === 'ok');
  const missingCount = checked.filter(
    (r) => r.viewExposed === false && r.blogExposed === false,
  ).length;
  const okCount = checked.length - missingCount;

  return { rows: rows.slice(0, MAX_MISSING_POSTS), missingCount, okCount, total: checked.length };
}

// ── 내 저장 키워드 순위 조회 ────────────────────────────────────────────

interface SavedKeywordRow {
  keyword: string;
  monthlyTotal: number | null;
  competition: string | null;
}

async function retrieveMyKeywords(userId: string): Promise<SavedKeywordRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('saved_search_keywords')
    .select('keyword, monthly_total, competition')
    .eq('user_id', userId)
    .order('monthly_total', { ascending: false, nullsFirst: false })
    .limit(MAX_KEYWORDS);
  if (error || !data) return [];
  return data.map((r) => ({
    keyword: (r.keyword as string) || '',
    monthlyTotal: (r.monthly_total as number) ?? null,
    competition: (r.competition as string) || null,
  }));
}

// ── Context 텍스트 조립 ────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '확인 기록 없음';
  return iso.slice(0, 10);
}

function fmtNum(n: number | null): string {
  if (n === null || n === undefined) return '데이터 없음';
  return n.toLocaleString('ko-KR');
}

/**
 * 사용자 질문에 필요한 N인플 데이터를 조회해 LLM Context 로 조립한다.
 * general 의도만 있으면 조회 없이 빈 Context 를 돌려준다(일반 지식으로 답하라는 신호).
 */
export async function buildNinfleContext(params: {
  query: string;
  userId: string | null;
}): Promise<NinfleContext> {
  const { query, userId } = params;
  const intents = classifyIntents(query);
  const sections: string[] = [];
  const sources: string[] = [];
  let dataFound = false;

  // 로그인 사용자 신원 (내 블로그 기반 조회에 필요)
  const identity = userId ? await getUserIdentity(userId) : null;

  // 1) 인플루언서 추천
  if (intents.includes('influencer-reco')) {
    const { candidates, category, keyword } = await retrieveInfluencers(query);
    if (candidates.length > 0) {
      dataFound = true;
      sources.push('인플루언서 랭킹');
      const lines = candidates.map((c, i) => {
        const parts = [
          `${i + 1}. ${c.name} (분야: ${c.category})`,
          `   - 팬/구독자: ${fmtNum(c.subscribers)}`,
          `   - 참여 키워드 수: ${fmtNum(c.totalKeywords)}`,
          `   - 통합검색 TOP3 진입: ${fmtNum(c.top3Count)}회 (1위 ${fmtNum(c.top1Count)}회)`,
          `   - 최근 챌린지 활동: ${fmtDate(c.lastActiveAt)}`,
          `   - 프로필: https://in.naver.com/${c.naverId}`,
        ];
        return parts.join('\n');
      });
      sections.push(
        `[N인플 인플루언서 검색 결과]\n` +
          `조회 조건 — 분야: ${category || '미지정'}, 키워드: ${keyword || '미지정'}\n` +
          `아래는 N인플 DB에 실제 저장된 인플루언서 지표입니다. 이 값만 근거로 사용하세요.\n` +
          lines.join('\n'),
      );
    } else {
      sections.push(
        `[N인플 인플루언서 검색 결과]\n` +
          `질문에서 특정할 수 있는 분야/키워드로 N인플 DB에서 매칭되는 인플루언서를 찾지 못했습니다. ` +
          `(어떤 업종/분야의 광고인지 더 구체적으로 물어보거나, 데이터가 없음을 알리세요. 임의로 인플루언서를 지어내지 마세요.)`,
      );
    }
  }

  // 2) 미노출 (내 블로그)
  if (intents.includes('missing-post')) {
    if (!identity?.blogId) {
      sections.push(
        `[N인플 미노출 분석]\n` +
          `현재 사용자는 네이버 블로그가 연결되어 있지 않아 저장된 미노출 데이터가 없습니다. ` +
          `블로그 연결(내 계정 연결) 후 미노출 분석을 실행해야 확인할 수 있다고 안내하세요. 미노출 여부를 단정하지 마세요.`,
      );
    } else {
      const { rows, missingCount, okCount, total } = await retrieveMissingPosts(identity.blogId);
      if (total === 0) {
        sections.push(
          `[N인플 미노출 분석]\n` +
            `블로그(${identity.blogId})에 대해 아직 완료된 미노출 검사 기록이 없습니다. ` +
            `미노출 분석을 먼저 실행해야 한다고 안내하세요. 미노출 여부를 단정하지 마세요.`,
        );
      } else {
        dataFound = true;
        sources.push('미노출 분석');
        const detail = rows
          .filter((r) => r.status === 'ok')
          .slice(0, 8)
          .map((r) => {
            const view = r.viewExposed === null ? '미확인' : r.viewExposed ? `노출(${r.viewRank ?? '?'}위)` : '미노출';
            const blog = r.blogExposed === null ? '미확인' : r.blogExposed ? `노출(${r.blogRank ?? '?'}위)` : '미노출';
            return `   - "${r.postTitle}" [키워드: ${r.query || '미상'}] → 통합검색 ${view} / 블로그탭 ${blog} (확인일 ${fmtDate(r.checkedAt)})`;
          });
        sections.push(
          `[N인플 미노출 분석]\n` +
            `블로그(${identity.blogId}) 검사 완료 ${total}건 중 통합검색·블로그탭 모두 미노출 ${missingCount}건, 노출 확인 ${okCount}건.\n` +
            `아래는 최근 검사된 글의 실제 결과입니다. 이 결과만 근거로 사용하세요.\n` +
            detail.join('\n'),
        );
      }
    }
  }

  // 3) 내 저장 키워드 순위
  if (intents.includes('my-keyword-ranking')) {
    if (!userId) {
      sections.push(
        `[N인플 내 키워드]\n로그인하지 않아 저장된 키워드가 없습니다. 로그인 후 키워드 순위 기능을 이용하도록 안내하세요.`,
      );
    } else {
      const kws = await retrieveMyKeywords(userId);
      if (kws.length === 0) {
        sections.push(
          `[N인플 내 키워드]\n저장된 키워드가 없습니다. 키워드 순위/추천 기능으로 먼저 키워드를 저장하도록 안내하세요.`,
        );
      } else {
        dataFound = true;
        sources.push('내 키워드');
        const lines = kws.map(
          (k) => `   - ${k.keyword} (월 검색량 ${fmtNum(k.monthlyTotal)}, 경쟁도 ${k.competition || '미상'})`,
        );
        sections.push(
          `[N인플 내 키워드]\n사용자가 N인플에 저장한 키워드입니다. 이 목록만 근거로 사용하세요.\n` + lines.join('\n'),
        );
      }
    }
  }

  // 4) 내 블로그 현황
  if (intents.includes('my-blog')) {
    if (!identity?.blogId) {
      sections.push(
        `[N인플 내 블로그]\n연결된 네이버 블로그가 없어 방문자·유입 등 저장 데이터가 없습니다. ` +
          `블로그 연결 후 대시보드에서 확인하도록 안내하세요. 방문자 수 등을 임의로 만들지 마세요.`,
      );
    } else {
      // 블로그 연결 상태만 사실로 확정. 방문자 수치는 대시보드 소관이라 여기선 단정하지 않음.
      sections.push(
        `[N인플 내 블로그]\n연결된 블로그: ${identity.blogId}. ` +
          `구체적 방문자·유입 수치는 대시보드에서 확인 가능하며, 여기 Context 에 실제 수치가 없으면 지어내지 말고 대시보드를 안내하세요.`,
      );
    }
  }

  const header = userId
    ? `[N인플 사용자 정보]\n로그인 사용자. 연결 블로그: ${identity?.blogId || '미연결'}`
    : `[N인플 사용자 정보]\n비로그인(게스트) 사용자. 내 블로그·키워드 등 개인 데이터는 조회 불가.`;

  const contextBlock = sections.length > 0 ? `${header}\n\n${sections.join('\n\n')}` : '';

  return { intents, contextBlock, dataFound, sources };
}
