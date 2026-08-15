// 대표 키워드 후보 생성 + 점수화 (스펙 #2~#13) — 순수 함수(네트워크 X), vitest 대상.
//
// 목적: 포스팅 "제목"을 검색 의도를 대표하는 1~4어절 명사구 1개로 뽑는다.
//   - 제목을 단순 어절로 쪼개 한 글자/일반어/조사토큰(솔로몬의·지혜·단상)이나 회차(1편)를 대표로 뽑지 않는다.
//   - 복합 고유명사(달러구트 꿈 백화점)를 절대 쪼개지 않는다(스펙 #3) — "최대 명사구"를 대표로 선호.
//   - 규칙 기반 후보 생성 → 점수화 → 최고점 1개=대표, 다음=보조. (애매하면 미확인 처리, 스펙 #13)
//
// 핵심 알고리즘(스펙 #3/#10):
//   1) 제목을 어절로 나누고, 각 어절을 content(내용어)/number(숫자)/skip(경계)로 분류한다.
//      - skip = 일반어(추천/후기…)·장식어·회차(1편/2부)·날짜(2026년)·목적격 조사절(운명을)·관형형 용언(바꾸는).
//      - number = 맨 숫자(17). 구(句) 중간이면 흡수(아이폰 17), 맨 앞이면 버린다.
//   2) content 어절의 "최대 연속 구간(run)"을 만든다. 단, 구간 중간에 그 자체로 강한 고유명사
//      (한글 4자+ 복합명사, 예: 오렌지도서관)가 나오면 새 개체의 시작으로 보고 구간을 끊는다.
//   3) 각 run 전체(≤4어절)를 최대 명사구 후보로, 부분 구간을 보조 후보로 만들어 점수화한다.
//      최대 명사구에 가산점(W_MAXIMAL)을 주고 그 조각(fragment)에는 감점을 줘 "쪼개짐"을 막는다.
//
// 데이터 우선순위(스펙 #1): 제목 > 사용자 입력 > 태그 > 본문 핵심 > 카테고리 > 검색 유입.

import { STOPWORDS } from './blog-crawler';
import { normalizeKeyword } from './keyword-normalize';

// 일반어(대표 부적합, 스펙 #7 예시 + 확장) — 단독이거나 구 전체가 일반어면 감점/경계.
const GENERIC_WORDS = new Set([
  '추천', '후기', '리뷰', '정리', '정보', '이야기', '얘기', '생각', '느낌', '일상', '좋은', '방법', '소개',
  '단상', '꿀팁', '모음', '총정리', '기록', '일기', '근황', '리스트', '사용법', '사용후기', '내돈내산',
  '베스트', '인기', '화제', '트렌드', '공유', '최고', '최신', '가지', '것', '점', '더', '완전', '진짜',
  '뜻', '순위', '도서추천', '책추천',
  // 후기·감상 유형어 — 검색 의도이지 대상이 아니다(개봉기·감상평·완독…).
  '베스트셀러', '개봉기', '감상평', '감상', '사용기', '체험기', '방문기', '완독', '결말', '해석', '신청방법', '선택',
  // 판매처/플랫폼 — 대상이 아니라 유통 경로다.
  '예스24', 'yes24', '교보문고', '알라딘', '밀리의서재', '리디북스',
  'best', 'top', 'review', 'tip', 'tips',
]);

// 구 끝에서 떼어낼 장식어(스펙 #4/#7) — 검색 의도의 핵심어가 아님. 소문자 비교.
const TRAILING_DECORATORS = new Set([
  '추천', '후기', '리뷰', '정리', '정보', '이야기', '단상', '일상', '꿀팁', '방법', '소개',
  '모음', '총정리', '기록', '근황', '얘기', '리스트', '뜻', '순위',
  '베스트셀러', '개봉기', '감상평', '감상', '사용기', '체험기', '방문기', '완독', '결말', '해석', '신청방법', '선택',
  'best', 'top',
]);

// 붙여 만든 복합 키워드(스펙 #8: 판타지소설추천·부동산책추천)를 이루는 꼬리 일반어.
// 이런 토큰은 "매끄럽지 않은 자동결합"이라 대표 후보로는 낮춘다.
const SMUSH_TAILS = ['추천', '후기', '리뷰', '정리', '정보', '모음', '총정리', '추천도서', '추천글', '도서추천', '책추천'];

// 회차/편수/권/화 등(스펙 #4) — 대표에서 제외(경계). 예: 1편·2부·3권·10화·시즌2·top6.
const EPISODE_RE = /^(\d+\s*(편|부|권|화|회|탄|기|장|주차|일차|부작|시즌)|시즌\s*\d+|top\s*\d+)$/i;
// 판형/회차 성격의 짧은 "…편"(기초편·특별편·번외편·단편)도 경계로 본다(숫자 없는 회차, 스펙 #4).
const EDITION_TAIL_RE = /^[가-힣]{1,2}편$/;
// 날짜성 토큰(스펙 #4) — 2026년·7월·15일. 대표에서 제외(경계).
const DATE_RE = /^\d+\s*(년|월|일)$/;
// 순수 숫자(17). 구 중간이면 모델명으로 흡수(아이폰 17), 맨 앞이면 버린다.
const BARE_NUMBER_RE = /^\d+$/;

// 구(run) 경계 표식 — 괄호류(부가설명)를 제목 본류와 분리하기 위해 tokenizeTitle이 삽입한다(스펙 #1: 제목 우선).
// 예) "인생명언 (전도서 말씀구절 中)" → "인생명언"이 본류, 괄호 안은 별개 run으로 분리.
const RUN_BREAK = '§';

// 어절 끝 조사 — 길이 내림차순으로 시도하며, 명사 어간이 2자 이상 남을 때만 제거(과대제거 방지).
// 예) 솔로몬의 → 솔로몬 / 글귀를 → 글귀 / 사과(과) → 어간 1자라 제거 안 함.
const JOSA_SUFFIXES = [
  '이라는', '에서', '으로', '에게', '한테', '까지', '부터', '처럼', '보다', '라는',
  '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '도', '만', '로',
];

// 형용사·동사의 연결형(쉽고·좋고)과 부사형(빠르게·쉽게) — 수식어라 대표 키워드가 될 수 없다.
// '냉장고·광고·경기고·가게'처럼 같은 글자로 끝나는 명사를 오탐하면 안 되므로 어간을 화이트리스트로 고정한다.
const MODIFIER_STEMS = [
  '쉽', '좋', '싸', '크', '작', '넓', '좁', '높', '낮', '길', '짧', '밝', '많', '적',
  '달', '쓰', '짜', '맵', '떫', '얇', '두껍', '무겁', '가볍', '차갑', '뜨겁',
  '빠르', '느리', '예쁘', '이쁘', '새롭', '부드럽', '맛있', '맛없', '재밌', '재미있',
  '따뜻하', '시원하', '간단하', '간편하', '저렴하', '깔끔하', '든든하', '편하', '불편하',
  '진하', '연하', '강하', '약하', '깨끗하', '특별하', '대단하', '훌륭하', '유명하', '다양하',
];
const MODIFIER_RE = new RegExp(`^(?:${MODIFIER_STEMS.join('|')})(?:고|게)$`);

// 정도부사 — 그 자체로는 검색어가 아니지만 뒤 말과 묶여 제목을 이루기도 한다("더 빠르게 실패하기").
const DEGREE_ADVERBS = new Set([
  '더', '가장', '제일', '너무', '아주', '매우', '훨씬', '좀', '조금', '덜', '완전', '진짜', '정말', '꽤', '엄청',
]);

/** 수식 어절(연결형 '-고' / 부사형 '-게' / 정도부사)인지 — 단독으로는 대표가 될 수 없다. */
function isModifierWord(token: string): boolean {
  return MODIFIER_RE.test(token) || DEGREE_ADVERBS.has(lower(token));
}

// 용언 명사형(실패하기·만들기) — 단독으로는 아무도 검색하지 않는 조각이라,
// 앞 수식어를 도로 붙여 구(句)로 만들거나(더 빠르게 실패하기) AI 보정으로 넘긴다.
const VERBAL_NOUN_RE = /(하기|되기|쓰기|읽기|듣기|먹기|살기|짓기|찾기|만들기|버리기|배우기|기르기|키우기)$/;

function isVerbalNoun(token: string): boolean {
  return token.length >= 3 && VERBAL_NOUN_RE.test(token);
}

/**
 * 맨 숫자가 구 "중간"에 흡수된 경우 — 그 숫자가 개체의 끝인지(달리구도 못해낸 300 | 원화집)
 * 아니면 개체 내부인지(아이폰 17 프로) 규칙만으로는 못 가른다. 신뢰도를 낮춰 AI 보정에 넘긴다.
 * 끝자리 숫자(트렌드 코리아 2026)는 경계가 분명하므로 해당 없음.
 */
function hasMidPhraseNumber(phrase: string): boolean {
  const parts = phrase.trim().split(/\s+/);
  return parts.slice(0, -1).some(p => BARE_NUMBER_RE.test(p));
}

/** 구의 끝이 용언 명사형이면 검색어로 부적합(스펙 #13) — 신뢰도를 낮춰 AI 보정 대상으로 만든다. */
function endsWithVerbalNoun(phrase: string): boolean {
  const parts = phrase.trim().split(/\s+/);
  return parts.length > 0 && isVerbalNoun(parts[parts.length - 1]);
}

/**
 * 문법적으로 끝나지 않은 구 — 서술어로 끝나거나(…다녀오다) 속격으로 끝난다(…베르네르의).
 * 문장형 작품 제목("다정한 것이 살아남는다")일 수도 있고 단순 문장일 수도 있어 규칙만으로는 못 가르므로,
 * 신뢰도를 낮춰 AI 보정이 판단하게 한다.
 */
function endsIncomplete(phrase: string): boolean {
  const parts = phrase.trim().split(/\s+/);
  const last = parts[parts.length - 1] || '';
  return (last.length >= 3 && VERB_FINAL_RE.test(last)) || (last.length >= 3 && last.endsWith('의'));
}

// 목적격 조사(을/를)로 끝나면 뒤에 용언이 오는 절(운명을 바꾸다) — 명사 키워드가 아니므로 경계.
// 단, '을'로 끝나는 명사(가을·마을·노을…)는 예외로 둔다.
const NOUN_ENDS_EUL = new Set(['가을', '마을', '노을', '여울', '고을', '서울', '이슬', '구슬']);

// 따옴표/괄호로 감싼 작품·책 제목 추출(스펙 #3/#9: 작품명/책 제목 우선). 2~40자만.
const WORK_TITLE_RE = /[《〈「『“"'']([^》〉」』”"'']{2,40})[》〉」』”"'']/gu;

const W_MAXIMAL = 4;          // "최대 명사구"(run 전체) — 조각으로 쪼개지지 않도록 강하게 가산(스펙 #3)
const W_POSITION_FRONT = 3;   // 제목 앞부분 등장
const W_TITLE_REPEAT = 2;     // 제목에서 반복 등장
const W_PROPER = 3;           // 고유명사(작품/브랜드/기관/인물/복합명사)
const W_BRAND = 7;            // 브랜드/기관명 힌트 일치 — 최우선(스펙 #3/#9). 다른 후보를 압도하도록 크게.
const W_PHRASE_2_4 = 3;       // 2~4어절 의미 있는 명사구
const W_BODY_FREQ = 2;        // 본문 상위 빈도
const W_TAG = 2;              // 태그/해시태그 일치
const W_CATEGORY = 1;         // 카테고리 연관
const P_GENERIC = 3;          // 일반어 감점(−3)
const P_JUNK = 5;             // 한 글자/의미없는 토큰 감점(−5)
const P_FRAGMENT = 3;         // 최대 명사구의 조각(prefix/부분구간) 감점 — 복합어 쪼개짐 방지(스펙 #3)
const P_SMUSH = 2;            // 매끄럽지 않은 자동결합 복합어(판타지소설추천) 감점(스펙 #8)
// 조사 제거로 생긴 파생 단독 토큰(예: 솔로몬의→솔로몬) 감점: 원 제목의 온전한 어절이 아니라
// 더 긴 명사구의 머리(fragment)이므로, 단독보다 그 구(句) 형태가 대표가 되도록 낮춘다.
const P_DERIVED_SINGLE = 2;

// 최대 점수 근사치(신뢰도 정규화용). 최대명사구+앞부분+명사구/고유명사 정도.
const SCORE_FOR_FULL_CONFIDENCE = 12;
// 이 점수 미만이면 대표를 확신하지 못함 → 미확인 후보(스펙 #13).
const CONFIDENT_SCORE = 6;

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

function isEpisodeOrDate(token: string): boolean {
  const t = token.replace(/\s+/g, '');
  return EPISODE_RE.test(t) || DATE_RE.test(t) || EDITION_TAIL_RE.test(t);
}

/** 목적격 조사(을/를)로 끝나는 절 머리 — 명사가 아니므로 구 경계. */
function isObjectClause(token: string): boolean {
  if (NOUN_ENDS_EUL.has(token)) return false;
  return token.length >= 3 && (token.endsWith('를') || token.endsWith('을'));
}

/** 관형형 용언(…하는·바꾸는·되는) — 뒤 명사를 꾸미는 절이라 명사 키워드가 아님. 구 경계. */
function isAdnominalVerb(token: string): boolean {
  // '는'으로 끝나는 3자+ 토큰은 대부분 용언 관형형(하는/가는/바꾸는). 명사는 드물어 경계로 처리.
  return token.length >= 3 && token.endsWith('는');
}

// 용언 종결형(살아남는다·하였다) — 작품 제목이 문장형일 때 나타난다("다정한 것이 살아남는다").
// 새 개체의 시작이 아니라 앞 구를 마무리하는 말이므로 구간을 끊으면 안 된다.
const VERB_FINAL_RE = /[가-힣]다$/;

/**
 * 구간 중간에서 새 개체(고유명사)의 시작으로 볼 강한 복합명사인지.
 * 한글 4자+ 이고 일반어가 아니면 그 자체로 검색될 만한 고유명사/브랜드(오렌지도서관·방구석미술관)로 본다.
 * (라틴/숫자 혼합 모델명 S26 등은 앞 명사에 흡수돼야 하므로 여기서 제외한다 — 아이폰 17, 갤럭시 S26)
 */
function isStrongKoreanProper(token: string): boolean {
  if (!/^[가-힣]{4,}$/.test(token) || isStopOrGeneric(token)) return false;
  // 속격 '-의'는 뒤 명사를 수식해 한 구를 이룬다(나미야 잡화점의 기적) — 개체 경계가 아니다.
  if (token.endsWith('의')) return false;
  // 문장형 제목의 서술어(살아남는다)도 경계가 아니다.
  if (VERB_FINAL_RE.test(token)) return false;
  return true;
}

type TokenKind = 'content' | 'number' | 'skip' | 'modifier';

function classifyToken(token: string): TokenKind {
  const t = token.trim();
  if (!t) return 'skip';
  if (t === RUN_BREAK) return 'skip'; // 괄호류 경계 — 부가설명을 제목 본류와 분리(스펙 #1)
  if (BARE_NUMBER_RE.test(t)) return 'number';
  if (isEpisodeOrDate(t)) return 'skip';
  if (isModifierWord(t)) return 'modifier';
  if (isStopOrGeneric(t)) return 'skip';
  if (isDecorator(t)) return 'skip';
  if (isObjectClause(t)) return 'skip';
  if (isAdnominalVerb(t)) return 'skip';
  return 'content';
}

/** 제목에서 이모지·기호를 공백으로 치환하고 어절 배열로 분리(원형 유지 — 조사 미제거). */
function tokenizeTitle(title: string): string[] {
  const cleaned = title
    // 괄호류(부가설명)는 구 경계로 — 인생명언 (전도서…) 에서 대표는 앞 본류만(스펙 #1)
    .replace(/[()[\]{}【】]/g, ` ${RUN_BREAK} `)
    // 이모지/기호류 → 공백 (한글/영숫자/공백/구경계표식만 남김)
    .replace(/[^\p{L}\p{N}\s§]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.split(' ').filter(Boolean) : [];
}

interface Token { surface: string; idx: number }

/**
 * content 어절의 "최대 연속 구간(run)"들을 만든다(스펙 #3/#10).
 * skip 토큰에서 끊고, 맨 숫자는 구 중간에서만 흡수하며, 구간 중간의 강한 고유명사는 새 구간을 시작한다.
 */
function buildContentRuns(tokens: string[]): Token[][] {
  const runs: Token[][] = [];
  let cur: Token[] = [];
  // 직전 수식 어절 버퍼 — 뒤따르는 말이 단독으로 검색어가 못 되는 용언 명사형일 때만 되살린다.
  let pendingModifiers: Token[] = [];
  const flush = () => { if (cur.length) runs.push(cur); cur = []; };

  for (let i = 0; i < tokens.length; i++) {
    const surface = tokens[i];
    const kind = classifyToken(surface);
    if (kind === 'modifier') { flush(); pendingModifiers.push({ surface, idx: i }); continue; }
    if (kind === 'skip') { flush(); pendingModifiers = []; continue; }
    if (kind === 'number') {
      if (cur.length) cur.push({ surface, idx: i }); // 아이폰 17 — 앞 명사에 흡수
      continue;                                      // 맨 앞 숫자는 버림
    }
    // content: 구간 중간의 강한 고유명사는 새 개체 시작(오렌지도서관)
    if (cur.length && isStrongKoreanProper(surface)) { flush(); }
    // "더 빠르게 실패하기"처럼 head가 용언 명사형이면 앞 수식어와 한 덩어리로 묶는다.
    if (cur.length === 0 && pendingModifiers.length > 0 && isVerbalNoun(surface)) {
      cur.push(...pendingModifiers);
    }
    pendingModifiers = [];
    cur.push({ surface, idx: i });
  }
  flush();

  // 각 구간 끝의 숫자/장식어는 다듬는다(단, "아이폰 17"의 모델 숫자는 유지 — 앞이 content면 남긴다).
  return runs.map(run => {
    const out = [...run];
    while (out.length > 1 && isDecorator(out[out.length - 1].surface)) out.pop();
    return out;
  }).filter(r => r.length > 0);
}

export interface KeywordCandidate {
  keyword: string;   // 화면·검색에 쓰는 표시값
  score: number;
  tokens: number;    // 어절 수
  proper: boolean;   // 고유명사/브랜드 판정
  maximal: boolean;  // 최대 명사구(run 전체)인지 — 조각과 구분
  startIndex: number; // 제목 내 시작 어절 인덱스(태그 유래 후보는 99)
  /** 4어절 상한에 걸려 잘린 구간에서 나온 후보 — 개체 경계가 불확실. */
  cappedRun: boolean;
}

export interface ExtractInput {
  title: string;
  tags?: string[];
  category?: string | null;
  /** 브랜드/기관명 힌트(예: 블로그 대표 이름). 일치 후보를 대표로 강하게 밀어줌(스펙 #3/#9). */
  brandHints?: string[];
  /** 사용자가 직접 입력한 키워드(스펙 #1 우선순위 #2). */
  userKeyword?: string | null;
  /** 애매한 경우 본문 보정용 텍스트(스펙 #5). 없으면 제목만으로 결정. */
  bodyText?: string | null;
}

export interface ExtractResult {
  primary: string | null;
  secondaries: string[];
  candidates: KeywordCandidate[];
  /** true면 제목만으로 확신이 낮음 — 호출측이 본문/AI 보정 또는 미확인 처리(스펙 #13)를 고려. */
  ambiguous: boolean;
  /** 대표 키워드 신뢰도 0~1 (스펙 #12/#13). CONFIDENT_SCORE 미만이면 미확인 권장. */
  confidence: number;
}

interface RawCandidate {
  surface: string;
  startIndex: number;   // 제목 내 절대 어절 인덱스(앞부분 가산용)
  tokenCount: number;
  derived: boolean;     // 조사 제거로 원 어절과 달라진 단독 토큰(fragment)
  maximal: boolean;     // 최대 명사구(run 전체)인지
  /** 5어절 이상 run을 4어절로 잘라 만든 후보 — 개체 경계가 불확실하다(작품명+저자명이 붙는 자리). */
  cappedRun: boolean;
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

/** 하나의 run에서 최대 명사구(≤4어절) + 부분 구간 후보를 만든다. */
function candidatesFromRun(run: Token[]): RawCandidate[] {
  const out: RawCandidate[] = [];
  const capped = run.length > 4 ? run.slice(0, 4) : run; // 4어절 초과 run은 앞 4어절로 대표(스펙 권장 1~4어절)
  const fullSurface = capped.map(t => t.surface).join(' ');
  const fullNorm = normalizeKeyword(fullSurface);

  for (let i = 0; i < run.length; i++) {
    for (let len = 1; len <= 4 && i + len <= run.length; len++) {
      const slice = run.slice(i, i + len);
      // 끝 장식어 제거(스펙 #4)
      while (slice.length > 0 && isDecorator(slice[slice.length - 1].surface)) slice.pop();
      if (slice.length === 0) continue;
      const surface = slice.map(t => t.surface).join(' ').trim();
      if (!surface) continue;
      const derived = slice.length === 1 && stripJosa(slice[0].surface) !== slice[0].surface;
      out.push({
        surface,
        startIndex: slice[0].idx,
        tokenCount: slice.length,
        derived,
        maximal: normalizeKeyword(surface) === fullNorm,
        cappedRun: run.length > 4,
      });
    }
  }
  return out;
}

function isProperNounish(surface: string, brandHints: string[]): boolean {
  const s = surface.trim();
  const norm = normalizeKeyword(s);
  if (brandHints.some(b => normalizeKeyword(b) === norm)) return true;
  if (/[a-zA-Z]/.test(s) && !/^\d/.test(s)) return true; // 영문 브랜드/작품명(순수 숫자 제외)
  if (!s.includes(' ')) {
    // 부사(빠르게·완전히)·용언 관형형(바꾸는) 어미로 끝나면 고유명사가 아님.
    if (/(게|히)$/.test(s) || isAdnominalVerb(s)) return false;
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

/** 공백 없는 단일 토큰이 일반어 꼬리로 급조된 복합어인지(판타지소설추천). */
function isSmushedCompound(surface: string): boolean {
  if (surface.includes(' ')) return false;
  const s = lower(surface);
  return SMUSH_TAILS.some(tail => s.length > tail.length && s.endsWith(tail));
}

/** 본문 텍스트에서 어절 빈도 맵(정규화 키) — 애매한 경우 보정용. */
function buildBodyFreq(bodyText: string | null | undefined): Map<string, number> {
  const freq = new Map<string, number>();
  if (!bodyText) return freq;
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
  const { surface, startIndex, tokenCount, maximal } = cand;
  const norm = normalizeKeyword(surface);
  const spaceless = surface.replace(/\s/g, '');
  const proper = isProperNounish(surface, ctx.brandHints);

  // 한 글자·순수 숫자·단독 불용어 → 의미 없는 토큰(스펙 #11 −5)
  if (spaceless.length < 2 || /^\d+$/.test(spaceless) || (tokenCount === 1 && STOPWORDS.has(norm))) {
    return { keyword: surface, score: -P_JUNK, tokens: tokenCount, proper: false, maximal, startIndex, cappedRun: cand.cappedRun };
  }

  let s = 0;
  if (maximal) s += W_MAXIMAL;                 // 최대 명사구 우선(복합 고유명사 쪼개짐 방지, 스펙 #3)
  else s -= P_FRAGMENT;                         // 최대 명사구의 조각(prefix/부분) 감점
  if (startIndex === 0) s += W_POSITION_FRONT;
  if (countOccurrences(ctx.normTitle, norm) >= 2) s += W_TITLE_REPEAT;
  if (isBrandHit(surface, ctx.brandHints)) s += W_BRAND;
  else if (proper) s += W_PROPER;
  if (tokenCount >= 2 && tokenCount <= 4 && !allTokensGeneric(surface)) s += W_PHRASE_2_4;
  if ((ctx.bodyFreq.get(norm) ?? 0) >= 2) s += W_BODY_FREQ;
  if (ctx.tagsNorm.has(norm)) s += W_TAG;
  if (ctx.categoryNorm && (ctx.categoryNorm.includes(norm) || norm.includes(ctx.categoryNorm))) s += W_CATEGORY;

  // 일반어 감점(스펙 #7 −3): 단독 일반어 또는 구 전체가 일반어
  if ((tokenCount === 1 && GENERIC_WORDS.has(norm)) || (tokenCount >= 2 && allTokensGeneric(surface))) {
    s -= P_GENERIC;
  }
  // 매끄럽지 않은 자동결합 복합어(판타지소설추천) 감점(스펙 #8) — 브랜드 힌트 일치 시 예외
  if (isSmushedCompound(surface) && !isBrandHit(surface, ctx.brandHints)) s -= P_SMUSH;
  // 조사 제거로 생긴 파생 단독 토큰(솔로몬의→솔로몬)은 단독 대표로 부적합 → 감점(브랜드 힌트 예외)
  if (tokenCount === 1 && cand.derived && !isBrandHit(surface, ctx.brandHints)) s -= P_DERIVED_SINGLE;

  return { keyword: surface, score: s, tokens: tokenCount, proper, maximal, startIndex, cappedRun: cand.cappedRun };
}

/** primary와 부분문자열로 겹치지 않는 후보만 골라 보조 목록 구성(중복·포함관계 제거). */
function pickSecondaries(sorted: KeywordCandidate[], primary: string, max: number): string[] {
  const picked: string[] = [];
  const primaryNorm = normalizeKeyword(primary);
  for (const c of sorted) {
    const norm = normalizeKeyword(c.keyword);
    if (norm === primaryNorm) continue;
    if (c.score <= 0) continue; // 감점/0점 후보는 보조에서도 제외
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
 * 반환: 대표 1 + 보조 최대 3 + 점수순 후보 전체 + 애매 여부 + 신뢰도.
 */
export function extractKeywordCandidates(input: ExtractInput, maxSecondaries = 3): ExtractResult {
  const title = (input.title || '').trim();
  const tokens = tokenizeTitle(title);

  // 따옴표/괄호로 감싼 작품·책 제목(스펙 #3/#9) — 검색 의도의 핵심이므로 브랜드 힌트로 승격해 대표에 강하게 반영.
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

  // 후보 풀: 제목의 content 구간별 최대 명사구 + 부분 구간
  const runs = buildContentRuns(tokens);
  const raw: RawCandidate[] = runs.flatMap(candidatesFromRun);

  // 따옴표 작품명 — 최대 명사구로 취급(브랜드 힌트로도 점수 반영)
  for (const inner of workTitles) {
    raw.push({ surface: inner, startIndex: 0, tokenCount: inner.split(' ').filter(Boolean).length || 1, derived: false, maximal: true, cappedRun: false });
  }
  // 태그 후보(제목에 없더라도 검색 의도 보조)
  for (const tag of input.tags || []) {
    const t = tag.replace(/^#/, '').trim();
    if (t.length >= 2) raw.push({ surface: t, startIndex: 99, tokenCount: t.split(' ').filter(Boolean).length || 1, derived: false, maximal: true, cappedRun: false });
  }

  // 정규화 기준 중복 제거 — 최대 명사구 표시를 우선 보존하고, 더 앞선 startIndex를 택한다.
  const bySurface = new Map<string, RawCandidate>();
  for (const c of raw) {
    const key = normalizeKeyword(c.surface);
    if (!key) continue;
    const prev = bySurface.get(key);
    if (!prev || (c.maximal && !prev.maximal) || c.startIndex < prev.startIndex) {
      bySurface.set(key, { ...c, maximal: c.maximal || prev?.maximal || false });
    }
  }

  const scored = [...bySurface.values()]
    .map(c => scoreCandidate(c, ctx))
    // 점수 desc → 최대 명사구 우선 → 고유명사 우선 → 어절 많은(더 완결된) 구 → 짧은 표시값
    .sort((a, b) =>
      b.score - a.score ||
      Number(b.maximal) - Number(a.maximal) ||
      Number(b.proper) - Number(a.proper) ||
      b.tokens - a.tokens ||
      a.keyword.length - b.keyword.length,
    );

  // 사용자 직접 입력 키워드는 최우선(스펙 #1 우선순위 #2, #7의 manual 이전 단계)
  const userKeyword = (input.userKeyword || '').trim();
  let primary: string | null;
  if (userKeyword) {
    primary = userKeyword;
  } else {
    // 양수 점수 후보만 대표로 인정 — 없으면 미확인(null)로 두어 억지 추출을 막는다(스펙 #13).
    primary = scored.find(c => c.score > 0)?.keyword ?? null;
  }

  const secondaries = primary ? pickSecondaries(scored, primary, maxSecondaries) : [];

  const top = scored.find(c => c.score > 0) ?? null;
  const topScore = userKeyword ? SCORE_FOR_FULL_CONFIDENCE : (top?.score ?? 0);

  // 서로 겹치지 않는 "확신 수준(≥CONFIDENT_SCORE)"의 개체가 둘 이상이면 애매(솔로몬의 지혜 vs 오렌지도서관).
  const strongRegions: string[] = [];
  for (const c of scored) {
    if (c.score < CONFIDENT_SCORE) continue;
    const n = normalizeKeyword(c.keyword);
    if (strongRegions.some(r => r.includes(n) || n.includes(r))) continue;
    strongRegions.push(n);
  }

  // 수식어 재결합으로도 용언 명사형이 대표로 남으면(만들기·실패하기) 그대로는 아무도 검색하지 않는다.
  // 규칙으로는 여기까지가 한계라 저신뢰로 내려 AI 보정(Haiku)이 판단하게 한다.
  const verbalPrimary = !userKeyword && !!primary
    && (endsWithVerbalNoun(primary) || endsIncomplete(primary) || hasMidPhraseNumber(primary));

  // 대표 바로 앞 어절을 수식어로 보고 떼어낸 경우("쉽게 쓰여진 시"→"쓰여진 시") — 진짜 수식어일 수도 있고
  // 작품 제목의 일부일 수도 있어 규칙으로는 못 가른다. 잘린 조각을 확정하지 않도록 AI 보정에 넘긴다.
  // 바로 앞 어절이 목적격 조사절/관형형 용언이면("미움받을 용기", "운명을 바꾸는 부동산 투자")
  // 그 말이 진짜 절인지 작품 제목의 일부인지 규칙으로는 못 가른다 — 잘린 조각을 확정하지 않는다.
  const prevToken = top && top.startIndex >= 1 && top.startIndex < 90 ? (tokens[top.startIndex - 1] || '') : '';
  // 장식어가 아닌 일반어("트렌드 코리아 2026"의 트렌드)도 경계로 쓰면 브랜드 첫 단어를 잘라낸다.
  // 장식어(추천·후기)는 진짜 경계이므로 제외한다.
  const prevIsBareGeneric = !!prevToken && isStopOrGeneric(prevToken) && !isDecorator(prevToken);
  const truncatedPrimary = !userKeyword && !!prevToken
    && (classifyToken(prevToken) === 'modifier' || isObjectClause(prevToken) || isAdnominalVerb(prevToken) || prevIsBareGeneric);

  // 5어절 이상이 연달아 붙은 구간은 4어절 상한에서 잘려 나온 값이라 개체 경계를 신뢰할 수 없다.
  // 작품명 뒤에 저자명이 붙는 자리가 대표적이다("지구 끝의 온실 김초엽" → 작품명과 인명은 별개 개체).
  const cappedPrimary = !userKeyword && !!top && top.cappedRun;

  const softened = verbalPrimary || truncatedPrimary || cappedPrimary;

  const confidence = userKeyword
    ? 0.99
    : Math.max(0, Math.min(0.99, topScore / SCORE_FOR_FULL_CONFIDENCE))
      * (strongRegions.length >= 2 ? 0.7 : 1)
      * (softened ? 0.6 : 1);

  const ambiguous = !userKeyword && (primary === null || topScore < CONFIDENT_SCORE || strongRegions.length >= 2 || softened);

  return { primary, secondaries, candidates: scored, ambiguous, confidence: Number(confidence.toFixed(2)) };
}

export type StoredKeywordVerdict = 'manual' | 'missing' | 'suspicious' | 'normal';

export interface StoredKeywordAudit {
  verdict: StoredKeywordVerdict;
  /** 개선된 규칙으로 다시 뽑은 대표 키워드(재추출 시 저장할 값). */
  suggested: string | null;
  /** 의심 사유(스펙 #18) — normal/manual이면 null. */
  reason: string | null;
}

/**
 * 이미 저장된 대표 키워드가 재추출 대상인지 점검한다(스펙 #18~20). 네트워크 호출 없이 제목만으로 판정.
 *   - manual: 사용자 직접 지정 → 재추출 제외(스펙 #19)
 *   - missing: 대표 키워드 없음
 *   - suspicious: 한 글자/회차·숫자/일반어만/저신뢰/개선 로직과 불일치 → 재추출 권장
 *   - normal: 현행 로직 결과와 일치하고 품질 양호
 */
export function auditStoredKeyword(opts: {
  title: string | null | undefined;
  storedKeyword: string | null;
  source: string | null;
  confidence: number | null;
}): StoredKeywordAudit {
  const stored = (opts.storedKeyword || '').trim();
  if (opts.source === 'manual') return { verdict: 'manual', suggested: stored || null, reason: null };

  const title = (opts.title || '').trim();
  // 제목이 없으면 재추출로 개선할 수 없다 — 있는 값은 유지, 없으면 미추출.
  if (!title) return stored ? { verdict: 'normal', suggested: stored, reason: null } : { verdict: 'missing', suggested: null, reason: '제목 없음' };

  const suggested = extractKeywordCandidates({ title }).primary;

  if (!stored) return { verdict: 'missing', suggested, reason: '대표키워드 없음' };

  const spaceless = stored.replace(/\s/g, '');
  if (spaceless.length <= 1) return { verdict: 'suspicious', suggested, reason: '한 글자 토큰' };
  if (isEpisodeOrDate(stored) || /^\d+$/.test(spaceless)) return { verdict: 'suspicious', suggested, reason: '회차/숫자만' };
  if (allTokensGeneric(stored)) return { verdict: 'suspicious', suggested, reason: '일반어만' };
  if (typeof opts.confidence === 'number' && opts.confidence < 0.5) return { verdict: 'suspicious', suggested, reason: '낮은 신뢰도' };
  // 개선된 규칙이 더 나은(다른) 대표를 제시하면 재추출 권장(스펙 #18: 의미적 관련성 낮음/쪼개짐 교정).
  if (suggested && normalizeKeyword(suggested) !== normalizeKeyword(stored)) {
    return { verdict: 'suspicious', suggested, reason: '개선된 추출 결과와 불일치' };
  }
  return { verdict: 'normal', suggested: stored, reason: null };
}
