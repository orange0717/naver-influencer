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
