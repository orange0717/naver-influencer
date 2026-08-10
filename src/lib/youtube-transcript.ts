/**
 * 유튜브 자막/대본 획득 공용 유틸 — 원래 /api/youtube/stt 라우트에 있던 로직을
 * 콘텐츠 분석 기능(/api/content/youtube/analyze)에서도 재사용하기 위해 분리했다.
 * 두 라우트 모두 이 모듈을 통해 videoId 파싱, 자막 조회, Manus STT 폴백을 수행한다.
 */
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';

export {
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
};

export class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /youtube\.com\/watch\?[^\s]*v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/live\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/v\/([A-Za-z0-9_-]{11})/,
    /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

export interface OEmbedVideoMeta {
  title: string;
  channel: string;
  thumbnail: string | null;
}

/** oEmbed는 API 키 없이 제목/채널명/썸네일만 준다 (조회수 등은 YouTube Data API v3 필요, src/lib/youtube.ts). */
export async function fetchVideoMetadataOEmbed(videoId: string): Promise<OEmbedVideoMeta> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('oembed failed');
    const data = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    return {
      title: data.title || `YouTube ${videoId}`,
      channel: data.author_name || '알 수 없음',
      thumbnail: data.thumbnail_url || null,
    };
  } catch {
    return { title: `YouTube ${videoId}`, channel: '알 수 없음', thumbnail: null };
  }
}

export interface CaptionSegment {
  text: string;
  offsetSeconds: number;
}

export interface CaptionResult {
  text: string;
  lang: string;
  segments: CaptionSegment[];
}

/**
 * offset 단위가 포맷에 따라 ms/초로 섞여 나오는 youtube-transcript 라이브러리 특성상,
 * 값의 크기로 ms인지 추정해 초 단위로 정규화한다. 10시간(36,000) 이상이면 ms로 간주.
 * (드물게 10시간 넘는 "초" 단위 영상이 있다면 오탐 가능 — 챕터 타임스탬프는 참고용이라 허용)
 */
function normalizeOffsetsToSeconds(rawOffsets: number[]): number[] {
  const max = Math.max(0, ...rawOffsets);
  const isMs = max > 36_000;
  return isMs ? rawOffsets.map((o) => o / 1000) : rawOffsets;
}

export async function fetchCaption(videoId: string): Promise<CaptionResult | null> {
  for (const lang of ['ko', 'en']) {
    try {
      const raw = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      const cleanedTexts = raw.map((s) =>
        s.text.replace(/\s+/g, ' ').replace(/\[음악\]|\[Music\]/gi, '').trim(),
      );
      const text = cleanedTexts.join(' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;

      const offsetsSec = normalizeOffsetsToSeconds(raw.map((s) => s.offset));
      const segments: CaptionSegment[] = raw
        .map((s, i) => ({ text: cleanedTexts[i], offsetSeconds: offsetsSec[i] }))
        .filter((s) => s.text);

      return { text, lang, segments };
    } catch (err) {
      if (err instanceof YoutubeTranscriptNotAvailableLanguageError) continue;
      throw err;
    }
  }
  return null;
}

const MANUS_BASE_URL = 'https://api.manus.ai/v2';
const MANUS_POLL_INTERVAL_MS = 3_000;
const MANUS_MAX_WAIT_MS = 4 * 60 * 1000; // 호출부 maxDuration(보통 300초) 안에서 여유를 남긴 대기 상한

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

/**
 * Manus API(https://open.manus.im)로 유튜브 영상을 처음부터 끝까지 시청·청취시켜
 * 대본을 생성한다. Vercel 서버리스가 yt-dlp를 실행할 수 없는 문제를,
 * Manus의 에이전트 샌드박스(자체 브라우저/오디오 처리)에 위임해 우회한다.
 *
 * structured_output_schema는 쓰지 않는다 — 실측 결과, 별도 추출 단계가
 * "저작권 문제"를 이유로 동일한 내용을 거부하고 빈 값을 반환하는 경우가 있었다.
 * 반면 에이전트의 assistant_message 본문에는 정확한 대본이 그대로 남아있어,
 * 대화 메시지를 직접 읽어오는 방식이 더 안정적이다.
 *
 * ENV: MANUS_API_KEY
 */
export async function transcribeWithManus(canonicalUrl: string): Promise<string> {
  const apiKey = process.env.MANUS_API_KEY;
  if (!apiKey) {
    throw new ServiceUnavailableError('Manus API가 설정되지 않았습니다. (MANUS_API_KEY)');
  }

  const createRes = await fetch(`${MANUS_BASE_URL}/task.create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-manus-api-key': apiKey,
    },
    body: JSON.stringify({
      message: {
        content: [
          {
            type: 'text',
            text: [
              `다음 유튜브 영상을 처음부터 끝까지 듣고 한국어 대본을 작성해줘: ${canonicalUrl}`,
              '화자가 여러 명이면 이름이나 역할로 구분하고, [MM:SS - MM:SS] 타임스탬프 구간으로 섹션을 나눠줘.',
              '화자 구분이 어려우면 자연스러운 문단으로 정리해줘.',
              '진행 상황 안내나 서론 없이, 대본 내용 하나로만 한 번에 응답해줘.',
            ].join('\n'),
          },
        ],
      },
      hide_in_task_list: true,
      agent_profile: 'manus-1.6-lite',
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

  const deadline = Date.now() + MANUS_MAX_WAIT_MS;
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

  throw new Error('Manus 대본 생성이 시간 내에 끝나지 않았습니다.');
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
 * 대화 중 에이전트가 보낸 assistant_message를 시간순으로 이어붙여 최종 대본을 만든다.
 * 프롬프트로 "서론 없이" 요청해도 "작성을 시작하겠습니다" 류의 짧은 서론을 별도 메시지로
 * 보내는 경우가 있어, 타임스탬프([MM:SS)가 포함된 메시지가 하나라도 있으면 그것만 채택한다.
 * (화자 구분이 어려워 문단 형태로만 응답한 경우엔 타임스탬프가 없으므로 전체를 그대로 사용)
 */
function collectAssistantText(messages: ManusMessage[]): string {
  const parts = messages
    .filter((m) => m.type === 'assistant_message' && m.assistant_message?.content)
    .map((m) => m.assistant_message!.content.trim());
  const withTimestamps = parts.filter((p) => /\[\d{1,2}:\d{2}/.test(p));
  const chosen = withTimestamps.length > 0 ? withTimestamps : parts;
  const text = chosen.join('\n\n').trim();
  if (!text) throw new Error('Manus 응답에서 대본을 찾지 못했습니다.');
  return text;
}
