import * as cheerio from 'cheerio';
import { createServiceClient } from './supabase-server';
import { extractKeywordCandidates } from './keyword-candidates';

export interface RepresentativeKeywordResult {
  keywords: string[];
  source: 'title+body' | 'title' | 'fallback' | 'none' | 'manual';
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
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface PostBodyParts {
  fullText: string;
  headingText: string;
  emphasisText: string;
  firstParagraph: string;
  lastParagraph: string;
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
    };
  } catch {
    return null;
  }
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

  // 제목만으로 확신이 서면(애매하지 않으면) 본문 크롤링 없이 확정 — 대량 자동추출 저비용(스펙 #5).
  if (base.primary && !(opts.allowBody && base.ambiguous)) {
    return { keywords: dedupeKeywords([base.primary, ...base.secondaries]), source: 'title' };
  }

  // 애매한 경우에만 본문을 크롤링해 상위 빈도 명사구로 보정한다.
  if (opts.allowBody) {
    const body = await fetchPostBodyParts(blogId, postId);
    if (body) {
      const withBody = extractKeywordCandidates({ ...input, bodyText: body.fullText });
      if (withBody.primary) {
        return { keywords: dedupeKeywords([withBody.primary, ...withBody.secondaries]), source: 'title+body' };
      }
    }
  }

  if (base.primary) {
    return { keywords: dedupeKeywords([base.primary, ...base.secondaries]), source: 'title' };
  }
  return { keywords: [], source: 'none' };
}

export interface PersistedRepresentativeKeyword {
  representativeKeyword: string | null;
  candidates: string[];
  source: RepresentativeKeywordResult['source'];
  cached: boolean;
}

// 포스팅 발행 후 내용이 거의 바뀌지 않는다는 전제 + 매번 네이버 포스트 본문을 크롤링하는 비용을 피하기 위해
// 30일간은 저장된 대표 키워드를 그대로 재사용한다(post_representative_keywords, migration-130).
const REP_KEYWORD_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
  const { data: existing } = await supabase
    .from('post_representative_keywords')
    .select('representative_keyword, candidates, keyword_source, extracted_at')
    .eq('blog_id', blogId)
    .eq('post_id', postId)
    .maybeSingle();

  // 사용자가 직접 수정한 대표 키워드(keyword_source='manual')는 항상 최우선 — TTL 만료와 무관하게
  // 자동 추출로 절대 덮어쓰지 않는다(스펙 #3). 저장된 값을 그대로 반환한다.
  if (existing && existing.keyword_source === 'manual') {
    const manualKeyword = existing.representative_keyword;
    return {
      representativeKeyword: manualKeyword,
      candidates: existing.candidates && existing.candidates.length > 0
        ? existing.candidates
        : (manualKeyword ? [manualKeyword] : []),
      source: 'manual',
      cached: true,
    };
  }

  if (existing?.extracted_at && Date.now() - new Date(existing.extracted_at).getTime() < REP_KEYWORD_TTL_MS) {
    return {
      representativeKeyword: existing.representative_keyword,
      candidates: existing.candidates || [],
      source: (existing.keyword_source as RepresentativeKeywordResult['source']) || 'none',
      cached: true,
    };
  }

  const result = await extractRepresentativeKeywords(blogId, postId, title, opts);
  const representativeKeyword = result.keywords[0] || null;

  await supabase.from('post_representative_keywords').upsert({
    blog_id: blogId,
    post_id: postId,
    post_title: title || null,
    representative_keyword: representativeKeyword,
    candidates: result.keywords,
    keyword_source: result.source,
    extracted_at: new Date().toISOString(),
  }, { onConflict: 'blog_id,post_id' });

  return { representativeKeyword, candidates: result.keywords, source: result.source, cached: false };
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
): Promise<void> {
  const supabase = createServiceClient();
  const kw = keyword.trim();
  await supabase.from('post_representative_keywords').upsert({
    blog_id: blogId,
    post_id: postId,
    ...(title != null ? { post_title: title } : {}),
    representative_keyword: kw,
    candidates: [kw],
    candidate_screen: [],
    keyword_source: 'manual',
    extracted_at: new Date().toISOString(),
  }, { onConflict: 'blog_id,post_id' });
}
