import { NextRequest, NextResponse, after } from 'next/server';
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';
import { requirePaidAccess, hasActivePaidPlanByUserId } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5분 — STT 폴링 여유

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

interface VideoMeta {
  title: string;
  channel: string;
  thumbnail: string | null;
}

interface ExtractedResult {
  text: string;
  source: 'caption' | 'stt';
  lang: string | null;
  durationSec: number | null;
}

function extractVideoId(input: string): string | null {
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

async function fetchVideoMetadata(videoId: string): Promise<VideoMeta> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('oembed failed');
    const data = (await res.json()) as OEmbedResponse;
    return {
      title: data.title || `YouTube ${videoId}`,
      channel: data.author_name || '알 수 없음',
      thumbnail: data.thumbnail_url || null,
    };
  } catch {
    return { title: `YouTube ${videoId}`, channel: '알 수 없음', thumbnail: null };
  }
}

async function fetchCaption(videoId: string): Promise<{ text: string; lang: string } | null> {
  for (const lang of ['ko', 'en']) {
    try {
      const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      const text = segments
        .map((s) => s.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\[음악\]|\[Music\]/gi, '')
        .trim();
      if (text) return { text, lang };
    } catch (err) {
      if (err instanceof YoutubeTranscriptNotAvailableLanguageError) continue;
      throw err;
    }
  }
  return null;
}

const MANUS_BASE_URL = 'https://api.manus.ai/v2';
const MANUS_POLL_INTERVAL_MS = 3_000;
const MANUS_MAX_WAIT_MS = 4 * 60 * 1000; // maxDuration(300초) 안에서 caption 시도 등 여유를 남겨둔 대기 상한

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
async function transcribeWithManus(canonicalUrl: string): Promise<string> {
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

class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  const auth = await requirePaidAccess(request);
  if (auth.error) return auth.error;

  if (!(await hasActivePaidPlanByUserId(auth.authUser.userId))) {
    return NextResponse.json(
      { error: '구독 플랜이 필요합니다. 블로거+ 또는 인플루언서 플랜으로 업그레이드해주세요.' },
      { status: 402 },
    );
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const rawUrl = (body.url || '').trim();
  if (!rawUrl) {
    return NextResponse.json({ error: '유튜브 영상 URL을 입력해주세요.' }, { status: 400 });
  }

  const videoId = extractVideoId(rawUrl);
  if (!videoId) {
    return NextResponse.json(
      { error: '올바른 유튜브 URL이 아닙니다. 예: https://youtu.be/xxxxxxxxxxx' },
      { status: 400 },
    );
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 1) 메타데이터 + 자막 동시 시도
  let metadata: VideoMeta = { title: `YouTube ${videoId}`, channel: '알 수 없음', thumbnail: null };
  let captionResult: { text: string; lang: string } | null = null;
  let captionError: Error | null = null;

  const [meta, caption] = await Promise.allSettled([
    fetchVideoMetadata(videoId),
    fetchCaption(videoId),
  ]);
  if (meta.status === 'fulfilled') {
    metadata = meta.value;
  }
  if (caption.status === 'fulfilled') {
    captionResult = caption.value;
  } else {
    captionError = caption.reason instanceof Error ? caption.reason : new Error('caption fetch failed');
  }

  // 2) 자막 우선 사용
  let result: ExtractedResult;

  if (captionResult) {
    result = {
      text: captionResult.text,
      source: 'caption',
      lang: captionResult.lang,
      durationSec: null,
    };
  } else {
    // 자막 실패 사유 점검 — 처리 불가능한 경우는 즉시 422
    if (captionError instanceof YoutubeTranscriptVideoUnavailableError) {
      return NextResponse.json(
        { error: '영상을 찾을 수 없습니다. 비공개·삭제된 영상일 수 있습니다.' },
        { status: 422 },
      );
    }
    if (captionError instanceof YoutubeTranscriptTooManyRequestError) {
      return NextResponse.json(
        { error: '유튜브 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 },
      );
    }
    // YoutubeTranscriptDisabledError / NotAvailable* 는 STT 폴백 시도

    // 3) STT 폴백 (Manus API)
    try {
      const sttText = await transcribeWithManus(canonicalUrl);
      result = {
        text: sttText,
        source: 'stt',
        lang: 'ko',
        durationSec: null,
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      const isTimeout =
        (err instanceof DOMException && err.name === 'TimeoutError') ||
        (err instanceof Error && err.message.includes('시간 내에'));
      if (isTimeout) {
        return NextResponse.json(
          { error: 'STT 변환이 시간 내에 끝나지 않았습니다. 짧은 영상으로 다시 시도해주세요.' },
          { status: 504 },
        );
      }
      console.error('[youtube/stt] stt failed:', err);
      return NextResponse.json(
        {
          error:
            captionError instanceof YoutubeTranscriptDisabledError
              ? '자막이 비활성화되어 있고 음원 변환도 실패했습니다.'
              : '음원 변환에 실패했습니다.',
        },
        { status: 500 },
      );
    }
  }

  // 4) Supabase 기록 — 응답 후에 비동기 실행 (Vercel waitUntil 백킹). 실패해도 사용자 응답 영향 없음.
  const historyRow = {
    user_id: auth.authUser.userId,
    video_id: videoId,
    video_url: canonicalUrl,
    title: metadata.title,
    channel: metadata.channel,
    thumbnail_url: metadata.thumbnail,
    source: result.source,
    lang: result.lang,
    duration_sec: result.durationSec,
    transcription_text: result.text,
  };
  after(async () => {
    try {
      const supabase = createServiceClient();
      await supabase.from('youtube_stt_history').insert(historyRow);
    } catch (err) {
      console.error('[youtube/stt] supabase insert failed (non-fatal):', err);
    }
  });

  return NextResponse.json({
    text: result.text,
    source: {
      videoId,
      title: metadata.title,
      channel: metadata.channel,
      url: canonicalUrl,
      thumbnail: metadata.thumbnail,
      source: result.source,
      lang: result.lang,
      durationSec: result.durationSec,
    },
  });
}
