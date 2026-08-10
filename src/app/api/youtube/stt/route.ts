import { NextRequest, NextResponse, after } from 'next/server';
import { requirePaidPlan } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';
import {
  ServiceUnavailableError,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  extractVideoId,
  fetchCaption,
  fetchVideoMetadataOEmbed,
  transcribeWithManus,
  type OEmbedVideoMeta,
} from '@/lib/youtube-transcript';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5분 — STT 폴링 여유

type VideoMeta = OEmbedVideoMeta;

interface ExtractedResult {
  text: string;
  source: 'caption' | 'stt';
  lang: string | null;
  durationSec: number | null;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await aiAnalyzeLimiter.check(ip)) return rateLimitResponse();

  const auth = await requirePaidPlan(request);
  if (auth.error) return auth.error;

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
    fetchVideoMetadataOEmbed(videoId),
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
