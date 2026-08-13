// 키워드 정규화 & 공백제거 변형 생성 (스펙 #3, #11)
//
// 순위 조회는 "포스팅 제목에서 뽑은 핵심 키워드"와 그 "공백제거 변형"을 함께 조회한다.
//   예) "짧고 좋은 글귀" → 변형 "짧고좋은글귀"
// 단, 모든 어절을 무조건 붙이지 않는다 — 자연스러운 검색어로 판단될 때만 변형을 만든다(스펙 #3 단서).

/** 검색용 정규화: 다중 공백 → 단일 공백, 앞뒤 공백 제거, 영문 소문자화. 한글에는 영향 없음.
 *  normalized_keyword(중복 판정·매칭 기준)로 저장하는 값이며, 화면 표시값과는 별개다. */
export function normalizeKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 공백제거 변형을 생성한다. 부적합하면 null.
 *  - 이미 공백이 없으면 변형 없음(예: "판타지소설추천")
 *  - 어절 수가 4 이상이면(너무 긴 구) 부자연 검색어로 보고 변형하지 않음
 *  - 공백제거 결과 길이가 2~12자 범위를 벗어나면 검색어로 부적절 → 변형하지 않음
 *    (post-keyword-extractor.ts의 isSearchTermShaped와 동일 기준)
 */
export function buildSpacelessVariant(keyword: string): string | null {
  const trimmed = keyword.replace(/\s+/g, ' ').trim();
  if (!trimmed.includes(' ')) return null;
  const words = trimmed.split(' ');
  if (words.length > 3) return null;
  const spaceless = words.join('');
  const len = spaceless.length;
  if (len < 2 || len > 12) return null;
  if (spaceless === trimmed) return null;
  return spaceless;
}

export type KeywordVariantType = 'base' | 'variant';

export interface ExpandedKeyword {
  keyword: string;          // 화면·검색에 쓰는 원본 표시값
  normalized: string;       // 중복 판정·매칭 기준
  variantType: KeywordVariantType;
  /** 이 키워드가 파생된 원본 키워드(변형인 경우). base면 자기 자신. */
  baseKeyword: string;
}

/**
 * 하나의 키워드를 [원본, (공백제거 변형)]으로 확장한다.
 * 변형이 부적합하거나 원본과 정규화 후 동일하면 원본만 반환.
 */
export function expandKeyword(keyword: string): ExpandedKeyword[] {
  const base = keyword.replace(/\s+/g, ' ').trim();
  if (!base) return [];
  const out: ExpandedKeyword[] = [
    { keyword: base, normalized: normalizeKeyword(base), variantType: 'base', baseKeyword: base },
  ];
  const variant = buildSpacelessVariant(base);
  if (variant && normalizeKeyword(variant) !== normalizeKeyword(base)) {
    out.push({ keyword: variant, normalized: normalizeKeyword(variant), variantType: 'variant', baseKeyword: base });
  }
  return out;
}

/**
 * 여러 키워드를 확장하고 normalized 기준으로 중복 제거한다(스펙 #15의 "동일 키워드 인식").
 * 입력 순서를 보존하며, 먼저 등장한 것을 유지한다.
 */
export function expandKeywords(keywords: string[]): ExpandedKeyword[] {
  const seen = new Set<string>();
  const out: ExpandedKeyword[] = [];
  for (const kw of keywords) {
    for (const expanded of expandKeyword(kw)) {
      if (seen.has(expanded.normalized)) continue;
      seen.add(expanded.normalized);
      out.push(expanded);
    }
  }
  return out;
}

export type AutoKeywordType = 'primary' | 'secondary' | 'variant';

export interface AutoKeyword {
  keyword: string;
  normalized: string;
  keywordType: AutoKeywordType;
  isPrimary: boolean;
  /** 파생 원본(변형이면 원본 키워드, base면 자기 자신) */
  baseKeyword: string;
}

/** buildAutoKeywords가 참고하는 후보 스크리닝 결과(대표 선정 근거) */
export interface CandidateScreenLike {
  keyword: string;
  exposed: boolean;
  rank: number | null;
}

/**
 * 포스팅의 자동 조회 키워드 집합을 구성한다(스펙 #4/#5/#14):
 *   대표 1(+공백제거 변형) + 보조 최대 2(+각 변형).
 * 보조는 스크리닝 결과(노출 우선, 낮은 순위 우선)에서 대표를 제외한 상위 2개를 고르고,
 * 스크리닝이 없으면 후보 배열(=추출 점수) 순서로 고른다.
 * normalized 기준 전역 중복 제거(스펙 #15) — 대표 변형과 보조가 겹치면 하나만 남는다.
 */
export function buildAutoKeywords(
  representativeKeyword: string | null,
  candidates: string[],
  candidateScreen: CandidateScreenLike[] = [],
  maxSecondary = 2,
): AutoKeyword[] {
  const primary = (representativeKeyword || candidates[0] || '').replace(/\s+/g, ' ').trim();
  if (!primary) return [];
  const primaryNorm = normalizeKeyword(primary);

  // 보조 후보 순서 결정: 스크리닝이 있으면 (노출 desc, rank asc), 없으면 후보 배열 순서
  const ranked: string[] = candidateScreen.length > 0
    ? [...candidateScreen]
        .sort((a, b) => {
          if (a.exposed !== b.exposed) return a.exposed ? -1 : 1;
          if (a.exposed && b.exposed) return (a.rank ?? Infinity) - (b.rank ?? Infinity);
          return 0;
        })
        .map(e => e.keyword)
    : [...candidates];

  const secondaries = ranked
    .map(k => k.replace(/\s+/g, ' ').trim())
    .filter(k => k && normalizeKeyword(k) !== primaryNorm)
    .filter((k, i, arr) => arr.findIndex(x => normalizeKeyword(x) === normalizeKeyword(k)) === i)
    .slice(0, maxSecondary);

  const out: AutoKeyword[] = [];
  const seen = new Set<string>();
  const push = (kw: string, type: AutoKeywordType, isPrimary: boolean, base: string) => {
    const norm = normalizeKeyword(kw);
    if (seen.has(norm)) return;
    seen.add(norm);
    out.push({ keyword: kw, normalized: norm, keywordType: type, isPrimary, baseKeyword: base });
  };

  // 대표 + 대표 변형
  for (const e of expandKeyword(primary)) {
    push(e.keyword, e.variantType === 'variant' ? 'variant' : 'primary', e.variantType === 'base', primary);
  }
  // 보조 + 각 변형
  for (const sec of secondaries) {
    for (const e of expandKeyword(sec)) {
      push(e.keyword, e.variantType === 'variant' ? 'variant' : 'secondary', false, sec);
    }
  }
  return out;
}
