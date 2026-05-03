import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from 'youtube-transcript';
import { requirePaidAccess, isAdmin } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase-server';
import { aiAnalyzeLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const MAX_TRANSCRIPT_CHARS = 80_000;

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

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const patterns = [
    /youtube\.com\/watch\?[^\s]*v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
    /youtube\.com\/v\/([A-Za-z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
}

async function fetchVideoMetadata(videoId: string): Promise<OEmbedResponse | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as OEmbedResponse;
  } catch {
    return null;
  }
}

async function fetchTranscriptWithFallback(videoId: string): Promise<{
  text: string;
  lang: string;
} | null> {
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

const SYSTEM_PROMPT = `당신은 유튜브 영상의 자막을 블로그 작성자가 참고할 수 있도록 정리해주는 보조 도구입니다.

[엄격한 원칙]
1. 영상 자막에 실제로 등장한 내용만 정리합니다. 자막에 없는 정보, 의견, 해석을 추가로 만들어내지 마세요.
2. 새로운 글을 "써주는" 것이 아닙니다. 영상의 내용을 정돈된 텍스트로 "정리"만 하세요.
3. 사실, 인용, 인물명, 수치는 자막에 나온 그대로 표기합니다. 자막이 불분명하면 "(원문 불명확)"으로 표시하세요.
4. 출처 표기를 위해 결과 마지막에는 항상 영상 정보를 포함합니다.

[출력 형식 — 마크다운]
# {영상 제목}

## 한 줄 요약
(영상 전체를 한 문장으로)

## 핵심 내용
- (불릿 3~6개, 영상의 주요 포인트)

## 자세한 정리
(영상의 흐름을 따라 단락 단위로 정리. 소제목 ### 활용 가능)

## 인상적인 인용 (있다면)
> (자막에서 발췌한 짧은 인용 1~3개. 인용은 짧게)

---
📺 출처
- 영상 제목: {제목}
- 채널: {채널명}
- 링크: {URL}

⚠️ 본 정리는 영상 내용을 요약·정돈한 것이며 모든 저작권은 원작자에게 있습니다. 블로그 게시 시 반드시 출처를 함께 표기해주세요.`;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI 서비스가 설정되지 않았습니다.' }, { status: 503 });
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const url = (body.url || '').trim();
  if (!url) {
    return NextResponse.json({ error: '유튜브 영상 URL을 입력해주세요.' }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: '올바른 유튜브 URL이 아닙니다. 예: https://youtu.be/xxxxxxxxxxx' },
      { status: 400 },
    );
  }

  // 1) 자막 + 메타데이터 병렬 조회
  let transcript: { text: string; lang: string } | null = null;
  let metadata: OEmbedResponse | null = null;

  try {
    [transcript, metadata] = await Promise.all([
      fetchTranscriptWithFallback(videoId),
      fetchVideoMetadata(videoId),
    ]);
  } catch (err) {
    if (err instanceof YoutubeTranscriptDisabledError) {
      return NextResponse.json(
        { error: '이 영상은 자막이 비활성화되어 정리할 수 없습니다.' },
        { status: 422 },
      );
    }
    if (err instanceof YoutubeTranscriptNotAvailableError) {
      return NextResponse.json(
        { error: '이 영상에는 한국어/영어 자막이 없어 정리할 수 없습니다.' },
        { status: 422 },
      );
    }
    if (err instanceof YoutubeTranscriptVideoUnavailableError) {
      return NextResponse.json(
        { error: '영상을 찾을 수 없습니다. 비공개·삭제된 영상일 수 있습니다.' },
        { status: 422 },
      );
    }
    if (err instanceof YoutubeTranscriptTooManyRequestError) {
      return NextResponse.json(
        { error: '유튜브 요청 한도에 도달했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 },
      );
    }
    console.error('[youtube-summary] transcript fetch failed:', err);
    return NextResponse.json(
      { error: '자막을 가져오지 못했습니다. 다른 영상을 시도해주세요.' },
      { status: 502 },
    );
  }

  if (!transcript) {
    return NextResponse.json(
      { error: '이 영상에는 한국어/영어 자막이 없어 정리할 수 없습니다.' },
      { status: 422 },
    );
  }

  const truncatedTranscript =
    transcript.text.length > MAX_TRANSCRIPT_CHARS
      ? transcript.text.slice(0, MAX_TRANSCRIPT_CHARS) + '\n\n[…자막이 너무 길어 일부만 처리됨]'
      : transcript.text;

  const videoTitle = metadata?.title || '(제목 정보 없음)';
  const channelName = metadata?.author_name || '(채널 정보 없음)';
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 2) Claude 호출
  try {
    const anthropic = new Anthropic({ apiKey });
    const userPrompt = `다음은 유튜브 영상의 자막입니다. 위의 출력 형식에 따라 정리해주세요.

[영상 정보]
- 제목: ${videoTitle}
- 채널: ${channelName}
- 링크: ${videoUrl}
- 자막 언어: ${transcript.lang === 'ko' ? '한국어' : '영어'}

[자막 원문]
${truncatedTranscript}`;

    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = result.content.find((b) => b.type === 'text');
    const summary = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    if (!summary) {
      return NextResponse.json(
        { error: 'AI 응답을 받지 못했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      summary,
      source: {
        videoId,
        title: videoTitle,
        channel: channelName,
        url: videoUrl,
        thumbnail: metadata?.thumbnail_url || null,
        transcriptLang: transcript.lang,
        transcriptLength: transcript.text.length,
        truncated: transcript.text.length > MAX_TRANSCRIPT_CHARS,
      },
    });
  } catch (err) {
    console.error('[youtube-summary] Claude call failed:', err);
    return NextResponse.json(
      { error: 'AI 정리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 502 },
    );
  }
}
