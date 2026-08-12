/**
 * Manus 에이전트 태스크 공용 클라이언트
 *
 * `/api/youtube/stt`의 transcribeWithManus가 쓰던 "태스크 생성 → 완료까지 폴링 →
 * assistant_message 본문 수집" 패턴을 프롬프트에 종속되지 않게 일반화한 것.
 * 유튜브 STT뿐 아니라 인스타 릴스/유튜브 쇼츠 분석 등 다른 Manus 활용에서도 재사용한다.
 *
 * structured_output_schema는 일부러 쓰지 않는다 — 실측상 별도 추출 단계가 "저작권" 사유로
 * 동일 내용을 거부하고 빈 값을 반환하는 경우가 있어, 에이전트 대화 본문을 직접 읽는 편이 안정적이다.
 * (자세한 배경은 src/lib/youtube-transcript.ts 주석 참고)
 *
 * ENV: MANUS_API_KEY
 */

const MANUS_BASE_URL = 'https://api.manus.ai/v2';
const MANUS_POLL_INTERVAL_MS = 3_000;
/** 호출부 maxDuration(보통 300초) 안에서 여유를 남긴 대기 상한 */
const DEFAULT_MAX_WAIT_MS = 4 * 60 * 1000;

/** Manus 미설정(키 없음) 등, 기능 자체를 제공할 수 없는 상황 — 호출부에서 503으로 매핑 */
export class ManusUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManusUnavailableError';
  }
}

interface ManusTaskCreateResponse {
  ok: boolean;
  task_id?: string;
  error?: { message?: string };
}

interface ManusMessage {
  type: string;
  timestamp: number;
  status_update?: { agent_status: 'running' | 'stopped' | 'waiting' | 'error' };
  error_message?: { content: string };
  assistant_message?: { content: string };
}

interface ManusListMessagesResponse {
  messages?: ManusMessage[];
  has_more?: boolean;
  next_cursor?: string;
}

export interface RunManusTaskOptions {
  /** 완료까지 대기 상한(ms). 기본 4분. */
  maxWaitMs?: number;
  /** Manus agent_profile. 기본 'manus-1.6-lite'. */
  agentProfile?: string;
}

/**
 * 프롬프트 하나로 Manus 태스크를 생성하고, 완료될 때까지 폴링한 뒤
 * 에이전트가 보낸 assistant_message 전체를 시간순으로 이어붙여 반환한다.
 *
 * @throws {ManusUnavailableError} MANUS_API_KEY 미설정
 * @throws {Error} 태스크 실패/타임아웃 등
 */
export async function runManusTask(prompt: string, options: RunManusTaskOptions = {}): Promise<string> {
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiKey) {
    throw new ManusUnavailableError('Manus API가 설정되지 않았습니다. (MANUS_API_KEY)');
  }

  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const agentProfile = options.agentProfile ?? 'manus-1.6-lite';

  const createRes = await fetch(`${MANUS_BASE_URL}/task.create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-manus-api-key': apiKey,
    },
    body: JSON.stringify({
      message: { content: [{ type: 'text', text: prompt }] },
      hide_in_task_list: true,
      agent_profile: agentProfile,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    throw new Error(`Manus 작업 생성 실패 (${createRes.status}): ${body.slice(0, 200)}`);
  }
  const created = (await createRes.json()) as ManusTaskCreateResponse;
  if (!created.ok || !created.task_id) {
    throw new Error(`Manus 작업 생성 실패: ${created.error?.message || '알 수 없는 오류'}`);
  }
  const taskId = created.task_id;

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, MANUS_POLL_INTERVAL_MS));

    const listRes = await fetch(
      `${MANUS_BASE_URL}/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=desc&limit=20`,
      { headers: { 'x-manus-api-key': apiKey }, signal: AbortSignal.timeout(15_000) },
    );
    if (!listRes.ok) continue; // 일시적 오류는 다음 폴링에서 재시도

    const data = (await listRes.json()) as ManusListMessagesResponse;
    const messages = data.messages || [];

    const status = messages.find((m) => m.type === 'status_update')?.status_update;
    if (status?.agent_status === 'error') {
      const errMsg = messages.find((m) => m.type === 'error_message')?.error_message?.content;
      throw new Error(errMsg || 'Manus 작업이 실패했습니다.');
    }
    if (status?.agent_status === 'stopped') {
      return collectAssistantText(await fetchAllManusMessages(taskId, apiKey));
    }
    // running / waiting → 계속 폴링. waiting(브라우저 연결 등 확인 요청)은 자동화 흐름에서 응답할 수 없어
    // 결국 아래 타임아웃으로 처리된다.
  }

  throw new Error('Manus 작업이 시간 내에 끝나지 않았습니다.');
}

/** 완료된 작업의 전체 대화를 시간순(asc)으로 페이지네이션하며 모두 가져온다. */
async function fetchAllManusMessages(taskId: string, apiKey: string): Promise<ManusMessage[]> {
  const all: ManusMessage[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const url = new URL(`${MANUS_BASE_URL}/task.listMessages`);
    url.searchParams.set('task_id', taskId);
    url.searchParams.set('order', 'asc');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, {
      headers: { 'x-manus-api-key': apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) break;
    const data = (await res.json()) as ManusListMessagesResponse;
    all.push(...(data.messages || []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }
  return all;
}

/**
 * 대화 중 에이전트가 보낸 assistant_message를 시간순으로 이어붙인다.
 * "작성을 시작하겠습니다" 류의 짧은 서론을 별도 메시지로 보내는 경우가 있어,
 * 마지막(가장 완성된) 메시지가 가장 길 때가 많지만 여기선 전체를 이어붙여 반환하고
 * 구조 파싱은 호출부에 맡긴다.
 */
function collectAssistantText(messages: ManusMessage[]): string {
  const parts = messages
    .filter((m) => m.type === 'assistant_message' && m.assistant_message?.content)
    .map((m) => m.assistant_message!.content.trim())
    .filter(Boolean);
  const text = parts.join('\n\n').trim();
  if (!text) throw new Error('Manus 응답에서 내용을 찾지 못했습니다.');
  return text;
}
