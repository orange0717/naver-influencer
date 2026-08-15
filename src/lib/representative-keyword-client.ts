import type { AutoKeyword } from './keyword-normalize';

/**
 * 대표 키워드 추출 클라이언트 — 키워드순위 화면과 AI 브리핑·AI 탭 화면이 "같은" 추출 경로를 쓰도록
 * /api/blog/representative-keywords GET 호출을 한 곳으로 모은 것.
 * 두 화면이 각자 fetch를 들고 있으면 추출 옵션(refine/ai)이 어긋나 같은 포스팅에서 서로 다른
 * 대표 키워드가 나오는 문제가 생긴다.
 */

export interface CandidateScreenEntry {
  keyword: string;
  exposed: boolean;
  rank: number | null;
}

export interface RepKeywordExtraction {
  keyword: string | null;
  source: string | null;
  confidence: number | null;
  /** 제목 분석으로 뽑힌 검색 가능한 키워드 후보 전체(대표 포함) */
  candidates: string[];
  candidateScreen: CandidateScreenEntry[];
  autoKeywords: AutoKeyword[];
}

/**
 * 포스팅 제목을 분석해 대표 키워드 1개 + 후보 목록을 얻는다(규칙기반, 네이버 무호출).
 *   - refine: 제목이 애매할 때만 본문 1회 보정(개별 재추출 버튼 등 명시적 단건 액션에서만)
 *   - ai: 규칙+본문으로도 애매하면 Claude 1회 보정
 * 결과는 서버가 post_representative_keywords에 영속화하므로 두 화면이 즉시 같은 값을 본다.
 */
export async function extractRepresentativeKeyword(
  blogId: string,
  post: { id: string; title: string },
  opts: { refine?: boolean; ai?: boolean } = {},
): Promise<RepKeywordExtraction | null> {
  const params = new URLSearchParams({ blogId, postId: post.id, title: post.title });
  if (opts.refine) params.set('refine', '1');
  if (opts.ai) params.set('ai', '1');
  try {
    const res = await fetch(`/api/blog/representative-keywords?${params.toString()}`);
    if (!res.ok) return null;
    const data: {
      representativeKeyword?: string | null;
      source?: string | null;
      confidence?: number | null;
      keywords?: string[];
      candidateScreen?: CandidateScreenEntry[];
      autoKeywords?: AutoKeyword[];
    } = await res.json();
    return {
      keyword: data.representativeKeyword || null,
      source: data.source ?? null,
      confidence: typeof data.confidence === 'number' ? data.confidence : null,
      candidates: data.keywords || [],
      candidateScreen: data.candidateScreen || [],
      autoKeywords: data.autoKeywords || [],
    };
  } catch {
    return null;
  }
}

/** 일괄 추출 1회 호출당 포스팅 수 — 서버 라우트의 MAX_POSTS_PER_CALL(50) 이내로 맞춘다. */
export const BULK_EXTRACT_CHUNK = 25;

export interface BulkExtractResult {
  results: Record<string, RepKeywordExtraction>;
  /** 서버 시간예산 초과로 처리하지 못한 개수(클라이언트가 다음 호출로 이어서 보낸다) */
  skipped: number;
}

/**
 * 대표 키워드가 없는 포스팅을 한 번의 요청으로 묶어 추출한다(키워드 순위 화면의 '대표키워드 추출' 버튼).
 * 개별 추출과 같은 규칙·같은 저장 경로를 쓰되, 대량 실행이라 본문/AI 보정 없이 제목 규칙만 사용한다.
 */
export async function extractRepresentativeKeywordsBulk(
  blogId: string,
  posts: { id: string; title: string }[],
): Promise<BulkExtractResult | null> {
  if (posts.length === 0) return { results: {}, skipped: 0 };
  try {
    const res = await fetch('/api/my/representative-keywords/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blogId, posts: posts.map(p => ({ postId: p.id, title: p.title })) }),
    });
    if (!res.ok) return null;
    const data: {
      results?: Record<string, {
        keyword?: string | null;
        source?: string | null;
        confidence?: number | null;
        candidates?: string[];
        autoKeywords?: AutoKeyword[];
      }>;
      skipped?: number;
    } = await res.json();

    const results: Record<string, RepKeywordExtraction> = {};
    for (const [postId, r] of Object.entries(data.results || {})) {
      results[postId] = {
        keyword: r.keyword || null,
        source: r.source ?? null,
        confidence: typeof r.confidence === 'number' ? r.confidence : null,
        candidates: r.candidates || [],
        candidateScreen: [],
        autoKeywords: r.autoKeywords || [],
      };
    }
    return { results, skipped: data.skipped || 0 };
  } catch {
    return null;
  }
}
