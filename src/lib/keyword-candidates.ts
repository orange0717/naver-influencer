// 대표 키워드 후보 생성 + 점수화 (스펙 #2~#6) — 순수 함수(네트워크 X), vitest 대상.
//
// 목적: 포스팅 "제목"을 검색 의도를 대표하는 1~4단어 명사구로 뽑는다.
//   - 제목을 단순 어절로 쪼개 한 글자/일반어(지혜·단상)나 조사 붙은 토큰(솔로몬의)을 대표로 뽑지 않는다.
//   - 규칙 기반 후보 생성 → 점수화 → 최고점 1개=대표, 다음=보조. (애매하면 호출측이 본문/AI 보정)
//
// 데이터 우선순위(스펙 #1): 제목 > 태그/해시태그 > 본문 명사구 > 카테고리 > 사용자 입력 > 검색 유입.
// 이 모듈은 제목을 1차로 쓰고, tags/category/bodyText/userKeyword/brandHints가 주어지면 점수에 반영한다.

import { STOPWORDS } from './blog-crawler';
import { normalizeKeyword } from './keyword-normalize';

// 일반어(대표 부적합, 스펙 #3/#4 예시 + 확장) — 단독이거나 구 전체가 일반어면 감점.
const GENERIC_WORDS = new Set([
  '추천', '후기', '리뷰', '정리', '정보', '이야기', '얘기', '생각', '느낌', '일상', '좋은', '방법', '소개',
  '단상', '꿀팁', '모음', '총정리', '기록', '일기', '근황', '리스트', '사용법', '사용후기', '내돈내산',
  '베스트', '인기', '화제', '트렌드', '공유', '최고', '최신', '가지', '것', '점',
  'best', 'top', 'review', 'tip', 'tips',
]);

// 구 끝에서 떼어낼 장식어(스펙 #4) — 검색 의도의 핵심어가 아님. 소문자 비교.
const TRAILING_DECORATORS = new Set([
  '추천', '후기', '리뷰', '정리', '정보', '이야기', '단상', '일상', '꿀팁', '방법', '소개',
  '모음', '총정리', '기록', '근황', '얘기',
  'best', 'top',
]);

// 어절 끝 조사 — 길이 내림차순으로 시도하며, 명사 어간이 2자 이상 남을 때만 제거(과대제거 방지).
// 예) 솔로몬의 → 솔로몬 / 글귀를 → 글귀 / 사과(과) → 어간 1자라 제거 안 함.
const JOSA_SUFFIXES = [
  '이라는', '에서', '으로', '에게', '한테', '까지', '부터', '처럼', '보다', '라는',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로',
];

// 따옴표/괄호로 감싼 작품·책 제목 추출(스펙 #3: 작품명/책 제목 우선). 2~40자만.
const WORK_TITLE_RE = /[《〈「『“"'']([^》〉」』”"'']{2,40})[》〉」』”"'']/gu;

const W_POSITION_FRONT = 3;   // 제목 앞부분 등장
const W_TITLE_REPEAT = 2;     // 제목에서 반복 등장
const W_PROPER = 3;           // 고유명사(작품/브랜드/기관/인물/복합명사)
const W_BRAND = 7;            // 브랜드/기관명 힌트 일치 — 최우선(스펙 #3). 다른 후보를 압도하도록 크게.
const W_PHRASE_2_4 = 3;       // 2~4단어 의미 있는 명사구
const W_BODY_FREQ = 2;        // 본문 상위 빈도
const W_TAG = 2;              // 태그/해시태그 일치
const W_CATEGORY = 1;         // 카테고리 연관
const P_GENERIC = 3;          // 일반어 감점(−3)
const P_JUNK = 5;             // 한 글자/의미없는 토큰 감점(−5)
// 조사 제거로 생긴 파생 단독 토큰(예: 솔로몬의→솔로몬) 감점: 원 제목의 온전한 어절이 아니라
// 더 긴 명사구의 머리(fragment)이므로, 단독보다 그 구(句) 형태가 대표가 되도록 낮춘다.
// 반면 온전한 복합명사(오렌지도서관)는 파생이 아니라 감점 없음.
const P_DERIVED_SINGLE = 2;

function lower(s: string): string {
  return s.toLowerCase();
}

/** 어절 끝 조사 1개 제거(어간 2자 이상 유지 시에만). */
export function stripJosa(token: string): string {
  for (const j of JOSA_SUFFIXES) {
    if (token.length >= j.length + 2 && token.endsWith(j)) {
      return token.slice(0, token.length - j.length);
    }
  }
  return token;
}

function isDecorator(token: string): boolean {
  return TRAILING_DECORATORS.has(lower(token));
}

function isStopOrGeneric(token: string): boolean {
  const t = lower(token);
  return STOPWORDS.has(t) || GENERIC_WORDS.has(t);
}

/** 제목에서 이모지·기호를 공백으로 치환하고 어절 배열로 분리(원형 유지 — 조사 미제거). */
function tokenizeTitle(title: string): string[] {
  const cleaned = title
    // 이모지/기호류 → 공백 (한글/영숫자/공백만 남김)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.split(' ').filter(Boolean) : [];
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

export interface KeywordCandidate {
  keyword: string;   // 화면·검색에 쓰는 표시값
  score: number;
  tokens: number;    // 어절 수
  proper: boolean;   // 고유명사/브랜드 판정
}

export interface ExtractInput {
  title: string;
  tags?: string[];
  category?: string | null;
  /** 브랜드/기관명 힌트(예: 블로그 대표 이름). 일치 후보를 대표로 강하게 밀어줌(스펙 #3). */
  brandHints?: string[];
  /** 사용자가 직접 입력한 키워드(스펙 #1 우선순위 #5). */
  userKeyword?: string | null;
  /** 애매한 경우 본문 보정용 텍스트(스펙 #5). 없으면 제목만으로 결정. */
  bodyText?: string | null;
}

export interface ExtractResult {
  primary: string | null;
  secondaries: string[];
  candidates: KeywordCandidate[];
  /** true면 제목만으로 확신이 낮음 — 호출측이 본문/AI 보정을 고려할 수 있음(스펙 #5). */
  ambiguous: boolean;
}

interface RawCandidate {
  surface: string;
  startIndex: number;
  tokenCount: number;
  /** 조사 제거로 원 어절과 달라진 단독 토큰인지(fragment 판정). */
  derived: boolean;
}

/** 제목 토큰에서 1~4어절 명사구 후보 생성(끝 장식어 제거, 1어절은 조사 제거). */
function buildRawCandidates(tokens: string[]): RawCandidate[] {
  const out: RawCandidate[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let len = 1; len <= 4 && i + len <= tokens.length; len++) {
      const slice = tokens.slice(i, i + len);
      // 끝 장식어 제거(스펙 #4)
      while (slice.length > 0 && isDecorator(slice[slice.length - 1])) slice.pop();
      if (slice.length === 0) continue;
      // 표시값은 항상 원 제목의 어절 그대로 둔다(조사 제거로 표기를 훼손하지 않음 — 제주도→제주 방지).
      // 단독 토큰이 조사로 끝나면(솔로몬의) derived로 표시해 점수만 낮춘다.
      const surface = slice.join(' ');
      const derived = slice.length === 1 && stripJosa(slice[0]) !== slice[0];
      if (!surface.trim()) continue;
      out.push({ surface: surface.trim(), startIndex: i, tokenCount: slice.length, derived });
    }
  }
  return out;
}

function isProperNounish(surface: string, brandHints: string[]): boolean {
  const s = surface.trim();
  const norm = normalizeKeyword(s);
  if (brandHints.some(b => normalizeKeyword(b) === norm)) return true;
  if (/[a-zA-Z]/.test(s)) return true; // 영문 브랜드/작품명
  if (!s.includes(' ')) {
    const core = stripJosa(s);
    // 공백 없는 3음절+ 비일반 복합명사 → 고유명사(브랜드/기관/작품)로 간주
    return core.length >= 3 && !isStopOrGeneric(core);
  }
  return false;
}

function isBrandHit(surface: string, brandHints: string[]): boolean {
  const norm = normalizeKeyword(surface);
  return brandHints.some(b => normalizeKeyword(b) === norm);
}

function allTokensGeneric(surface: string): boolean {
  const parts = surface.split(' ').filter(Boolean);
  return parts.length > 0 && parts.every(isStopOrGeneric);
}

/** 본문 텍스트에서 어절 빈도 맵(정규화 키) — 애매한 경우 보정용. */
function buildBodyFreq(bodyText: string | null | undefined): Map<string, number> {
  const freq = new Map<string, number>();
  if (!bodyText) return freq;
  // 후보 정규화값과 매칭되도록 원형 기준으로 집계(조사 제거 없이). 단독 토큰 빈도 보정용.
  const words = tokenizeTitle(bodyText).map(normalizeKeyword).filter(w => w.length >= 2);
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return freq;
}

function scoreCandidate(
  cand: RawCandidate,
  ctx: {
    normTitle: string;
    tagsNorm: Set<string>;
    categoryNorm: string;
    brandHints: string[];
    bodyFreq: Map<string, number>;
  },
): KeywordCandidate {
  const { surface, startIndex, tokenCount } = cand;
  const norm = normalizeKeyword(surface);
  const spaceless = surface.replace(/\s/g, '');
  const proper = isProperNounish(surface, ctx.brandHints);

  // 한 글자·순수 숫자·단독 불용어 → 의미 없는 토큰(스펙 #5 −5)
  if (spaceless.length < 2 || /^\d+$/.test(spaceless) || (tokenCount === 1 && STOPWORDS.has(norm))) {
    return { keyword: surface, score: -P_JUNK, tokens: tokenCount, proper: false };
  }

  let s = 0;
  if (startIndex === 0) s += W_POSITION_FRONT;
  if (countOccurrences(ctx.normTitle, norm) >= 2) s += W_TITLE_REPEAT;
  if (isBrandHit(surface, ctx.brandHints)) s += W_BRAND;
  else if (proper) s += W_PROPER;
  if (tokenCount >= 2 && tokenCount <= 4 && !allTokensGeneric(surface)) s += W_PHRASE_2_4;
  if ((ctx.bodyFreq.get(norm) ?? 0) >= 2) s += W_BODY_FREQ;
  if (ctx.tagsNorm.has(norm)) s += W_TAG;
  if (ctx.categoryNorm && (ctx.categoryNorm.includes(norm) || norm.includes(ctx.categoryNorm))) s += W_CATEGORY;

  // 일반어 감점(스펙 #5 −3): 단독 일반어 또는 구 전체가 일반어
  if ((tokenCount === 1 && GENERIC_WORDS.has(norm)) || (tokenCount >= 2 && allTokensGeneric(surface))) {
    s -= P_GENERIC;
  }

  // 조사 제거로 생긴 파생 단독 토큰(fragment)은 단독 대표로 부적합 → 감점(브랜드 힌트 일치 시 예외).
  if (tokenCount === 1 && cand.derived && !isBrandHit(surface, ctx.brandHints)) {
    s -= P_DERIVED_SINGLE;
  }

  return { keyword: surface, score: s, tokens: tokenCount, proper };
}

/** primary와 부분문자열로 겹치지 않는 후보만 골라 보조 목록 구성(중복·포함관계 제거). */
function pickSecondaries(sorted: KeywordCandidate[], primary: string, max: number): string[] {
  const picked: string[] = [];
  const primaryNorm = normalizeKeyword(primary);
  for (const c of sorted) {
    const norm = normalizeKeyword(c.keyword);
    if (norm === primaryNorm) continue;
    if (c.score <= -P_GENERIC) continue; // 감점 후보는 보조에서도 제외
    if (norm.includes(primaryNorm) || primaryNorm.includes(norm)) continue;
    if (picked.some(p => {
      const pn = normalizeKeyword(p);
      return pn.includes(norm) || norm.includes(pn);
    })) continue;
    picked.push(c.keyword);
    if (picked.length >= max) break;
  }
  return picked;
}

/**
 * 제목(+선택적 태그/카테고리/본문/브랜드힌트/사용자키워드)에서 대표 키워드 후보를 생성·점수화한다.
 * 반환: 대표 1 + 보조 최대 3 + 점수순 후보 전체 + 애매 여부.
 */
export function extractKeywordCandidates(input: ExtractInput, maxSecondaries = 3): ExtractResult {
  const title = (input.title || '').trim();
  const tokens = tokenizeTitle(title);

  // 따옴표/괄호로 감싼 작품·책 제목(스펙 #3) — 검색 의도의 핵심이므로 브랜드 힌트로 승격해 대표에 강하게 반영.
  const workTitles: string[] = [];
  let m: RegExpExecArray | null;
  const workRe = new RegExp(WORK_TITLE_RE);
  while ((m = workRe.exec(title)) !== null) {
    const inner = m[1].trim();
    if (inner.length >= 2) workTitles.push(inner);
  }

  const brandHints = [...(input.brandHints || []), ...workTitles].filter(Boolean);
  const ctx = {
    normTitle: normalizeKeyword(title),
    tagsNorm: new Set((input.tags || []).map(normalizeKeyword).filter(Boolean)),
    categoryNorm: normalizeKeyword(input.category || ''),
    brandHints,
    bodyFreq: buildBodyFreq(input.bodyText),
  };

  // 후보 풀: 제목 명사구 + 따옴표 작품명 + 태그 + 사용자 입력 키워드
  const raw: RawCandidate[] = buildRawCandidates(tokens);
  for (const inner of workTitles) {
    raw.push({ surface: inner, startIndex: 0, tokenCount: inner.split(' ').filter(Boolean).length || 1, derived: false });
  }
  // 태그 후보(제목에 없더라도 검색 의도 보조)
  for (const tag of input.tags || []) {
    const t = tag.replace(/^#/, '').trim();
    if (t.length >= 2) raw.push({ surface: t, startIndex: 99, tokenCount: t.split(' ').filter(Boolean).length || 1, derived: false });
  }

  // 정규화 기준 중복 제거(가장 앞선 startIndex·짧은 형태 우선)
  const bySurface = new Map<string, RawCandidate>();
  for (const c of raw) {
    const key = normalizeKeyword(c.surface);
    if (!key) continue;
    const prev = bySurface.get(key);
    if (!prev || c.startIndex < prev.startIndex) bySurface.set(key, c);
  }

  const scored = [...bySurface.values()]
    .map(c => scoreCandidate(c, ctx))
    // 점수 desc → 고유명사 우선 → 짧은 표시값(간결) → 어절 적은 순
    .sort((a, b) =>
      b.score - a.score ||
      Number(b.proper) - Number(a.proper) ||
      a.keyword.length - b.keyword.length ||
      a.tokens - b.tokens,
    );

  // 사용자 직접 입력 키워드는 최우선(스펙 #1 우선순위 #5, #7의 manual 이전 단계)
  const userKeyword = (input.userKeyword || '').trim();
  let primary: string | null = null;
  if (userKeyword) {
    primary = userKeyword;
  } else {
    primary = scored.find(c => c.score > -P_GENERIC)?.keyword ?? scored[0]?.keyword ?? null;
  }

  const secondaries = primary ? pickSecondaries(scored, primary, maxSecondaries) : [];

  // 애매 판정: 최고점이 낮거나(고유명사·의미구 근거 없음) 상위 동점이 고유명사가 아님
  const top = scored[0];
  const second = scored[1];
  const ambiguous = !userKeyword && (
    !top ||
    top.score < W_PHRASE_2_4 ||
    (!!second && top.score === second.score && !top.proper)
  );

  return { primary, secondaries, candidates: scored, ambiguous };
}
