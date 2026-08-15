import * as cheerio from 'cheerio';
import { createServiceClient } from './supabase-server';
import { extractKeywordCandidates } from './keyword-candidates';
import { aiExtractKeyword } from './keyword-ai-extract';

export interface RepresentativeKeywordResult {
  keywords: string[];
  source: 'title+body' | 'title' | 'ai' | 'fallback' | 'none' | 'manual';
  /** 대표 키워드 신뢰도 0~1 (스펙 #12/#13). 낮으면 UI가 '확인 필요'로 표시한다. */
  confidence: number;
}

/** 대표 키워드 추출 옵션 — 제목 외 보조 신호(태그/카테고리/브랜드/사용자키워드)와 본문 보정 허용 여부. */
export interface RepKeywordExtractOpts {
  tags?: string[];
  category?: string | null;
  /** 브랜드/기관명 힌트(예: 블로그 대표 이름) — 일치 후보를 대표로 강하게 반영(스펙 #3). */
  brandHints?: string[];
  userKeyword?: string | null;
  /** 애매한 경우에만 본문을 크롤링해 보정(기본 false — 대량 자동추출 비용 방지, 스펙 #5). */
  allowBody?: boolean;
  /**
   * 규칙+본문 보정으로도 애매할 때만 Claude Haiku로 1회 보정(하이브리드, 스펙 #2).
   * 기본 false — 대량 자동추출 비용 방지. 조회 시점엔 캐시가 반환되므로 AI가 재호출되지 않는다(스펙 #20).
   */
  allowAI?: boolean;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface PostBodyParts {
  fullText: string;
  headingText: string;
  emphasisText: string;
  firstParagraph: string;
  lastParagraph: string;
  /** 본문 HTML에서 함께 파싱한 태그(#제거) — 추가 크롤링 없이 스펙 #3③ 신호로 활용. */
  tags: string[];
  /** 본문 HTML에서 함께 파싱한 카테고리 — 스펙 #3④ 신호. 없으면 null. */
  category: string | null;
}

/** 네이버 블로그 PostView HTML에서 태그 목록을 파싱(#접두 제거, 중복/과다 방지). 없으면 빈 배열. */
function parsePostTags($: cheerio.CheerioAPI): string[] {
  const selectors = ['.wrap_tag a', '.post_tag a', 'a.item_tag', '.tag_area a', '.se-module-tag a'];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const t = $(el).text().replace(/^#/, '').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 40 && !seen.has(t)) { seen.add(t); out.push(t); }
    });
    if (out.length > 0) break; // 첫 번째로 매칭된 셀렉터의 결과만 사용
  }
  return out.slice(0, 20);
}

/** 네이버 블로그 PostView HTML에서 카테고리명을 파싱. 없으면 null. */
function parsePostCategory($: cheerio.CheerioAPI): string | null {
  const selectors = ['.blog2_series .category', '.blog_category', '.se-module-category', '.category a', 'a.category'];
  for (const sel of selectors) {
    const t = $(sel).first().text().replace(/\s+/g, ' ').trim();
    if (t && t.length <= 40) return t;
  }
  return null;
}

/** 포스트 본문을 가져와 구조별 텍스트로 분리(STEP 2: 반복빈도/강조/첫문단/마지막문단/H태그) */
async function fetchPostBodyParts(blogId: string, postId: string): Promise<PostBodyParts | null> {
  try {
    const url = `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${encodeURIComponent(postId)}&directAccess=false`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `https://blog.naver.com/${blogId}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    const selectors = ['.se-main-container', '#postViewArea', '.post-view', '#viewTypeSelector'];
    let $content: ReturnType<typeof $> | null = null;
    for (const sel of selectors) {
      const found = $(sel);
      if (found.length > 0 && found.text().trim().length > 10) { $content = found; break; }
    }
    if (!$content) $content = $('body');
    $content.find('script, style, noscript').remove();

    const fullText = $content.text().replace(/\s+/g, ' ').trim();
    if (fullText.length < 20) return null;

    // 소제목/H태그 역할 요소 (네이버 SE3은 실제 h1~h6 대신 이 클래스들을 사용)
    const headingSelectors = ['.se-section-title', '.se-title-text', '.se-component-header', 'h1', 'h2', 'h3', 'h4'];
    const headingText = headingSelectors
      .map(sel => $content!.find(sel).map((_, el) => $(el).text().trim()).get().join(' '))
      .join(' ')
      .trim();

    // 강조(굵게) — 문단 내부의 strong/b만 포함(단독 소제목 strong은 위 heading에서 이미 처리)
    const emphasisText = $content
      .find('.se-text-paragraph strong, .se-text-paragraph b, p strong, p b')
      .map((_, el) => $(el).text().trim())
      .get()
      .join(' ')
      .trim();

    const paragraphs = $content
      .find('.se-text-paragraph')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(t => t.length > 0);
    const fallbackParagraphs = paragraphs.length > 0
      ? paragraphs
      : $content.find('p').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 0);

    return {
      fullText,
      headingText,
      emphasisText,
      firstParagraph: fallbackParagraphs[0] || '',
      lastParagraph: fallbackParagraphs[fallbackParagraphs.length - 1] || '',
      tags: parsePostTags($),
      category: parsePostCategory($),
    };
  } catch {
    return null;
  }
}

/** 호출자 opts와 본문에서 파싱한 태그를 합쳐 중복 제거(호출자 지정 우선). */
function mergeTags(fromOpts: string[] | undefined, fromBody: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...(fromOpts || []), ...fromBody]) {
    const k = (t || '').trim();
    if (k && !seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out.slice(0, 20);
}

function dedupeKeywords(arr: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of arr) {
    const t = (k || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * 포스팅 제목(+선택적 태그/카테고리/브랜드/사용자키워드)을 분석해 대표 키워드 1개 + 보조 여러 개를 추출한다(스펙 #1~#6).
 * 규칙 기반(keyword-candidates)으로 "검색 가능한 1~4단어 핵심 명사구"를 뽑으며, 제목만으로 확신이 서면
 * 본문 크롤링 없이 확정한다(저비용). opts.allowBody=true이고 제목이 애매할 때만 본문을 크롤링해 보정한다(스펙 #5).
 * keywords[0]이 대표, 나머지가 보조. buildAutoKeywords 등 하위 로직은 이 순서를 그대로 사용한다.
 */
export async function extractRepresentativeKeywords(
  blogId: string,
  postId: string,
  title: string,
  opts: RepKeywordExtractOpts = {},
): Promise<RepresentativeKeywordResult> {
  const input = {
    title: title || '',
    tags: opts.tags,
    category: opts.category,
    brandHints: opts.brandHints,
    userKeyword: opts.userKeyword,
  };

  const base = extractKeywordCandidates(input);

  // 제목만으로 확신이 서면(애매하지 않으면) 본문/AI 없이 확정 — 대량 자동추출 저비용(스펙 #5/#20).
  if (base.primary && !base.ambiguous) {
    return { keywords: dedupeKeywords([base.primary, ...base.secondaries]), source: 'title', confidence: base.confidence };
  }

  // 애매한 경우에만 본문을 크롤링해 상위 빈도 명사구로 보정한다.
  let bodyText: string | null = null;
  let withBody: ReturnType<typeof extractKeywordCandidates> | null = null;
  // 본문에서 함께 파싱한 태그/카테고리(추가 크롤링 없음) — AI 보정 신호로도 재사용(스펙 #3③④).
  let mergedTags = opts.tags;
  let mergedCategory = opts.category ?? null;
  if (opts.allowBody) {
    const body = await fetchPostBodyParts(blogId, postId);
    if (body) {
      bodyText = body.fullText;
      mergedTags = mergeTags(opts.tags, body.tags);
      mergedCategory = mergedCategory || body.category;
      withBody = extractKeywordCandidates({ ...input, tags: mergedTags, category: mergedCategory, bodyText: body.fullText });
      // 본문 보정으로 확신이 서면 확정(스펙 #2 본문 분석).
      if (withBody.primary && !withBody.ambiguous) {
        return { keywords: dedupeKeywords([withBody.primary, ...withBody.secondaries]), source: 'title+body', confidence: withBody.confidence };
      }
    }
  }

  // 규칙+본문으로도 애매하면 Claude Haiku로 1회 보정한다(하이브리드, 스펙 #2). 저신뢰 구간에만 진입.
  if (opts.allowAI) {
    const ai = await aiExtractKeyword({ title, tags: mergedTags, category: mergedCategory, bodyText });
    if (ai) {
      return { keywords: dedupeKeywords([ai.primary, ...ai.secondaries]), source: 'ai', confidence: 0.9 };
    }
  }

  // AI 미사용/실패 — 규칙 최선값으로 폴백(본문 보정값 > 제목값), 둘 다 없으면 미확인(스펙 #17).
  if (withBody?.primary) {
    return { keywords: dedupeKeywords([withBody.primary, ...withBody.secondaries]), source: 'title+body', confidence: withBody.confidence };
  }
  if (base.primary) {
    return { keywords: dedupeKeywords([base.primary, ...base.secondaries]), source: 'title', confidence: base.confidence };
  }
  return { keywords: [], source: 'none', confidence: 0 };
}

export interface PersistedRepresentativeKeyword {
  representativeKeyword: string | null;
  candidates: string[];
  source: RepresentativeKeywordResult['source'];
  /** 대표 키워드 신뢰도 0~1 (스펙 #12/#13). manual/cached는 저장값을 그대로 돌려준다. */
  confidence: number;
  cached: boolean;
}

// 포스팅 발행 후 내용이 거의 바뀌지 않는다는 전제 + 매번 네이버 포스트 본문을 크롤링하는 비용을 피하기 위해
// 30일간은 저장된 대표 키워드를 그대로 재사용한다(post_representative_keywords, migration-130).
const REP_KEYWORD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// 추출 규칙(keyword-candidates)을 고칠 때마다 이 값을 올린다. 이 시각 이전에 저장된 행은
// TTL이 남아 있어도 옛 규칙의 결과이므로 재추출한다 — 규칙을 고쳐도 화면이 30일간 그대로인 문제 방지.
const RULE_ENGINE_EPOCH_MS = Date.parse('2026-08-15T08:45:00Z');

// migration-154(confidence, keyword_changed_at)가 아직 적용되지 않은 환경에서도 안전하게 저장되도록
// 추가 컬럼이 없으면 그 키만 빼고 재시도한다(무중단 배포 — 마이그레이션은 나중에 활성화만).
const ADDITIVE_REP_COLUMNS = ['confidence', 'keyword_changed_at'];

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST204' || /confidence|keyword_changed_at|could not find|does not exist|schema cache/i.test(error.message || '');
}

/**
 * post_representative_keywords에 upsert하되, migration-154 미적용(추가 컬럼 없음) 환경에서는
 * 추가 컬럼을 제거하고 한 번 더 시도한다. 반환값은 최종 에러(성공 시 null).
 */
export async function upsertRepresentativeRows(
  supabase: ReturnType<typeof createServiceClient>,
  rows: Record<string, unknown>[],
): Promise<{ code?: string; message?: string } | null> {
  if (rows.length === 0) return null;
  let { error } = await supabase.from('post_representative_keywords').upsert(rows, { onConflict: 'blog_id,post_id' });
  if (isMissingColumnError(error)) {
    const trimmed = rows.map(r => {
      const copy = { ...r };
      for (const k of ADDITIVE_REP_COLUMNS) delete copy[k];
      return copy;
    });
    ({ error } = await supabase.from('post_representative_keywords').upsert(trimmed, { onConflict: 'blog_id,post_id' }));
  }
  return error;
}

/**
 * 대표 키워드를 (blog_id, post_id) 기준으로 조회 → 없거나 오래됐으면 추출 후 저장.
 * 미노출/키워드순위/AI브리핑·탭 메뉴가 모두 이 함수를 통해 동일한 대표 키워드를 공유한다.
 */
export async function getOrPersistRepresentativeKeyword(
  blogId: string,
  postId: string,
  title: string,
  opts: RepKeywordExtractOpts = {},
): Promise<PersistedRepresentativeKeyword> {
  const supabase = createServiceClient();
  // select('*')로 조회 — migration-154(confidence 등) 미적용 환경에서도 컬럼 부재로 실패하지 않게(무중단).
  const { data: existing } = await supabase
    .from('post_representative_keywords')
    .select('*')
    .eq('blog_id', blogId)
    .eq('post_id', postId)
    .maybeSingle() as { data: { representative_keyword: string | null; candidates: string[] | null; keyword_source: string | null; extracted_at: string | null; confidence: number | null } | null };

  // 사용자가 직접 수정한 대표 키워드(keyword_source='manual')는 항상 최우선 — TTL 만료와 무관하게
  // 자동 추출로 절대 덮어쓰지 않는다(스펙 #3/#19). 저장된 값을 그대로 반환한다.
  if (existing && existing.keyword_source === 'manual') {
    const manualKeyword = existing.representative_keyword;
    return {
      representativeKeyword: manualKeyword,
      candidates: existing.candidates && existing.candidates.length > 0
        ? existing.candidates
        : (manualKeyword ? [manualKeyword] : []),
      source: 'manual',
      confidence: 1,
      cached: true,
    };
  }

  const extractedAtMs = existing?.extracted_at ? new Date(existing.extracted_at).getTime() : 0;
  if (existing && extractedAtMs && Date.now() - extractedAtMs < REP_KEYWORD_TTL_MS && extractedAtMs >= RULE_ENGINE_EPOCH_MS) {
    return {
      representativeKeyword: existing.representative_keyword,
      candidates: existing.candidates || [],
      source: (existing.keyword_source as RepresentativeKeywordResult['source']) || 'none',
      confidence: typeof existing.confidence === 'number' ? existing.confidence : 0.5,
      cached: true,
    };
  }

  const result = await extractRepresentativeKeywords(blogId, postId, title, opts);
  const representativeKeyword = result.keywords[0] || null;

  // 대표 키워드가 바뀌면 keyword_changed_at을 갱신해 하위 순위/AI 인용 결과를 '재확인 필요'로 판단할 수 있게 한다(스펙 #23).
  const changed = !!existing && (existing.representative_keyword || null) !== (representativeKeyword || null);
  const nowIso = new Date().toISOString();

  await upsertRepresentativeRows(supabase, [{
    blog_id: blogId,
    post_id: postId,
    post_title: title || null,
    representative_keyword: representativeKeyword,
    candidates: result.keywords,
    keyword_source: result.source,
    confidence: result.confidence,
    extracted_at: nowIso,
    ...(changed ? { keyword_changed_at: nowIso } : {}),
  }]);

  return { representativeKeyword, candidates: result.keywords, source: result.source, confidence: result.confidence, cached: false };
}

/**
 * 사용자가 직접 지정한 대표 키워드를 (blog_id, post_id)에 저장한다(스펙 #3).
 * keyword_source='manual'로 기록되어 이후 자동 추출이 덮어쓰지 않는다.
 * 공용 테이블이므로 미노출/키워드순위/AI인용 화면 모두 이 값을 동일하게 공유한다(스펙 #24/#26).
 * candidate_screen(후보 성과 캐시)은 수동 지정 시 의미가 없으므로 비운다.
 */
export async function setManualRepresentativeKeyword(
  blogId: string,
  postId: string,
  keyword: string,
  title?: string | null,
): Promise<string[]> {
  const supabase = createServiceClient();
  const kw = keyword.trim();

  const { data: existing } = await supabase
    .from('post_representative_keywords')
    .select('*')
    .eq('blog_id', blogId)
    .eq('post_id', postId)
    .maybeSingle() as { data: { representative_keyword: string | null; candidates: string[] | null } | null };

  // 자동 추출된 후보 목록은 남긴다 — 사용자가 후보 중 하나를 대표로 고른 뒤에도 나머지 후보를
  // 계속 보고 다시 고를 수 있어야 하기 때문(직접 입력한 키워드는 후보 맨 앞에 넣는다).
  const candidates = [kw, ...(existing?.candidates || []).filter(c => c && c !== kw)];
  // 대표 키워드가 실제로 바뀐 경우에만 변경 시각을 남긴다 — 이 값보다 앞선 순위/AI 인용 결과는
  // '이전 키워드로 확인한 결과'이므로 화면에서 재확인 대상으로 판단한다.
  const changed = (existing?.representative_keyword || null) !== kw;
  const nowIso = new Date().toISOString();

  await upsertRepresentativeRows(supabase, [{
    blog_id: blogId,
    post_id: postId,
    ...(title != null ? { post_title: title } : {}),
    representative_keyword: kw,
    candidates,
    candidate_screen: [],
    keyword_source: 'manual',
    confidence: 1,
    extracted_at: nowIso,
    ...(changed ? { keyword_changed_at: nowIso } : {}),
  }]);

  return candidates;
}
