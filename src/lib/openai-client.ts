import OpenAI from 'openai';

/**
 * OpenAI(ChatGPT) 모델 상수 — N인플 AI 컨설턴트가 실제 답변을 생성할 때 사용.
 * 마케팅/블로그 상담 수준엔 gpt-4o-mini가 저렴·충분해서 기본값으로 둔다.
 */
export const OPENAI_MODEL_MINI = 'gpt-4o-mini';

/** OPENAI_API_KEY가 없을 때 getOpenAiClient()가 던지는 에러. 호출부에서 잡아 503으로 응답한다. */
export class OpenAiApiKeyMissingError extends Error {
  constructor() {
    super('OPENAI_API_KEY가 설정되지 않았습니다.');
    this.name = 'OpenAiApiKeyMissingError';
  }
}

/**
 * OpenAI 클라이언트를 생성한다.
 * apiKey를 명시하지 않으면 process.env.OPENAI_API_KEY를 사용한다.
 * 키가 없으면 OpenAiApiKeyMissingError를 throw하므로, 호출부에서 try/catch로 잡아
 * 503 응답으로 변환해야 한다.
 */
export function getOpenAiClient(apiKey?: string): OpenAI {
  const key = apiKey ?? process.env.OPENAI_API_KEY;
  if (!key) throw new OpenAiApiKeyMissingError();
  return new OpenAI({ apiKey: key });
}
