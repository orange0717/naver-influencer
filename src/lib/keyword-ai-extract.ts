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
  '너는 네이버 블로그 SEO 전문가다. 주어진 블로그 글에 대해, 실제 네이버 사용자가',
  '이 글을 찾으려고 검색창에 입력할 "검색 의도 기반 핵심 키워드"를 추출한다.',
  '',
  '규칙:',
  '1) 대표 키워드 1개(primary)와 보조 키워드 0~3개(secondaries)를 고른다.',
  '2) 제목을 최우선으로 하되 본문/태그/카테고리로 검색 의도를 보정한다.',
  '3) 복합 고유명사(작품명·브랜드·인물)는 절대 쪼개지 않는다. 예: "달러구트 꿈 백화점".',
  '4) "책, 글, 리뷰, 추천, 이야기, 생각, 오늘, 정보, 좋은" 같은 단독 일반어는 대표로 쓰지 않는다.',
  '   단, 다른 말과 결합해 실제 검색어가 되면 허용한다. 예: "책 추천", "판타지소설추천", "인생명언".',
  '5) 검색 의도가 불명확해 억지로 만들어야 하는 경우(예: "오늘도 행복한 하루 보내세요")에는',
  '   primary를 빈 문자열("")로 두어 "미확인"임을 알린다. 절대 억지로 만들지 않는다.',
  '6) 키워드는 사람이 실제로 검색할 자연스러운 표현으로 쓴다(불필요한 조사·수식 제거).',
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

    return { primary, secondaries };
  } catch (err) {
    // 키 미설정은 정상 폴백(개발/미구성 환경). 그 외 에러도 조용히 규칙 결과로 폴백한다.
    if (err instanceof ClaudeApiKeyMissingError) return null;
    return null;
  }
}
