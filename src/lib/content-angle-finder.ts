/**
 * 글감찾기 — 키워드 하나로 "사람들이 궁금한 질문"과 "추천 글감"을 찾는다.
 * 네이버 연관키워드(검색광고)·자동완성 실데이터를 Claude에 넣어 근거 있는 글감을 합성한다.
 */
import { getAnthropicClient, CLAUDE_MODEL_SONNET, parseJsonObjectFromClaudeText } from './claude-client';

const AUTOCOMPLETE_URL = 'https://ac.search.naver.com/nx/ac';

/** 네이버 통합검색 자동완성 — 실제 사용자들이 이어서 검색하는 표현을 그대로 가져온다 */
export async function fetchNaverAutocomplete(keyword: string): Promise<string[]> {
  try {
    const url = `${AUTOCOMPLETE_URL}?q=${encodeURIComponent(keyword)}&con=1&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    const raw: [string, string][] = data.items?.[0] || [];
    const suggestions = raw.map((item) => item[0]).filter(Boolean);
    return suggestions.filter((s) => s !== keyword);
  } catch {
    return [];
  }
}

export interface ContentAngles {
  questions: string[];
  angles: string[];
}

const SYSTEM_PROMPT = `당신은 네이버 블로그·인플루언서 콘텐츠 기획을 돕는 AI입니다.
주어진 키워드와 실제 검색 데이터(연관 검색어, 자동완성 제안)를 근거로,
이 키워드로 글을 쓰려는 사람에게 "사람들이 실제로 궁금해하는 질문"과 "쓰면 좋은 글감(주제)"을 제안하세요.

규칙:
- 반드시 주어진 연관 검색어·자동완성 데이터에 실제로 드러나는 관심사에 기반할 것 (근거 없이 지어내지 말 것)
- 질문은 실제 사람이 검색창에 칠 법한 자연스러운 구어체 질문으로 작성
- 글감은 "왜 ~일까", "~비교", "~하는 이유" 처럼 클릭을 유도하는 짧은 한글 제목 후보 형태로 작성
- 특정 업종에 치우치지 않고 입력된 키워드의 실제 맥락에만 집중
- 질문 5~8개, 글감 4~6개
- 아래 JSON 스키마로만 응답하세요. 마크다운, 코드블록, 설명 문구 없이 순수 JSON만 반환합니다:
{"questions": ["질문1", "질문2"], "angles": ["글감1", "글감2"]}`;

export async function synthesizeContentAngles(
  keyword: string,
  relatedKeywords: string[],
  autocomplete: string[],
): Promise<ContentAngles> {
  const anthropic = getAnthropicClient();
  const userContent = [
    `키워드: ${keyword}`,
    relatedKeywords.length > 0 ? `연관 검색어: ${relatedKeywords.join(', ')}` : '연관 검색어: (데이터 없음)',
    autocomplete.length > 0 ? `자동완성 제안: ${autocomplete.join(', ')}` : '자동완성 제안: (데이터 없음)',
  ].join('\n');

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL_SONNET,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const parsed = parseJsonObjectFromClaudeText<Partial<ContentAngles>>(rawText);

  return {
    questions: Array.isArray(parsed.questions) ? parsed.questions.filter((q) => typeof q === 'string') : [],
    angles: Array.isArray(parsed.angles) ? parsed.angles.filter((a) => typeof a === 'string') : [],
  };
}
