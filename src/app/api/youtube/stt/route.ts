import { NextRequest, NextResponse, after } from 'next/server';
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';
import { requirePaidAccess, isAdmin } from '@/lib/admin';
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

/**
 * 외부 오디오 추출 워커 호출.
 * Vercel 서버리스에서는 yt-dlp 바이너리 실행이 불가능하므로,
 * 별도 워커(Cloudflare Workers + R2 등)가 유튜브 URL을 받아
 * 공개 mp3/m4a URL과 길이(초)를 반환하도록 위임한다.
 *
 * ENV:
 *   YT_AUDIO_EXTRACTOR_URL   — 워커 엔드포인트 (POST {videoId})
 *   YT_AUDIO_EXTRACTOR_TOKEN — 워커 인증 토큰 (Authorization: Bearer …)
 */
async function extractAudio(
  videoId: string,
): Promise<{ audioUrl: string; durationSec: number | null }> {
  const endpoint = process.env.YT_AUDIO_EXTRACTOR_URL;
  const token = process.env.YT_AUDIO_EXTRACTOR_TOKEN;
  if (!endpoint || !token) {
    throw new ServiceUnavailableError(
      '오디오 추출 서비스가 설정되지 않았습니다. (YT_AUDIO_EXTRACTOR_URL/TOKEN)',
    );
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ videoId }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`오디오 추출 실패 (${res.status}).`);
  }
  const data = (await res.json()) as { audioUrl?: string; durationSec?: number };
  if (!data.audioUrl) throw new Error('오디오 URL을 받지 못했습니다.');
  return { audioUrl: data.audioUrl, durationSec: data.durationSec ?? null };
}

/**
 * CLOVA Speech URL 모드 호출.
 * ENV:
 *   CLOVA_SPEECH_INVOKE_URL — NCP CLOVA Speech 인보크 URL
 *   CLOVA_SPEECH_SECRET    — Secret Key
 */
async function transcribeWithClova(audioUrl: string, language: 'ko-KR' | 'en-US' = 'ko-KR'): Promise<string> {
  const invokeUrl = process.env.CLOVA_SPEECH_INVOKE_URL;
  const secret = process.env.CLOVA_SPEECH_SECRET;
  if (!invokeUrl || !secret) {
    throw new ServiceUnavailableError(
      'CLOVA Speech가 설정되지 않았습니다. (CLOVA_SPEECH_INVOKE_URL/SECRET)',
    );
  }

  const res = await fetch(`${invokeUrl.replace(/\/$/, '')}/recognizer/url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CLOVASPEECH-API-KEY': secret,
    },
    body: JSON.stringify({
      url: audioUrl,
      language,
      completion: 'sync', // 동기 결과 (긴 영상은 async + 폴링 권장이지만 1차 구현은 sync)
      wordAlignment: false,
      fullText: true,
    }),
    signal: AbortSignal.timeout(240_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CLOVA Speech 실패 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string; result?: string; segments?: Array<{ text: string }> };
  if (typeof data.text === 'string' && data.text.trim()) return data.text.trim();
  if (Array.isArray(data.segments) && data.segments.length > 0) {
    return data.segments.map((s) => s.text).join(' ').trim();
  }
  throw new Error('CLOVA Speech 응답에 텍스트가 없습니다.');
}

class ServiceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

async function hasActivePaidPlan(userId: string): Promise<boolean> {
  if (isAdmin(userId)) return true;
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('users')
      .select('subscription_plan, subscription_expires_at')
      .eq('id', userId)
      .maybeSingle();
    if (!data?.subscription_plan || !data?.subscription_expires_at) return false;
    const expires = new Date(data.subscription_expires_at).getTime();
    if (Number.isNaN(expires) || expires < Date.now()) return false;
    return data.subscription_plan === 'INFLUENCER' || data.subscription_plan === 'BLOGGER';
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  const auth = await requirePaidAccess(request);
  if (auth.error) return auth.error;

  if (!(await hasActivePaidPlan(auth.authUser.userId))) {
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

    // 3) STT 폴백
    try {
      const { audioUrl, durationSec } = await extractAudio(videoId);
      const sttText = await transcribeWithClova(audioUrl, 'ko-KR');
      result = {
        text: sttText,
        source: 'stt',
        lang: 'ko',
        durationSec,
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      if (err instanceof DOMException && err.name === 'TimeoutError') {
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
