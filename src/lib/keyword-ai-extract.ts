// 하이브리드 키워드 추출의 AI 폴백 (스펙 #2, #4, #5) — 규칙 기반이 애매/저신뢰일 때만 1회 호출.
//
// 원칙(오렌지 확정: "규칙 우선 + 저신뢰도만 AI"):
//   - 규칙 엔진(keyword-candidates)이 확신하면 이 모듈은 절대 호출되지 않는다.
//   - 호출은 "수집/추출 시점" 1회뿐이며, 결과는 post_representative_keywords에 저장되어
//     이후 화면 조회에서는 재호출되지 않는다(스펙 #20 — 조회 시 AI 호출 금지).
//   - 실패(키 없음/타임아웃/파싱오류)하면 null을 반환해 규칙 결과로 자연 폴백한다.
//
// 모델: Claude Haiku(가장 낮은 비용) 고정 — 대표 키워드 추출은 결제 등급과 무관한 내부 보조 작업.

import {
  getAnthropicClient,
  CLAUDE_MODEL_HAIKU,
  wrapUntrusted,
  UNTRUSTED_DATA_NOTICE,
  parseJsonObjectFromClaudeText,
  ClaudeApiKeyMissingError,
} from './claude-client';

export interface AiKeywordInput {
  title: string;
  tags?: string[];
  category?: string | null;
  /** 애매한 경우에만 전달되는 본문(앞부분). 없으면 제목·태그·카테고리만으로 판단. */
  bodyText?: string | null;
}

export interface AiKeywordResult {
  primary: string;
  secondaries: string[];
}

const MAX_BODY_CHARS = 2000;
const AI_TIMEOUT_MS = 12000;

const SYSTEM_PROMPT = [
  '너는 네이버/구글 SEO 전문가이자 AI 검색 알고리즘 분석가다. 주어진 블로그 글에서',
  '실제 사용자가 검색창에 입력할 "대표 타겟 키워드"를 추출한다.',
  '이 키워드는 미노출 점검·키워드 순위 추적·AI 브리핑 분석에 그대로 사용되므로,',
  '실제로 검색되지 않는 표현을 뽑으면 이후 결과가 전부 무의미해진다.',
  '',
  '규칙:',
  '1) 대표 키워드 1개(primary)와 보조 키워드 0~3개(secondaries)를 고른다.',
  '2) primary는 사람이 검색창에 그대로 입력하는 실제 검색어여야 한다(설명형 문장 금지).',
  '3) 제목의 주제어(작품명·브랜드·상품·인물·장소·핵심 개념)를 최우선으로 하고,',
  '   본문/태그/카테고리는 검색 의도 보정에만 쓴다.',
  '4) 복합 고유명사는 절대 쪼개지 않는다. 예: "달러구트 꿈 백화점".',
  '   다만 작품명 뒤에 붙은 저자·감독·출연자 이름은 별개 개체다.',
  '   primary는 작품명으로 하고 인명은 secondaries로 보낸다. 둘을 한 덩어리로 묶지 않는다.',
  '5) 수식어와 의도어는 떼어낸다.',
  '   - 수식어: 쉽고, 좋은, 더 빠르게, 꼭 해야할 …',
  '   - 의도/유형어: 추천, 후기, 리뷰, 감상, 뜻, 방법, 정리, 모음, 선택, 도서추천, 책추천 …',
  '   - 순위/랭킹어: 순위, 베스트셀러, 랭킹, TOP3, TOP5, 1위 …',
  '   - 판매처/플랫폼명: 예스24, 교보문고, 알라딘, 밀리의서재 …',
  '   붙여 쓴 결합어도 잘라낸다. 예: "한국소설베스트셀러순위" → "한국소설".',
  '   단, 이 말이 고유명사(책·작품 제목 등)의 일부이면 그대로 둔다.',
  '   또한 제목에 주제어가 전혀 없어 결합어 자체가 검색어인 경우에만 예외로 허용한다. 예: "책 추천".',
  '6) 괄호 ( ) [ ] 안의 내용은 부가 설명이므로 primary로 삼지 않는다.',
  '   괄호 밖 본문에서 주제어를 찾는다. 예: "신간도서 TOP3(매월 넷째 주 교보문고 MD 선택)" → "신간도서".',
  '7) primary는 반드시 제목에 실제로 등장한 연속된 문자열이어야 한다.',
  '   제목에 없는 단어를 새로 만들거나, 오타를 고치거나, 비슷한 말로 바꾸지 않는다.',
  '   제목이 깨져 있거나 뜻이 통하지 않는 조각(예: "야이콤", "넙데")은 primary로 뽑지 않는다.',
  '8) 단어를 부자연스럽게 자르거나 오타·부분 음절을 뽑지 않는다.',
  '   조사가 붙은 어절을 그대로 뽑지 않는다. 예: "아이를"(X) → "아이"(O), "책의"(X) → "책"(O).',
  '9) 검색 의도가 불명확해 억지로 만들어야 하는 경우(예: "오늘도 행복한 하루 보내세요")에는',
  '   primary를 빈 문자열("")로 두어 "미확인"임을 알린다. 절대 억지로 만들지 않는다.',
  '',
  '예시(제목 → primary):',
  '- "쉽고 떫고 좋은 규리" → "규리"',
  '- "한국소설베스트셀러순위 TOP5(네임 넙데 추 예스24)" → "한국소설"',
  '- "신간도서 TOP3(매월 넷째 주 교보문고 MD 선택)" → "신간도서"',
  '- "프로뮨의 세계 오네시도서관 감상" → "프로뮨의 세계"',
  '- "지구 끝의 온실 김초엽 SF소설추천" → "지구 끝의 온실" (저자 "김초엽"은 secondaries로)',
  '- "인생명언 [변호사임용시험 편]" → "인생명언"',
  '- "방구석미술관 서양미술편 추천" → "방구석미술관"',
  '- "달리구도 못해낸 300 원화집 추천" → "달리구도 못해낸 300"',
  '- "더 빠르게 실패하기 자기계발도서추천" → "더 빠르게 실패하기"',
  '- "다정한 것이 살아남는다 과학도서추천" → "다정한 것이 살아남는다"',
  '',
  UNTRUSTED_DATA_NOTICE,
  '',
  '반드시 아래 JSON 형식으로만 답한다(설명 금지):',
  '{"primary": "대표키워드", "secondaries": ["보조1", "보조2"]}',
].join('\n');

function buildUserContent(input: AiKeywordInput): string {
  const parts: string[] = [`제목: ${input.title}`];
  if (input.category) parts.push(`카테고리: ${input.category}`);
  if (input.tags && input.tags.length > 0) parts.push(`태그: ${input.tags.slice(0, 20).join(', ')}`);
  if (input.bodyText) parts.push(`본문(일부):\n${input.bodyText.slice(0, MAX_BODY_CHARS)}`);
  return wrapUntrusted(parts.join('\n'), 'blog_post');
}

function cleanKeyword(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** 비교용 압축 — 공백·기호를 지우고 소문자화. "지구 끝의 온실"과 "지구끝의온실"을 같은 것으로 본다. */
function compactForMatch(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * 끝 어절의 목적격 조사 '를'을 떼어낸다("아이를" → "아이").
 * '을'은 마을·가을·겨울·구슬처럼 명사의 끝음절과 겹쳐 오탐이 크므로 다루지 않는다.
 * (규칙 엔진 쪽 NOUN_ENDS_EUL 사전도 불완전하다 — 사전 방식으로 넓히지 말 것)
 */
function stripObjectJosa(keyword: string): string {
  const parts = keyword.trim().split(/\s+/);
  const last = parts[parts.length - 1] || '';
  if (last.length >= 3 && last.endsWith('를')) {
    parts[parts.length - 1] = last.slice(0, -1);
    return parts.join(' ');
  }
  return keyword;
}

/**
 * 괄호 안 부가설명을 지운 제목(SYSTEM_PROMPT 규칙 6의 코드판).
 * "신간도서 TOP3(매월 넷째 주 교보문고 MD 선택)"에서 primary는 괄호 밖에서만 나와야 한다.
 * 제목이 통째로 괄호인 경우엔 검사할 표면이 사라지므로 원 제목으로 되돌린다.
 */
function titleOutsideBrackets(title: string): string {
  const stripped = title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .trim();
  return compactForMatch(stripped).length >= 2 ? stripped : title;
}

/**
 * AI가 돌려준 키워드가 계약(SYSTEM_PROMPT 규칙 7)을 지켰는지 코드로 강제한다.
 * 프롬프트에만 적어두면 지켜지지 않는다 — 본문을 함께 넘기므로 제목에 없는 조각을
 * primary로 뽑는 일이 실제로 발생했다("솔로몬의 지혜 오렌지도서관 단상" → "아이를").
 *
 * primary는 제목의 괄호 밖에 실제로 등장해야 하고, secondaries는 제목 또는 태그 범위로 제한한다.
 * 유효한 primary가 없으면 null — 호출부는 규칙 결과로 폴백하고, 그것도 없으면 '미확인'이 된다
 * (오렌지 확정: 억지 추출보다 미확인이 낫다).
 */
export function validateAiKeywords(
  input: { title: string; tags?: string[] },
  result: AiKeywordResult,
): AiKeywordResult | null {
  const titleCompact = compactForMatch(input.title);
  const appearsInTitle = (kw: string) => {
    const c = compactForMatch(kw);
    return c.length >= 2 && titleCompact.includes(c);
  };

  const outsideCompact = compactForMatch(titleOutsideBrackets(input.title));
  const primary = stripObjectJosa(result.primary).trim();
  if (!primary) return null;
  const primaryMatch = compactForMatch(primary);
  if (primaryMatch.length < 2 || !outsideCompact.includes(primaryMatch)) return null;

  const primaryCompact = compactForMatch(primary);
  const tagCompacts = new Set((input.tags || []).map(t => compactForMatch(t.replace(/^#/, ''))).filter(Boolean));
  const secondaries = result.secondaries
    .map(s => stripObjectJosa(s).trim())
    .filter(s => s && (appearsInTitle(s) || tagCompacts.has(compactForMatch(s))))
    .filter(s => compactForMatch(s) !== primaryCompact)
    .filter((s, i, arr) => arr.findIndex(x => compactForMatch(x) === compactForMatch(s)) === i)
    .slice(0, 3);

  return { primary, secondaries };
}

/**
 * Claude Haiku로 대표/보조 키워드를 1회 추출한다.
 * 성공 시 { primary(비어있지 않음), secondaries }, 실패/미확인/키없음이면 null.
 * 절대 throw하지 않는다 — 호출부는 null이면 규칙 결과를 그대로 사용한다.
 */
export async function aiExtractKeyword(input: AiKeywordInput): Promise<AiKeywordResult | null> {
  const title = (input.title || '').trim();
  if (!title) return null;

  try {
    const client = getAnthropicClient();
    const res = await client.messages.create(
      {
        model: CLAUDE_MODEL_HAIKU,
        max_tokens: 300,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(input) }],
      },
      { signal: AbortSignal.timeout(AI_TIMEOUT_MS) },
    );

    const text = res.content
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('')
      .trim();
    if (!text) return null;

    const parsed = parseJsonObjectFromClaudeText<{ primary?: unknown; secondaries?: unknown }>(text);
    const primary = cleanKeyword(parsed.primary);
    if (!primary) return null; // 미확인(스펙 #17) — 억지 추출 금지

    const secondaries = Array.isArray(parsed.secondaries)
      ? parsed.secondaries
          .map(cleanKeyword)
          .filter(k => k && k.toLowerCase() !== primary.toLowerCase())
          .filter((k, i, arr) => arr.indexOf(k) === i)
          .slice(0, 3)
      : [];

    // 프롬프트 계약을 코드로 재확인 — 위반이면 null로 규칙 결과에 폴백한다.
    const validated = validateAiKeywords({ title, tags: input.tags }, { primary, secondaries });
    if (!validated) {
      console.warn(`[keyword-ai-extract] AI 응답이 검증에 탈락해 규칙 결과로 폴백 title="${title}" primary="${primary}"`);
    }
    return validated;
  } catch (err) {
    // 폴백 자체는 안전하지만, 조용히 삼키면 "AI 보정이 켜져 있다"고 믿는 동안 실제로는 한 번도
    // 성공하지 않는 상태를 아무도 알아채지 못한다(2026-08-25: 저신뢰 규칙 파편이 그대로 검색어로 쓰이던
    // 문제의 원인 추적이 로그 부재로 막혔다). 폴백은 유지하되 원인은 반드시 남긴다.
    if (err instanceof ClaudeApiKeyMissingError) {
      console.warn('[keyword-ai-extract] ANTHROPIC_API_KEY 미설정 — AI 보정을 건너뛰고 규칙 결과를 사용한다');
      return null;
    }
    console.error(`[keyword-ai-extract] AI 보정 실패 → 규칙 결과로 폴백 title="${title}":`, err);
    return null;
  }
}
