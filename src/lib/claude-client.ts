import Anthropic from '@anthropic-ai/sdk';

/**
 * Claude 모델 상수 — 여러 API 라우트에 리터럴로 흩어져 있던 모델 문자열을 통합.
 * 각 라우트의 모델 선택(무료/유료 분기 등) 로직은 그대로 유지하고, 문자열만 여기서 가져다 쓴다.
 */
export const CLAUDE_MODEL_HAIKU = 'claude-haiku-4-5-20251001';
export const CLAUDE_MODEL_SONNET = 'claude-sonnet-4-6';
export const CLAUDE_MODEL_OPUS = 'claude-opus-4-6';

/** ANTHROPIC_API_KEY가 설정되지 않았을 때 getAnthropicClient()가 던지는 에러. 호출부에서 잡아 503으로 응답한다. */
export class ClaudeApiKeyMissingError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
    this.name = 'ClaudeApiKeyMissingError';
  }
}

/**
 * Anthropic 클라이언트를 생성한다.
 * apiKey를 명시하지 않으면 process.env.ANTHROPIC_API_KEY를 사용한다.
 * 키가 없으면 ClaudeApiKeyMissingError를 throw하므로, 호출부에서 try/catch로 잡아
 * 503 응답으로 변환해야 한다.
 */
export function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new ClaudeApiKeyMissingError();
  return new Anthropic({ apiKey: key });
}

/**
 * Claude 응답 텍스트에서 JSON 객체를 파싱한다.
 * 1) 전체 텍스트를 그대로 JSON.parse 시도
 * 2) 실패하면 텍스트 내 첫 '{' ~ 마지막 '}' 구간을 정규식으로 추출해 재시도
 * 둘 다 실패하면 Error를 throw한다.
 */
export function parseJsonObjectFromClaudeText<T = unknown>(rawText: string): T {
  try {
    return JSON.parse(rawText) as T;
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI 응답 파싱 실패');
    return JSON.parse(match[0]) as T;
  }
}

/**
 * Claude 응답 텍스트에서 JSON 배열을 파싱한다. parseJsonObjectFromClaudeText와 동일하되
 * 정규식 추출 대상이 '[' ~ ']' 구간이다.
 */
export function parseJsonArrayFromClaudeText<T = unknown>(rawText: string): T {
  try {
    return JSON.parse(rawText) as T;
  } catch {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('AI 응답 파싱 실패');
    return JSON.parse(match[0]) as T;
  }
}
